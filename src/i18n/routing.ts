import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
    locales: ["en", "bn"],
    defaultLocale: "en",
    // hreflang comes from each public page's metadata (src/lib/seo.ts) against NEXT_PUBLIC_APP_URL.
    // The middleware's own Link header used the request host and pointed x-default at "/", conflicting with it.
    alternateLinks: false,
});
