import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { INDEXABLE_PATHS, SITE_URL, languageAlternates } from "@/lib/seo";

/** Public pages only, in every locale, each listing its language alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
    return INDEXABLE_PATHS.flatMap((path) => {
        const languages = Object.fromEntries(
            Object.entries(languageAlternates(path)).map(([l, p]) => [l, `${SITE_URL}${p}`]),
        );
        return routing.locales.map((locale) => ({
            url: `${SITE_URL}/${locale}${path}`,
            changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
            priority: path === "" ? 1 : 0.5,
            alternates: { languages },
        }));
    });
}
