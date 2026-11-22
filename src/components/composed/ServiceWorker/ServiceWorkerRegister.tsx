"use client";

import { useEffect } from "react";
import { rememberInstallPrompt } from "@/lib/install-prompt";

/**
 * Registers /sw.js (offline screen, cached app files) in production, and keeps the browser's
 * "install this app" prompt for later (the setup wizard offers it). Renders nothing.
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault(); // show our own Install button instead of the browser's mini bar
            rememberInstallPrompt(e);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);

        if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
                console.warn("[sw] registration failed", err);
            });
        }
        return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    }, []);

    return null;
}
