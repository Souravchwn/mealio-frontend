"use client";

/**
 * A thin progress line along the top of the screen while the person waits: a save or delete
 * is on its way to the server (src/lib/api.ts counts those), or a link to another page was
 * tapped and that page has not arrived yet. It appears only after a short delay, so quick
 * actions do not flash it.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isActive, onActivityChange, startActivity } from "@/lib/activity.client";
import styles from "./ActivityBar.module.css";

const SHOW_AFTER_MS = 120;
/** A page change that never completes (e.g. the link was cancelled) must not leave the bar on */
const NAV_TIMEOUT_MS = 10_000;

let endNavigation: (() => void) | null = null;
let navTimer: ReturnType<typeof setTimeout> | null = null;

function stopNavigation() {
    endNavigation?.();
    endNavigation = null;
    if (navTimer) clearTimeout(navTimer);
    navTimer = null;
}

export function ActivityBar() {
    const busy = useSyncExternalStore(onActivityChange, isActive, () => false);
    const [visible, setVisible] = useState(false);
    const pathname = usePathname();

    // Show after a short delay; hide at once
    useEffect(() => {
        if (!busy) {
            const id = setTimeout(() => setVisible(false), 0);
            return () => clearTimeout(id);
        }
        const id = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
        return () => clearTimeout(id);
    }, [busy]);

    // A new page arrived: the navigation is over
    useEffect(() => {
        stopNavigation();
    }, [pathname]);

    // Taps on links to another page of this site start a navigation
    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = (e.target as Element | null)?.closest?.("a");
            if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
            const href = a.getAttribute("href");
            if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
            const url = new URL(href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname) return;
            stopNavigation();
            endNavigation = startActivity();
            navTimer = setTimeout(stopNavigation, NAV_TIMEOUT_MS);
        }
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, []);

    return <div className={styles.bar} data-visible={visible} role="presentation" aria-hidden />;
}
