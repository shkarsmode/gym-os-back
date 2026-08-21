/**
 * "When does this box need to get bigger?"
 *
 * The generator exists to make the dev environment busy, and a busy environment costs
 * disk, memory and CPU on a machine that is also running production and five unrelated
 * projects. So the same tool that creates the load also has to answer, from MEASUREMENTS
 * rather than from a guess, how much of the box it is using and how long the current plan
 * lasts.
 *
 * Everything here is pure arithmetic over numbers read from the host and from Postgres.
 * The judgement is deliberately conservative: it reports the FIRST resource to run out,
 * because that is the one that will actually page somebody.
 */

export interface TableStat {
    name: string;
    rows: number;
    /** Total relation size — heap + indexes + toast. */
    bytes: number;
}

export interface HostStat {
    diskTotalBytes: number;
    diskUsedBytes: number;
    memTotalMb: number;
    memAvailableMb: number;
    swapUsedMb: number;
    vcpu: number;
    loadAvg1: number;
}

export interface GrowthInput {
    /** Sessions the simulated population produces in a day, at steady state. */
    workoutsPerDay: number;
    /** Measured bytes per workout, across every table a workout touches. */
    bytesPerWorkout: number;
    /** How long generated history is kept before `prune` removes it. */
    retentionDays: number;
}

export const GIB = 1024 ** 3;
export const MIB = 1024 ** 2;

/**
 * Bytes a single workout costs, measured rather than assumed.
 *
 * Divides the total size of every workout-shaped table by the number of workouts. Index
 * and toast overhead is therefore included, which is the whole point — the naive estimate
 * (sum of column widths) is routinely off by 3x once indexes are counted.
 */
export function bytesPerWorkout(tables: TableStat[], workoutCount: number): number {
    if (workoutCount <= 0) {
        return 0;
    }
    const workoutShaped = new Set([
        "Workout", "WorkoutExercise", "WorkoutSet", "SupersetGroup", "CardioSession",
        "PersonalRecord", "FeedReaction", "FeedComment", "Notification"
    ]);
    const total = tables
        .filter((table) => workoutShaped.has(table.name))
        .reduce((sum, table) => sum + table.bytes, 0);
    return Math.round(total / workoutCount);
}

/**
 * Where the database settles.
 *
 * With pruning switched on, growth is NOT unbounded: the size converges on whatever fits
 * inside the retention window, plus the fixed cost of the population and the catalogue.
 * Reporting the steady state rather than a growth rate is the honest answer, because
 * "12 MB/month for ever" would be wrong.
 */
export function steadyStateBytes(input: GrowthInput, fixedBytes: number): number {
    return fixedBytes + input.workoutsPerDay * input.retentionDays * input.bytesPerWorkout;
}

export function dailyGrowthBytes(input: GrowthInput): number {
    return input.workoutsPerDay * input.bytesPerWorkout;
}

export type Severity = "ok" | "watch" | "upgrade";

export interface ResourceVerdict {
    resource: "disk" | "memory" | "cpu";
    severity: Severity;
    headline: string;
    detail: string;
    /** Days until this resource crosses its own threshold, or null when it never does. */
    daysToThreshold: number | null;
}

/**
 * Disk: the one the generator can actually exhaust.
 *
 * Threshold is 80% rather than 100% — Postgres needs free space to VACUUM, and a full
 * disk on a box hosting production is not a "watch" situation.
 */
export function judgeDisk(host: HostStat, growth: GrowthInput, currentDbBytes: number, fixedBytes: number): ResourceVerdict {
    const limit = host.diskTotalBytes * 0.8;
    const free = limit - host.diskUsedBytes;
    const settled = steadyStateBytes(growth, fixedBytes);
    const stillToGrow = Math.max(0, settled - currentDbBytes);
    const perDay = dailyGrowthBytes(growth);
    // With pruning, the DB stops growing once the retention window is full. If the whole
    // settled size fits in the free space, disk is simply never the constraint.
    const daysToThreshold = stillToGrow > free && perDay > 0 ? Math.floor(free / perDay) : null;
    const severity: Severity = daysToThreshold === null
        ? (host.diskUsedBytes / host.diskTotalBytes > 0.75 ? "watch" : "ok")
        : daysToThreshold < 30 ? "upgrade" : daysToThreshold < 120 ? "watch" : "ok";
    return {
        resource: "disk",
        severity,
        headline: daysToThreshold === null
            ? `never — the dev data settles at ${formatBytes(settled)} inside the retention window`
            : `${daysToThreshold} days to the 80% mark`,
        detail: `used ${formatBytes(host.diskUsedBytes)} of ${formatBytes(host.diskTotalBytes)}`
            + ` · dev db ${formatBytes(currentDbBytes)} → settles at ${formatBytes(settled)}`
            + ` · +${formatBytes(perDay)}/day until then`,
        daysToThreshold
    };
}

/**
 * Memory: judged on what is AVAILABLE, and on whether the box is already swapping.
 *
 * Swap in use is the signal that matters. A Hetzner CX22 will happily run at 95% memory
 * and simply get slower and slower, so "free RAM" alone under-reports the problem.
 */
export function judgeMemory(host: HostStat, tickPeakMb: number): ResourceVerdict {
    const afterTick = host.memAvailableMb - tickPeakMb;
    const swapping = host.swapUsedMb > 256;
    const severity: Severity = afterTick < 200 || host.swapUsedMb > 768
        ? "upgrade"
        : afterTick < 600 || swapping ? "watch" : "ok";
    return {
        resource: "memory",
        severity,
        headline: `${Math.round(afterTick)} MB free while a tick runs`,
        detail: `available ${Math.round(host.memAvailableMb)} MB of ${Math.round(host.memTotalMb)} MB`
            + ` · a tick peaks at ~${tickPeakMb} MB · swap in use ${Math.round(host.swapUsedMb)} MB`,
        daysToThreshold: null
    };
}

/**
 * CPU: only ever a "watch", because the generator's own load is a few seconds per tick.
 *
 * Reported anyway so that a box already saturated by its OTHER tenants is visible here
 * rather than discovered when the API starts timing out.
 */
export function judgeCpu(host: HostStat): ResourceVerdict {
    const perCore = host.loadAvg1 / Math.max(host.vcpu, 1);
    const severity: Severity = perCore > 0.9 ? "upgrade" : perCore > 0.65 ? "watch" : "ok";
    return {
        resource: "cpu",
        severity,
        headline: `load ${host.loadAvg1.toFixed(2)} on ${host.vcpu} vCPU (${Math.round(perCore * 100)}%)`,
        detail: perCore > 0.65
            ? "sustained above two thirds — the generator is not the cause, but it is not helping"
            : "comfortable",
        daysToThreshold: null
    };
}

export interface CapacityReport {
    verdicts: ResourceVerdict[];
    overall: Severity;
    recommendation: string;
}

export function capacityReport(
    host: HostStat,
    growth: GrowthInput,
    currentDbBytes: number,
    fixedBytes: number,
    tickPeakMb: number
): CapacityReport {
    const verdicts = [
        judgeDisk(host, growth, currentDbBytes, fixedBytes),
        judgeMemory(host, tickPeakMb),
        judgeCpu(host)
    ];
    const rank: Record<Severity, number> = { ok: 0, watch: 1, upgrade: 2 };
    const overall = verdicts.reduce<Severity>(
        (worst, verdict) => (rank[verdict.severity] > rank[worst] ? verdict.severity : worst),
        "ok"
    );
    const pressing = verdicts.filter((verdict) => verdict.severity !== "ok").map((verdict) => verdict.resource);
    const recommendation = overall === "ok"
        ? "Stay on CX22. Nothing here is close."
        : overall === "watch"
            ? `Stay on CX22 for now, but watch ${pressing.join(" and ")}.`
            + " Re-run `dev-life stats` after any change to the tick rate or the population."
            : `Move to CX32 (4 vCPU / 8 GB / 80 GB) — ${pressing.join(" and ")} ${pressing.length > 1 ? "are" : "is"} out of headroom.`
            + " Alternatively cut the population or shorten the retention window first; both are one flag.";
    return { verdicts, overall, recommendation };
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes)) {
        return "—";
    }
    if (Math.abs(bytes) >= GIB) {
        return `${(bytes / GIB).toFixed(2)} GB`;
    }
    if (Math.abs(bytes) >= MIB) {
        return `${(bytes / MIB).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} kB`;
}
