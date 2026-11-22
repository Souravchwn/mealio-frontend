/**
 * install-prompt.ts — Client-only. Keeps the browser's "install this app" event (Chrome, Edge,
 * Samsung Internet on Android and desktop) so a button can show it later. Safari has no such
 * event: there people use Share → Add to Home Screen, which the setup wizard explains.
 */

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function rememberInstallPrompt(e: Event) {
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
}

/** True when the browser has offered to install the app and it has not been used yet. */
export function canInstall(): boolean {
    return deferred !== null;
}

/** True when the app is already open as an installed app (home screen, standalone window). */
export function isInstalled(): boolean {
    if (typeof window === "undefined") return false;
    return (
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

/** Show the browser's install dialog. Resolves to true when the person installed the app. */
export async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    listeners.forEach((fn) => fn());
    return outcome === "accepted";
}

/** Re-render when the install prompt becomes available or is used. */
export function onInstallPromptChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
