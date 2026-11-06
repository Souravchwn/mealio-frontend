import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/**
 * Public site address, from NEXT_PUBLIC_APP_URL (see DEPLOY.md). Canonical URLs, the sitemap,
 * robots.txt and share cards are all built from it, so production must set the final https address.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export type Locale = (typeof routing.locales)[number];

/** The only pages search engines should index. Everything else (app, auth, console, Mini App) is noindex. */
export const INDEXABLE_PATHS = ["", "/support", "/privacy", "/terms"] as const;

const OG_LOCALE: Record<Locale, string> = { en: "en_US", bn: "bn_BD" };

/** hreflang map for one path, relative to metadataBase. */
export function languageAlternates(path: string): Record<string, string> {
    const languages: Record<string, string> = {};
    for (const l of routing.locales) languages[l] = `/${l}${path}`;
    languages["x-default"] = `/${routing.defaultLocale}${path}`;
    return languages;
}

/** Full metadata for an indexable public page: title, description, canonical, hreflang, Open Graph. */
export function publicPageMetadata(opts: {
    locale: Locale;
    path: (typeof INDEXABLE_PATHS)[number];
    title: string;
    description: string;
    /** Use the title as is, without the "| Manager Babu" template. */
    absoluteTitle?: boolean;
    siteName: string;
}): Metadata {
    const url = `/${opts.locale}${opts.path}`;
    const fullTitle = opts.absoluteTitle ? opts.title : `${opts.title} | ${opts.siteName}`;
    // A page's own openGraph replaces the inherited one, so name the locale's share card
    // (src/app/[locale]/opengraph-image.tsx) explicitly.
    const image = { url: `/${opts.locale}/opengraph-image`, width: 1200, height: 630, alt: fullTitle };
    return {
        title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
        description: opts.description,
        alternates: { canonical: url, languages: languageAlternates(opts.path) },
        openGraph: {
            type: "website",
            siteName: opts.siteName,
            title: fullTitle,
            description: opts.description,
            url,
            locale: OG_LOCALE[opts.locale],
            alternateLocale: routing.locales.filter((l) => l !== opts.locale).map((l) => OG_LOCALE[l]),
            images: [image],
        },
        twitter: { card: "summary_large_image", title: fullTitle, description: opts.description, images: [image.url] },
    };
}
