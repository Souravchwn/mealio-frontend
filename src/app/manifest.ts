import type { MetadataRoute } from "next";

/** Lets members add Mealtill to their phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Mealtill",
        short_name: "Mealtill",
        description: "Meals, bazaar and money, sorted for your mess.",
        start_url: "/en/overview",
        scope: "/",
        display: "standalone",
        background_color: "#0b0a14",
        theme_color: "#0b0a14",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
