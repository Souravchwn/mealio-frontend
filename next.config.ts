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
const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
].join("; ");

const securityHeaders = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
    poweredByHeader: false,
    async headers() {
        return [
            { source: "/:path*", headers: securityHeaders },
            // Never cache API answers in shared caches
            { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
        ];
    },
};

export default withNextIntl(nextConfig);
