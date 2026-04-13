"use client";

import { createContext, useContext, useState, ReactNode } from "react";
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

export function AuthProvider({ children }: { children: ReactNode }) {
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

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                login,
                logout,
                isAuthenticated: !!user && !!token,
                isLoading: false,
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
