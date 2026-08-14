import {
    MEDIA_INDEX_FETCH_TIMEOUT_MS,
    MEDIA_INDEX_SCHEMA_VERSION,
    MEDIA_INDEX_SITEMAP_PATTERN,
    MEDIA_INDEX_SOURCE_URL,
    MEDIA_SENTINEL_URLS
} from "./media.constants";
import { MediaIndexEntry, MediaIndexSnapshot } from "./media.types";

// Harvests the slug -> gif mapping straight out of fitnessprogramer.com's own sitemap.
// This module is the single reason the hallucination invariant holds: every URL the
// feature can ever return is a verbatim <image:loc> string copied from here, so there is
// no code path anywhere that builds a media URL out of an exercise name.
//
// No Nest imports on purpose - scripts/build-media-index.ts runs this under tsx with no
// application context, and media-index.service.ts calls the same code at runtime.

const URL_BLOCK = /<url>([\s\S]*?)<\/url>/g;
const LOC = /<loc>([\s\S]*?)<\/loc>/;
const IMAGE_LOC = /<image:loc>([\s\S]*?)<\/image:loc>/g;
const EXERCISE_PAGE = /\/exercise\/([^/?#]+)\/?/i;

const SENTINELS = new Set(MEDIA_SENTINEL_URLS);

// A polite, honest UA. Some WordPress/LiteSpeed setups answer 403 to a bare fetch UA.
const USER_AGENT = "GymOS-media-index/1.0 (+https://gym-os-beryl.vercel.app)";

export function decodeXmlText(value: string): string {
    return String(value || "")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, "&")
        .trim();
}

export function titleCaseSlug(slug: string): string {
    return String(slug || "")
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function isGifUrl(url: string): boolean {
    return /\.gif(\?|#|$)/i.test(url);
}

// A <url> can carry several <image:image> children (measured: 200 urls, 407 image locs
// on sitemap1). Take the first one, but promote a gif over a static diagram when the
// page offers both, because a "muscles worked" png is never what the user wanted.
function pickImage(images: string[]): string | null {
    const usable = images.filter((image) => /^https?:\/\//i.test(image) && !SENTINELS.has(image));
    if (!usable.length) {
        return null;
    }
    return usable.find(isGifUrl) || usable[0];
}

export function parseExerciseSitemap(xml: string): MediaIndexEntry[] {
    const entries: MediaIndexEntry[] = [];
    URL_BLOCK.lastIndex = 0;
    let block: RegExpExecArray | null = URL_BLOCK.exec(xml);

    while (block) {
        const body = block[1];
        const pageMatch = LOC.exec(body);
        const page = pageMatch ? decodeXmlText(pageMatch[1]) : "";
        const slugMatch = EXERCISE_PAGE.exec(page);

        if (slugMatch) {
            const images: string[] = [];
            IMAGE_LOC.lastIndex = 0;
            let image: RegExpExecArray | null = IMAGE_LOC.exec(body);
            while (image) {
                images.push(decodeXmlText(image[1]));
                image = IMAGE_LOC.exec(body);
            }

            const url = pickImage(images);
            if (url) {
                const slug = decodeURIComponent(slugMatch[1]).toLowerCase();
                entries.push({ slug, name: titleCaseSlug(slug), page, url, isGif: isGifUrl(url) });
            }
        }

        block = URL_BLOCK.exec(xml);
    }

    return entries;
}

export function parseSitemapIndex(xml: string): string[] {
    const locations: string[] = [];
    const pattern = /<loc>([\s\S]*?)<\/loc>/g;
    let match: RegExpExecArray | null = pattern.exec(xml);

    while (match) {
        const location = decodeXmlText(match[1]);
        if (MEDIA_INDEX_SITEMAP_PATTERN.test(location)) {
            locations.push(location);
        }
        match = pattern.exec(xml);
    }

    return locations;
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
    const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/xml,text/xml,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
        throw new Error(`${url} answered ${response.status}`);
    }
    return await response.text();
}

// Fetches the whole index. The seven sitemap files go out in parallel (measured 858 ms,
// 0.51 MB total), which is why this is never awaited on the request path.
export async function fetchMediaIndexSnapshot(timeoutMs = MEDIA_INDEX_FETCH_TIMEOUT_MS): Promise<MediaIndexSnapshot> {
    const indexXml = await fetchText(MEDIA_INDEX_SOURCE_URL, timeoutMs);
    const sitemaps = parseSitemapIndex(indexXml);
    if (!sitemaps.length) {
        throw new Error("sitemap index listed no exercise sitemaps");
    }

    const documents = await Promise.all(sitemaps.map((location) => fetchText(location, timeoutMs)));

    // Dedupe by slug: the same exercise can appear in more than one sitemap file after
    // the site re-paginates, and a duplicated slug would double its odds of being ranked.
    const bySlug = new Map<string, MediaIndexEntry>();
    for (const document of documents) {
        for (const entry of parseExerciseSitemap(document)) {
            const existing = bySlug.get(entry.slug);
            if (!existing || (!existing.isGif && entry.isGif)) {
                bySlug.set(entry.slug, entry);
            }
        }
    }

    const entries = [...bySlug.values()].sort((left, right) => left.slug.localeCompare(right.slug));

    return {
        schemaVersion: MEDIA_INDEX_SCHEMA_VERSION,
        source: MEDIA_INDEX_SOURCE_URL,
        fetchedAt: new Date().toISOString(),
        count: entries.length,
        entries
    };
}
