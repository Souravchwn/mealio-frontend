"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from "react";
import { toast } from "sonner";
import { User } from "@/types";

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (user: User, token: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStorage<T>(key: string): T | null {
    try {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as T) : null;
    } catch {
        localStorage.removeItem(key);
        return null;
    }
}

const noopSubscribe = () => () => {};

export function AuthProvider({ children }: { children: ReactNode }) {
    // false on the server and during hydration, true after — so the first client
    // render matches the server HTML (no "logged-out vs logged-in" mismatch)
    const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
    const [user, setUser] = useState<User | null>(() =>
        typeof window !== "undefined" ? readStorage<User>("user") : null
    );
    const [token, setToken] = useState<string | null>(() =>
        typeof window !== "undefined" ? localStorage.getItem("token") : null
    );

    const login = (newUser: User, newToken: string) => {
        setUser(newUser);
        setToken(newToken);
        localStorage.setItem("token", newToken);
        localStorage.setItem("user", JSON.stringify(newUser));
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
    };

    // A rejected token (see api.ts) means the session is over: sign out and
    // leave a note for the login page to explain why.
    useEffect(() => {
        const onRejected = () => {
            try {
                if (localStorage.getItem("token")) sessionStorage.setItem("mealio.sessionExpired", "1");
            } catch {
                /* storage blocked */
            }
            setUser(null);
            setToken(null);
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            // The page that made the call shows its own "failed to load" toast a moment later; drop it
            setTimeout(() => toast.dismiss(), 60);
        };
        window.addEventListener("mealio:session-rejected", onRejected);
        return () => window.removeEventListener("mealio:session-rejected", onRejected);
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user: hydrated ? user : null,
                token: hydrated ? token : null,
                login,
                logout,
                isAuthenticated: hydrated && !!user && !!token,
                isLoading: !hydrated,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
