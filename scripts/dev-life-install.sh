#!/usr/bin/env bash
#
# Put the dev-life generator on a timer.
#
# Two systemd units rather than cron, for one reason that matters: `journalctl -u` gives
# the last run's output with a timestamp and an exit code. A cron job that quietly stops
# working looks exactly like a dev environment where nobody happens to be training.
#
#   gymos-dev-life.timer        every 5 minutes — sessions start, sets get ticked, people react
#   gymos-dev-life-prune.timer  daily at 04:15 — drops history past the retention window
#
# The tick is a short-lived process: it starts, does a bounded amount of work and exits,
# so nothing is resident between runs. Measured at 0.3–1.1s per run.
#
# Usage, on the host:  bash dev-life-install.sh [--interval 5min] [--retention 150]

set -euo pipefail

CONTAINER="${DEV_API_CONTAINER:-gymos-api-dev}"
INTERVAL="5min"
RETENTION="150"

while [ $# -gt 0 ]; do
    case "$1" in
        --interval) INTERVAL="$2"; shift 2 ;;
        --retention) RETENTION="$2"; shift 2 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "Refusing to install: container $CONTAINER does not exist." >&2
    exit 2
fi

# NOTE: the heredocs below are intentionally UNQUOTED so ${CONTAINER} and ${RETENTION}
# expand here. Every OTHER $ that must survive into the unit has to be escaped — a bare
# $(...) would be executed at install time and its answer frozen into the file.
write_unit() {
    local path="$1"
    cat > "$path"
    echo "  wrote $path"
}

write_unit /etc/systemd/system/gymos-dev-life.service <<UNIT
[Unit]
Description=GymOS dev environment — simulate a few minutes of life
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
# Skipping is not failing. Every push to develop restarts the API container, and a tick
# that fires during that window used to die with "cannot exec in a stopped container" —
# which put a red FAILED line in the journal for something entirely routine, and made a
# real failure indistinguishable from deploy noise.
#
# DEV_LIFE=1 is the deliberate confirmation the tool demands; the container's own
# DATABASE_URL already points at the development database and is checked independently.
ExecStart=/bin/sh -c '    if [ "\$(/usr/bin/docker inspect -f {{.State.Running}} ${CONTAINER} 2>/dev/null)" != "true" ]; then         echo "${CONTAINER} is not running (deploy in progress?) — skipping this tick";         exit 0;     fi;     exec /usr/bin/docker exec -e DEV_LIFE=1 ${CONTAINER} node dist/dev-life/cli.js tick'
TimeoutStartSec=180
UNIT

write_unit /etc/systemd/system/gymos-dev-life.timer <<UNIT
[Unit]
Description=Run the GymOS dev-life tick every ${INTERVAL}

[Timer]
OnBootSec=3min
OnUnitActiveSec=${INTERVAL}
# Without this every timer on the box fires on the same second after a reboot.
RandomizedDelaySec=30
Unit=gymos-dev-life.service

[Install]
WantedBy=timers.target
UNIT

write_unit /etc/systemd/system/gymos-dev-life-prune.service <<UNIT
[Unit]
Description=GymOS dev environment — drop generated history past the retention window
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c '    if [ "\$(/usr/bin/docker inspect -f {{.State.Running}} ${CONTAINER} 2>/dev/null)" != "true" ]; then         echo "${CONTAINER} is not running — skipping this prune";         exit 0;     fi;     exec /usr/bin/docker exec -e DEV_LIFE=1 ${CONTAINER} node dist/dev-life/cli.js prune --retention=${RETENTION}'
TimeoutStartSec=600
UNIT

write_unit /etc/systemd/system/gymos-dev-life-prune.timer <<UNIT
[Unit]
Description=Daily prune of GymOS dev-life history

[Timer]
OnCalendar=*-*-* 04:15:00
Persistent=true
Unit=gymos-dev-life-prune.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now gymos-dev-life.timer gymos-dev-life-prune.timer >/dev/null
echo
systemctl list-timers --no-pager 'gymos-dev-life*' | head -5
echo
echo "logs:  journalctl -u gymos-dev-life.service -n 20 --no-pager"
