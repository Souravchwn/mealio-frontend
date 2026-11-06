import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Private pages stay crawlable on purpose: they answer with `X-Robots-Tag: noindex`
 * (next.config.ts), which a crawler can only see if robots.txt lets it fetch the page.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/api-docs"] }],
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
