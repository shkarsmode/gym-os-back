import { Response } from "express";
import { BINDING_COOKIE, ConsentResult, PageResult, RedirectResult } from "./oauth.service";

const SCOPE_LABELS: Record<string, string> = {
    "gymos.read": "Читати тренування, вправи, вагу тіла, шаблони та журнал змін",
    "gymos.write": "Планувати й змінювати заплановані тренування, записувати підходи та вагу"
};

const STYLE = [
    ":root{color-scheme:light dark;--bg:#f5f6f8;--card:#fff;--text:#14161a;--muted:#5d6470;--line:#dde1e7;--accent:#2f6fec;--warn:#9a6300}",
    "@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--text:#e8eaed;--muted:#a3a9b4;--line:#2a2f3a;--accent:#4f8cff;--warn:#d9a441}}",
    "body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
    "main{max-width:440px;margin:0 auto;padding:40px 16px}",
    "section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px}",
    "h1{font-size:21px;margin:0 0 12px}p{margin:8px 0;color:var(--muted)}ul{margin:12px 0;padding-left:20px}",
    "strong{color:var(--text)}.warn{color:var(--warn);font-size:14px}",
    "button{display:block;width:100%;margin-top:10px;padding:12px;border-radius:10px;font:inherit;cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--text)}",
    "button.primary{background:var(--accent);border-color:var(--accent);color:#fff}"
].join("");

export function escapeHtml(value: string): string {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function layout(title: string, body: string): string {
    return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main><section>${body}</section></main></body></html>`;
}

export function renderMessage(title: string, message: string): string {
    return layout(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`);
}

export function renderConsent(consent: ConsentResult): string {
    const items = consent.scopes
        .filter((scope) => SCOPE_LABELS[scope])
        .map((scope) => `<li>${escapeHtml(SCOPE_LABELS[scope])}</li>`)
        .join("");
    const hidden = `<input type="hidden" name="request" value="${escapeHtml(consent.requestId)}"><input type="hidden" name="csrf" value="${escapeHtml(consent.csrf)}">`;
    const write = consent.scopes.includes("gymos.write")
        ? `<button class="primary" type="submit" name="decision" value="write">Дозволити читання і запис</button>`
        : "";
    const read = `<button class="${write ? "" : "primary"}" type="submit" name="decision" value="read">Лише читання</button>`;
    return layout("Підключення до GymOS", [
        `<h1>Підключити ${escapeHtml(consent.clientName)} до GymOS?</h1>`,
        `<p>Акаунт: <strong>${escapeHtml(consent.email)}</strong></p>`,
        `<p>Повернення на: <strong>${escapeHtml(new URL(consent.redirectOrigin).host)}</strong></p>`,
        `<ul>${items}</ul>`,
        `<p class="warn">Дозволяйте, лише якщо ви щойно самі натиснули «Connect» у своєму Claude.</p>`,
        `<form method="post" action="/mcp/oauth/consent">${hidden}${write}${read}<button type="submit" name="decision" value="deny">Відхилити</button></form>`
    ].join(""));
}

export function sendHtml(response: Response, status: number, html: string, formActionOrigin?: string) {
    const formAction = ["'self'", formActionOrigin].filter(Boolean).join(" ");
    response.status(status);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader(
        "Content-Security-Policy",
        `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`
    );
    response.send(html);
}

export function sendResult(response: Response, result: PageResult | RedirectResult | ConsentResult, secureCookies: boolean) {
    if (result.kind === "page") {
        sendHtml(response, result.status, renderMessage(result.title, result.message));
        return;
    }
    if (result.kind === "consent") {
        sendHtml(response, 200, renderConsent(result), result.redirectOrigin);
        return;
    }
    if (result.clearBinding) {
        response.clearCookie(BINDING_COOKIE, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/" });
    }
    response.setHeader("Cache-Control", "no-store");
    response.redirect(302, result.location);
}
