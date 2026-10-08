"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ApiError } from "@/lib/api";
import type { PlatformAdmin } from "@/types/platform";

/*
 * Platform console session. Stored under its own keys, completely separate
 * from the mess app session, so signing in to one never signs in to the other.
 */
const TOKEN_KEY = "mealio.platform.token";
const ADMIN_KEY = "mealio.platform.admin";

interface ConsoleAuthValue {
    token: string | null;
    admin: PlatformAdmin | null;
    ready: boolean;
    signIn: (token: string, admin: PlatformAdmin) => void;
    signOut: () => void;
}

const ConsoleAuthContext = createContext<ConsoleAuthValue | undefined>(undefined);
const noopSubscribe = () => () => {};

function read<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

export function ConsoleAuthProvider({ children }: { children: ReactNode }) {
    const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
    const [token, setToken] = useState<string | null>(() => (typeof window !== "undefined" ? read<string>(TOKEN_KEY) : null));
    const [admin, setAdmin] = useState<PlatformAdmin | null>(() => (typeof window !== "undefined" ? read<PlatformAdmin>(ADMIN_KEY) : null));

    const signIn = useCallback((t: string, a: PlatformAdmin) => {
        setToken(t);
        setAdmin(a);
        try {
            localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
            localStorage.setItem(ADMIN_KEY, JSON.stringify(a));
        } catch {
            /* storage blocked: the session lasts until the tab closes */
        }
    }, []);

    const signOut = useCallback(() => {
        setToken(null);
        setAdmin(null);
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(ADMIN_KEY);
        } catch {
            /* ignore */
        }
    }, []);

    return (
        <ConsoleAuthContext.Provider
            value={{ token: hydrated ? token : null, admin: hydrated ? admin : null, ready: hydrated, signIn, signOut }}
        >
            {children}
        </ConsoleAuthContext.Provider>
    );
}

export function useConsoleAuth() {
    const ctx = useContext(ConsoleAuthContext);
    if (!ctx) throw new Error("useConsoleAuth must be used inside ConsoleAuthProvider");
    return ctx;
}

/**
 * Load console data. Re-runs when `deps` change or `reload()` is called.
 * A 401 means the platform session expired, so it signs out and goes to login.
 */
export function useConsoleData<T>(load: (token: string) => Promise<T>, deps: unknown[]) {
    const { token, signOut } = useConsoleAuth();
    const router = useRouter();
    const locale = useLocale();
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        load(token)
            .then((d) => {
                if (cancelled) return;
                setData(d);
                setError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 401) {
                    signOut();
                    router.replace(`/${locale}/console/login`);
                    return;
                }
                setError(err instanceof Error ? err.message : "Could not load");
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, tick, ...deps]);

    return { data, error, reload: () => setTick((n) => n + 1) };
}

/** Redirects to the console login when there is no platform session. */
export function useConsoleGuard() {
    const { token, ready } = useConsoleAuth();
    const router = useRouter();
    const locale = useLocale();
    const pathname = usePathname();
    const onLogin = pathname.endsWith("/console/login");

    useEffect(() => {
        if (ready && !token && !onLogin) router.replace(`/${locale}/console/login`);
    }, [ready, token, onLogin, router, locale]);

    return { onLogin, allowed: ready && (!!token || onLogin) };
}
