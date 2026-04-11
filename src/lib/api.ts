/**
 * API client — connects to the Next.js API routes → Supabase.
 *
 * Handles:
 *  - camelCase ↔ snake_case conversion automatically
 *  - Bearer token injection
 *  - Error message extraction from { detail } field
 */

import type {
    LoginRequest,
    RegisterRequest,
    AuthResponse,
    HeadcountResponse,
    ExpenseRequest,
    ExpenseResponse,
    MonthMatrixResponse,
    CloseMonthRequest,
    MealToggleRequest,
    GuestUpdateRequest,
    MessSwitchResponse,
} from "@/types";

// Empty base URL = relative paths (Next.js API routes)
const API_BASE_URL = "";

// ── camelCase ↔ snake_case helpers ────────────────────────────────────────────

function toSnake(key: string): string {
    return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function toCamel(key: string): string {
    return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function deepSnake(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(deepSnake);
    if (obj !== null && typeof obj === "object") {
        return Object.fromEntries(
            Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
                toSnake(k),
                deepSnake(v),
            ])
        );
    }
    return obj;
}

function deepCamel(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(deepCamel);
    if (obj !== null && typeof obj === "object") {
        return Object.fromEntries(
            Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
                toCamel(k),
                deepCamel(v),
            ])
        );
    }
    return obj;
}

// ── Core fetcher ──────────────────────────────────────────────────────────────

type FetchOptions = Omit<RequestInit, "body"> & {
    params?: Record<string, string | number | boolean | undefined>;
    token?: string;
    body?: unknown;
};

async function fetcher<T>(
    endpoint: string,
    options: FetchOptions = {}
): Promise<T> {
    const { params, token, headers: customHeaders, body, ...rest } = options;

    let url = `${API_BASE_URL}${endpoint}`;

    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                searchParams.append(toSnake(key), String(value));
            }
        });
        const qs = searchParams.toString();
        if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(customHeaders as Record<string, string>),
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const serializedBody =
        body !== undefined ? JSON.stringify(deepSnake(body)) : undefined;

    const response = await fetch(url, {
        headers,
        body: serializedBody,
        ...rest,
    });

    if (!response.ok) {
        let errorMessage = `Error ${response.status}`;
        try {
            const err = await response.json();
            errorMessage = err?.detail || err?.message || errorMessage;
        } catch {
            /* ignore */
        }
        throw new Error(errorMessage);
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;
    return deepCamel(data) as T;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
    auth: {
        login: (data: LoginRequest) =>
            fetcher<AuthResponse>("/api/auth/login", {
                method: "POST",
                body: data,
            }),
        register: (data: RegisterRequest) =>
            fetcher<AuthResponse>("/api/auth/register", {
                method: "POST",
                body: data,
            }),
    },

    cook: {
        getHeadcount: (messId: string, token: string) =>
            fetcher<HeadcountResponse>("/api/cook/headcount", {
                method: "GET",
                params: { messId },
                token,
            }),
    },

    expenses: {
        addExpense: (data: ExpenseRequest, token: string) =>
            fetcher<ExpenseResponse>("/api/expenses", {
                method: "POST",
                body: data,
                token,
            }),
        getExpenses: (messId: string, yearMonth?: string, token?: string) =>
            fetcher<ExpenseResponse[]>("/api/expenses", {
                method: "GET",
                params: { messId, yearMonth },
                token,
            }),
        getMealRate: (messId: string, yearMonth?: string, token?: string) =>
            fetcher<{ messId: string; yearMonth: string; mealRate: number }>(
                "/api/expenses/meal-rate",
                { method: "GET", params: { messId, yearMonth }, token }
            ),
    },

    meals: {
        getToday: (memberId: string, token: string, logDate?: string) =>
            fetcher<{
                id: string;
                memberId: string;
                date: string;
                breakfast: boolean;
                lunch: boolean;
                dinner: boolean;
                guestCount: number;
                frozen: boolean;
                cutOffTime: string;
                cutOffPassed: boolean;
            }>("/api/meals/today", {
                method: "GET",
                params: { memberId, logDate },
                token,
            }),
        toggleMeal: (data: MealToggleRequest, token: string) =>
            fetcher<unknown>("/api/meals/toggle", {
                method: "POST",
                body: data,
                token,
            }),
        updateGuest: (data: GuestUpdateRequest, token: string) =>
            fetcher<unknown>("/api/meals/guest", {
                method: "POST",
                body: data,
                token,
            }),
    },

    members: {
        list: (messId: string, token: string) =>
            fetcher<{
                messName: string;
                members: Array<{
                    id: string;
                    name: string;
                    phone: string | null;
                    role: string;
                    balance: number;
                    telegramLinked: boolean;
                    isGuest: boolean;
                    guestFrom: string | null;
                    guestUntil: string | null;
                }>;
            }>("/api/members", {
                method: "GET",
                params: { messId },
                token,
            }),
        me: (token: string, yearMonth?: string) =>
            fetcher<{
                memberId: string;
                yearMonth: string;
                mealRate: number;
                myMealCount: number;
                contributed: number;
                mealCost: number;
                balance: number;
            }>("/api/members/me", {
                method: "GET",
                params: yearMonth ? { yearMonth } : {},
                token,
            }),
    },

    mess: {
        list: (token: string) =>
            fetcher<{
                currentMessId: string;
                messes: Array<{
                    id: string;
                    name: string;
                    inviteCode: string;
                    cutOffTime: string;
                    isCurrent: boolean;
                    role: string;
                }>;
            }>("/api/mess", { method: "GET", token }),
        create: (data: { name: string; estimatedMonthlyBudget?: number; cutOffTime?: string }, token: string) =>
            fetcher<{ id: string; name: string; inviteCode: string; cutOffTime: string }>("/api/mess", {
                method: "POST",
                body: data,
                token,
            }),
        switchMess: (messId: string, token: string) =>
            fetcher<MessSwitchResponse>(`/api/mess/${messId}/switch`, { method: "GET", token }),
    },

    admin: {
        getMatrix: (messId: string, yearMonth?: string, token?: string) =>
            fetcher<MonthMatrixResponse>("/api/admin/matrix", {
                method: "GET",
                params: { messId, yearMonth },
                token,
            }),
        closeMonth: (data: CloseMonthRequest, token: string) =>
            fetcher<unknown>("/api/admin/close-month", {
                method: "POST",
                body: data,
                token,
            }),
    },
};
