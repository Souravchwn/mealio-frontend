import type { MetadataRoute } from "next";

/**
 * Lets members add Mealtill to their phone's home screen and open it like an app.
 * Links go through /go/<page>, which opens the page in the member's own language.
 * Shortcuts appear on a long press of the app icon (Android, Windows, macOS).
 */
export default function manifest(): MetadataRoute.Manifest {
    const shortcut = (name: string, short_name: string, page: string, icon: string, description: string) => ({
        name,
        short_name,
        description,
        url: `/go/${page}`,
        icons: [{ src: `/icons/shortcuts/${icon}.png`, sizes: "96x96", type: "image/png" }],
    });

    return {
        id: "/",
        name: "Mealtill",
        short_name: "Mealtill",
        description: "Meals, bazaar and money, sorted for your mess.",
        start_url: "/go/overview",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b0a14",
        theme_color: "#0b0a14",
        categories: ["finance", "food", "lifestyle"],
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
            shortcut("Today's meals · আজকের মিল", "Meals", "meals", "meals", "Turn your meals on or off"),
            shortcut("Add bazaar · বাজার যোগ", "Bazaar", "expenses", "bazaar", "Record a bazaar trip or a deposit"),
            shortcut("My summary · আমার হিসাব", "My summary", "my-summary", "summary", "Your balance and monthly statement"),
            shortcut("Settings · সেটিংস", "Settings", "settings", "settings", "Meal preferences and mess settings"),
        ],
    };
}
