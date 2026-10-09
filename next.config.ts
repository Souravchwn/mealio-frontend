import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. The login token lives in localStorage, so the main
 * defence against token theft is not letting foreign scripts run at all.
 * Next.js needs inline scripts for hydration ('unsafe-inline'); dev mode also
 * needs 'unsafe-eval' for fast refresh.
 */
function buildCsp(opts: { scripts?: string; frameAncestors: string }) {
    return [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${opts.scripts ? ` ${opts.scripts}` : ""}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
        `frame-ancestors ${opts.frameAncestors}`,
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
    ].join("; ");
}

const commonHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const securityHeaders = [
    { key: "Content-Security-Policy", value: buildCsp({ frameAncestors: "'self'" }) },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ...commonHeaders,
];

/**
 * The Telegram Mini App page only: it must load Telegram's script and be shown inside Telegram
 * (Telegram Web opens Mini Apps in an iframe). No X-Frame-Options here; frame-ancestors decides.
 * It holds no web login token, so a wider frame rule exposes nothing.
 */
const telegramAppHeaders = [
    {
        key: "Content-Security-Policy",
        value: buildCsp({ scripts: "https://telegram.org", frameAncestors: "'self' https://web.telegram.org https://*.telegram.org" }),
    },
    ...commonHeaders,
];

const nextConfig: NextConfig = {
    poweredByHeader: false,
    async headers() {
        return [
            // Every page except the Mini App keeps the strict rules
            { source: "/", headers: securityHeaders },
            { source: "/:path((?!en/tg$|bn/tg$).*)", headers: securityHeaders },
            { source: "/:locale(en|bn)/tg", headers: telegramAppHeaders },
            // Never cache API answers in shared caches
            { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
        ];
    },
};

export default withNextIntl(nextConfig);
