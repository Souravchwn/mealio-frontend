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
    MealConfig,
    BazaarSessionResponse,
    BazaarSessionRequest,
    BazaarMemoInfo,
    ContributionResponse,
    ContributionRequest,
    GuestMealPolicy,
    MessSettingsResponse,
    RegisterResponse,
    SupportTicket,
    MealPreferenceRow,
    DefaultMealsSetting,
} from "@/types";
import type {
    Paged,
    PlatformAdmin,
    PlatformStats,
    PlatformMessRow,
    PlatformMessDetail,
    MessAction,
    PlatformUserRow,
    PlatformUserDetail,
    UserAction,
    SecurityEventRow,
    PlatformAuditRow,
} from "@/types/platform";
import type { ArchivePeriodRow, ArchiveDetail } from "@/types/archive";
import type { TgHome } from "@/types/telegram-app";

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

/** Thrown for every non-2xx response. `code` is a machine-readable reason, e.g. PENDING_APPROVAL. */
export class ApiError extends Error {
    constructor(message: string, public readonly status: number, public readonly code?: string) {
        super(message);
        this.name = "ApiError";
    }
}

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
        let code: string | undefined;
        try {
            const err = await response.json();
            errorMessage = err?.detail || err?.message || errorMessage;
            code = err?.code;
        } catch {
            /* ignore */
        }
        // The server no longer accepts this token (password changed, mess suspended,
        // account removed). Tell the app so it can sign out instead of showing broken pages.
        if (
            response.status === 401 &&
            token &&
            typeof window !== "undefined" &&
            !endpoint.startsWith("/api/platform") &&
            !endpoint.startsWith("/api/auth/")
        ) {
            window.dispatchEvent(new CustomEvent("mealio:session-rejected"));
        }
        throw new ApiError(errorMessage, response.status, code);
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
            fetcher<RegisterResponse>("/api/auth/register", {
                method: "POST",
                body: data,
            }),
        /** Names the admin added who have not joined yet (needs the mess invite code) */
        roster: (code: string) =>
            fetcher<{ messName: string; names: Array<{ id: string; name: string }> }>("/api/auth/roster", {
                params: { code },
            }),
        /** Whether the server can send email (reset links, verification) */
        options: () => fetcher<{ emailEnabled: boolean }>("/api/auth/options"),
        forgot: (email: string, locale?: string) =>
            fetcher<{ ok: boolean; emailEnabled: boolean }>("/api/auth/forgot", {
                method: "POST",
                body: { email, locale },
            }),
        /** Either a link token, or the email plus an 8-character code from an admin */
        reset: (data: { password: string; token?: string; email?: string; code?: string }) =>
            fetcher<{ ok: boolean }>("/api/auth/reset", { method: "POST", body: data }),
        verifyEmail: (token: string) =>
            fetcher<{ ok: boolean }>("/api/auth/verify-email", { method: "POST", body: { token } }),
        resendVerification: (token: string, locale?: string) =>
            fetcher<{ ok: boolean; alreadyVerified?: boolean }>("/api/auth/verify-email/resend", {
                method: "POST",
                body: { locale },
                token,
            }),
    },

    /** Telegram Mini App. Identity is Telegram's signed initData, not a Mealtill token. */
    tg: {
        home: (initData: string) =>
            fetcher<TgHome>("/api/tg/home", { method: "GET", headers: { "X-Telegram-Init-Data": initData } }),
    },

    /** Personal invite for a member added by name. Public: the link token is the proof. */
    invite: {
        get: (inviteToken: string) =>
            fetcher<{
                name: string; messName: string; periodStart: string; periodEnd: string;
                meals: number; deposited: number; balance: number; mealRate: number;
            }>(`/api/invite/${encodeURIComponent(inviteToken)}`),
        claim: (inviteToken: string, data: { email: string; password: string; phone?: string; locale?: string }) =>
            fetcher<AuthResponse>(`/api/invite/${encodeURIComponent(inviteToken)}`, { method: "POST", body: data }),
    },

    /** Closed months. Open to every member of the mess, read-only. */
    archive: {
        list: (token: string) => fetcher<{ periods: ArchivePeriodRow[] }>("/api/archive", { method: "GET", token }),
        get: (yearMonth: string, token: string) =>
            fetcher<ArchiveDetail>(`/api/archive/${yearMonth}`, { method: "GET", token }),
    },

    /** The signed-in person's own account */
    me: {
        /** Downloads every piece of personal data as a JSON file */
        exportData: async (token: string) => {
            const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new ApiError("Could not prepare your data", res.status);
            return res.blob();
        },
        deleteAccount: (password: string, token: string) =>
            fetcher<{ ok: boolean }>("/api/me", { method: "DELETE", body: { password }, token }),
        changePassword: (data: { currentPassword: string; newPassword: string }, token: string) =>
            fetcher<{ ok: boolean; accessToken: string }>("/api/me/password", { method: "POST", body: data, token }),
    },

    support: {
        /** Works signed in or not. Anonymous senders get an accessKey to follow the ticket. */
        create: (
            data: { category: string; subject: string; message: string; name?: string; email?: string },
            token?: string | null
        ) =>
            fetcher<{ id: string; accessKey: string | null }>("/api/support/tickets", {
                method: "POST",
                body: data,
                token: token ?? undefined,
            }),
        mine: (token: string) =>
            fetcher<{ tickets: SupportTicket[] }>("/api/support/tickets", { method: "GET", token }),
        get: (id: string, opts: { token?: string | null; key?: string | null }) =>
            fetcher<SupportTicket>(`/api/support/tickets/${id}`, {
                method: "GET",
                token: opts.token ?? undefined,
                params: opts.key ? { key: opts.key } : undefined,
            }),
        reply: (id: string, body: string, opts: { token?: string | null; key?: string | null }) =>
            fetcher<{ ok: boolean }>(`/api/support/tickets/${id}`, {
                method: "POST",
                body: { body },
                token: opts.token ?? undefined,
                params: opts.key ? { key: opts.key } : undefined,
            }),
    },

    /** Super admin console. Uses the platform token, never a mess token. */
    platform: {
        login: (email: string, password: string) =>
            fetcher<{ accessToken: string; admin: PlatformAdmin }>("/api/platform/auth/login", {
                method: "POST",
                body: { email, password },
            }),
        me: (token: string) => fetcher<{ admin: PlatformAdmin }>("/api/platform/me", { token }),
        stats: (token: string) => fetcher<PlatformStats>("/api/platform/stats", { token }),
        messes: (params: { q?: string; status?: string; page?: number }, token: string) =>
            fetcher<Paged & { messes: PlatformMessRow[] }>("/api/platform/messes", { params, token }),
        mess: (id: string, token: string) => fetcher<PlatformMessDetail>(`/api/platform/messes/${id}`, { token }),
        messAction: (id: string, data: MessAction, token: string) =>
            fetcher<{ ok: boolean; inviteCode?: string }>(`/api/platform/messes/${id}`, { method: "PATCH", body: data, token }),
        users: (params: { q?: string; status?: string; page?: number }, token: string) =>
            fetcher<Paged & { users: PlatformUserRow[] }>("/api/platform/users", { params, token }),
        user: (id: string, token: string) => fetcher<PlatformUserDetail>(`/api/platform/users/${id}`, { token }),
        userAction: (id: string, data: UserAction, token: string) =>
            fetcher<{ ok: boolean; code?: string; email?: string; minutes?: number }>(`/api/platform/users/${id}`, {
                method: "PATCH",
                body: data,
                token,
            }),
        tickets: (params: { q?: string; status?: string; page?: number }, token: string) =>
            fetcher<Paged & { tickets: SupportTicket[] }>("/api/platform/tickets", { params, token }),
        ticket: (id: string, token: string) =>
            fetcher<SupportTicket & { mess: { id: string; name: string } | null }>(`/api/platform/tickets/${id}`, { token }),
        replyTicket: (id: string, data: { body: string; status?: string }, token: string) =>
            fetcher<{ ok: boolean }>(`/api/platform/tickets/${id}`, { method: "POST", body: data, token }),
        updateTicket: (id: string, data: { status?: string; priority?: string }, token: string) =>
            fetcher<{ ok: boolean }>(`/api/platform/tickets/${id}`, { method: "PATCH", body: data, token }),
        telegram: (token: string) =>
            fetcher<{
                tokenSet: boolean; secretSet: boolean; botOk: boolean; botError: string | null; botUsername: string | null;
                botNameFromEnv: string | null; appUrl: string; appUrlPublic: boolean; expectedUrl: string;
                webhookUrl: string | null; connected: boolean; pending: number; lastError: string | null;
                hearsGroupAdds: boolean; miniAppUrl: string; hasMiniApp: boolean; menuButtonSet: boolean;
            }>("/api/platform/telegram", { token }),
        telegramAction: (action: "connect" | "disconnect", token: string) =>
            fetcher<{ connected: boolean }>("/api/platform/telegram", { method: "POST", body: { action }, token }),
        securityEvents: (params: { type?: string; severity?: string; q?: string; page?: number }, token: string) =>
            fetcher<Paged & {
                events: SecurityEventRow[];
                hotIps: Array<{ ip: string; count: number }>;
                hotEmails: Array<{ email: string; count: number }>;
            }>("/api/platform/security-events", { params, token }),
        audit: (params: { source: "platform" | "mess"; messId?: string; page?: number }, token: string) =>
            fetcher<Paged & { entries: PlatformAuditRow[] }>("/api/platform/audit", { params, token }),
    },

    cook: {
        getHeadcount: (messId: string, token: string) =>
            fetcher<HeadcountResponse>("/api/cook/headcount", {
                method: "GET",
                params: { messId },
                token,
            }),
        getNotes: (token: string, date?: string) =>
            fetcher<{ date: string; notes: Record<string, string | null> }>("/api/cook/notes", {
                method: "GET",
                params: date ? { date } : {},
                token,
            }),
        saveNote: (data: { slot: string; note: string; date?: string }, token: string) =>
            fetcher<{ ok: boolean }>("/api/cook/notes", {
                method: "POST",
                body: data,
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
        getExpenses: (
            params: { messId: string; yearMonth?: string; page?: number; limit?: number },
            token?: string
        ) =>
            fetcher<{
                expenses: ExpenseResponse[];
                total: number;
                page: number;
                pages: number;
            }>("/api/expenses", { method: "GET", params, token }),
        getMealRate: (messId: string, yearMonth?: string, token?: string) =>
            fetcher<{ messId: string; yearMonth: string; mealRate: number }>(
                "/api/expenses/meal-rate",
                { method: "GET", params: { messId, yearMonth }, token }
            ),
        sessions: {
            list: (params: { messId?: string; yearMonth?: string; page?: number; limit?: number }, token: string) =>
                fetcher<{
                    sessions: BazaarSessionResponse[];
                    total: number;
                    page: number;
                    pages: number;
                    liveMealRate: number;
                    totalExpense: number;
                }>("/api/expenses/sessions", { method: "GET", params, token }),
            get: (id: string, token: string) =>
                fetcher<BazaarSessionResponse>(`/api/expenses/sessions/${id}`, { method: "GET", token }),
            create: (data: BazaarSessionRequest, token: string) =>
                fetcher<BazaarSessionResponse>("/api/expenses/sessions", { method: "POST", body: data, token }),
            update: (
                id: string,
                data: Partial<BazaarSessionRequest>,
                token: string
            ) =>
                fetcher<{ ok: boolean }>(`/api/expenses/sessions/${id}`, { method: "PUT", body: data, token }),
            void: (id: string, reason: string, token: string) =>
                fetcher<{ ok: boolean }>(`/api/expenses/sessions/${id}`, { method: "DELETE", body: { reason }, token }),
            /** Add photos to a trip that already exists */
            addMemos: (id: string, memos: Array<{ data: string }>, token: string) =>
                fetcher<{ memos: BazaarMemoInfo[] }>(`/api/expenses/sessions/${id}/memos`, { method: "POST", body: { memos }, token }),
            /** The photo itself. Needs the token, so it cannot be a plain <img src>. */
            memoBlob: async (id: string, memoId: string, token: string) => {
                const res = await fetch(`/api/expenses/sessions/${id}/memos/${memoId}`, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) throw new ApiError("Could not load the photo", res.status);
                return res.blob();
            },
        },
    },

    contributions: {
        list: (params: { yearMonth?: string; page?: number; limit?: number }, token: string) =>
            fetcher<{
                contributions: ContributionResponse[];
                total: number;
                page: number;
                pages: number;
                totalContributed: number;
                memberSummary: Array<{
                    memberId: string;
                    memberName: string;
                    total: number;
                    count: number;
                }>;
            }>("/api/contributions", { method: "GET", params, token }),
        add: (data: ContributionRequest, token: string) =>
            fetcher<ContributionResponse>("/api/contributions", { method: "POST", body: data, token }),
        void: (id: string, reason: string, token: string) =>
            fetcher<{ ok: boolean }>(`/api/contributions/${id}`, { method: "DELETE", body: { reason }, token }),
    },

    meals: {
        getToday: (memberId: string, token: string, logDate?: string) =>
            fetcher<{
                id: string;
                memberId: string;
                date: string;
                breakfastCount: number;
                lunchCount: number;
                dinnerCount: number;
                /** Convenience boolean: count > 0 */
                breakfast: boolean;
                lunch: boolean;
                dinner: boolean;
                /** Guest portions for the whole day */
                guestCount: number;
                /** Guests per meal: a guest can come for lunch only, dinner only, or both */
                guests: { breakfast: number; lunch: number; dinner: number };
                frozen: boolean;
                /** HOST = guest meals are charged to this member; SHARED = spread across the mess */
                guestMealPolicy: GuestMealPolicy;
                /** WEEKDAY / WEEKEND for this date, per the mess's weekend setting */
                dayType: "WEEKDAY" | "WEEKEND";
                /** Next upcoming cutoff (or last slot cutoff if all passed) */
                cutOffTime: string;
                /** True only when ALL slots have passed their cutoff */
                cutOffPassed: boolean;
                /** Per-slot cutoff state — use this to lock individual meal cards */
                slotCutoffs: {
                    breakfast: { cutoffTime: string; cutoffPassed: boolean };
                    lunch:     { cutoffTime: string; cutoffPassed: boolean };
                    dinner:    { cutoffTime: string; cutoffPassed: boolean };
                };
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

    mealPreferences: {
        getAll: (token: string) =>
            fetcher<{ preferences: MealPreferenceRow[] }>("/api/members/meal-preferences", { method: "GET", token }),
        /** Admin or manager: another member's defaults */
        getFor: (memberId: string, token: string) =>
            fetcher<{ preferences: MealPreferenceRow[] }>(`/api/members/${memberId}/meal-preferences`, { method: "GET", token }),
        updateFor: (memberId: string, data: { mealType: string; dayType: string; enabled: boolean }, token: string) =>
            fetcher<{ ok: boolean; appliedToday: boolean }>(`/api/members/${memberId}/meal-preferences`, {
                method: "PUT",
                body: data,
                token,
            }),
        /** Back to the mess default */
        resetFor: (memberId: string, token: string) =>
            fetcher<{ ok: boolean }>(`/api/members/${memberId}/meal-preferences`, { method: "DELETE", token }),
        update: (
            data: { mealType: string; dayType: string; enabled: boolean; defaultCount?: number },
            token: string
        ) =>
            fetcher<{ ok: boolean }>("/api/members/meal-preferences", {
                method: "PUT",
                body: data,
                token,
            }),
    },

    telegramLink: {
        status: (token: string) =>
            fetcher<{ linked: boolean; botUsername: string | null }>("/api/members/telegram-link", {
                method: "GET",
                token,
            }),
        createCode: (token: string) =>
            fetcher<{ code: string; expiresAt: string; botUsername: string | null }>("/api/members/telegram-link", {
                method: "POST",
                token,
            }),
        unlink: (token: string) =>
            fetcher<{ ok: boolean }>("/api/members/telegram-link", { method: "DELETE", token }),
    },

    mealConfigs: {
        list: (token: string) =>
            fetcher<{ mealConfigs: MealConfig[] }>("/api/mess/meal-configs", {
                method: "GET",
                token,
            }),
        update: (
            data: { mealType: string; cutoffTime?: string; enabled?: boolean; maxCount?: number },
            token: string
        ) =>
            fetcher<{ ok: boolean }>("/api/mess/meal-configs", {
                method: "PUT",
                body: data,
                token,
            }),
    },

    members: {
        list: (messId: string, token: string, opts?: { includeInactive?: boolean }) =>
            fetcher<{
                messName: string;
                members: Array<{
                    id: string;
                    name: string;
                    phone: string | null;
                    role: string;
                    isActive: boolean;
                    mealCount: number;
                    guestMeals: number;
                    contributed: number;
                    balance: number;
                    telegramLinked: boolean;
                    isGuest: boolean;
                    guestFrom: string | null;
                    guestUntil: string | null;
                    /** false = added by name, has not joined yet */
                    hasAccount: boolean;
                    /** When the latest live invite was made (null = none) */
                    invitedAt: string | null;
                }>;
            }>("/api/members", {
                method: "GET",
                params: opts?.includeInactive ? { messId, includeInactive: "1" } : { messId },
                token,
            }),
        /** Admin: add someone by name only (no account needed) */
        add: (name: string, token: string) =>
            fetcher<{ id: string; name: string; hasAccount: boolean }>("/api/members", { method: "POST", body: { name }, token }),
        /** Admin: a personal invite link; also emailed when an email is given and email is set up */
        invite: (memberId: string, data: { email?: string; locale?: string }, token: string) =>
            fetcher<{ url: string; expiresAt: string; emailed: boolean; emailEnabled: boolean }>(
                `/api/members/${memberId}/invite`,
                { method: "POST", body: data, token }
            ),
        pending: (token: string) =>
            fetcher<{
                pending: Array<{ id: string; name: string; email: string; phone: string | null; requestedAt: string }>;
                /** "I am <name>" requests made with the invite code */
                claims: Array<{
                    id: string; name: string; email: string; phone: string | null;
                    memberId: string; memberName: string; requestedAt: string;
                }>;
            }>("/api/members/pending", { method: "GET", token }),
        decideClaim: (claimId: string, decision: "approve" | "reject", token: string) =>
            fetcher<{ ok: boolean }>(`/api/members/claims/${claimId}`, { method: "POST", body: { decision }, token }),
        decideJoin: (memberId: string, decision: "approve" | "reject", token: string) =>
            fetcher<{ ok: boolean }>(`/api/members/${memberId}/join`, { method: "POST", body: { decision }, token }),
        /** One-time code the member types on the reset page together with their email */
        resetCode: (memberId: string, token: string) =>
            fetcher<{ code: string; email: string; expiresAt: string; minutes: number }>(
                `/api/members/${memberId}/reset-code`,
                { method: "POST", token }
            ),
        me: (token: string, yearMonth?: string) =>
            fetcher<{
                memberId: string;
                yearMonth: string;
                mealRate: number;
                totalExpense: number;
                guestMealPolicy: GuestMealPolicy;
                /** Billable meals: own meals (+ guest meals when the host pays) */
                myMealCount: number;
                ownMealCount: number;
                guestMealCount: number;
                deposited: number;
                carriedForward: number;
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
                    /** Only returned to admins and managers */
                    inviteCode: string | null;
                    cutOffTime: string;
                    isCurrent: boolean;
                    role: string;
                }>;
            }>("/api/mess", { method: "GET", token }),
        switchMess: (messId: string, token: string) =>
            fetcher<MessSwitchResponse>(`/api/mess/${messId}/switch`, { method: "GET", token }),
        /** The current open billing period and whether it has ended without being closed */
        period: (token: string) =>
            fetcher<{
                yearMonth: string;
                startDate: string;
                endDate: string;
                isClosed: boolean;
                today: string;
                daysLeft: number;
                overdue: boolean;
            }>("/api/mess/period", { method: "GET", token }),
        /** New code; the old one stops working at once */
        rotateInvite: (token: string) =>
            fetcher<{ inviteCode: string }>("/api/mess/invite-code", { method: "POST", token }),
        deleteMess: (data: { confirmName: string; password: string }, token: string) =>
            fetcher<{ ok: boolean }>("/api/mess/delete", { method: "POST", body: data, token }),
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
        editMeal: (
            data: { memberId: string; date: string; slot: "breakfast" | "lunch" | "dinner"; value: boolean },
            token: string
        ) =>
            fetcher<{ ok: boolean; logId: string }>("/api/admin/meals", {
                method: "PUT",
                body: data,
                token,
            }),
        noCook: (
            data: { action: "on" | "off"; date?: string; reason?: string },
            token: string
        ) =>
            fetcher<{ ok: boolean; membersUpdated: number; telegramNotified: number }>(
                "/api/admin/no-cook",
                { method: "POST", body: data, token }
            ),
        updateMember: (
            memberId: string,
            data: { role?: string; isActive?: boolean; guestFrom?: string | null; guestUntil?: string | null },
            token: string
        ) =>
            fetcher<{ ok: boolean }>(`/api/members/${memberId}`, {
                method: "PUT",
                body: data,
                token,
            }),
        getAuditLog: (params: { page?: number; limit?: number; action?: string }, token: string) =>
            fetcher<{
                entries: Array<{
                    id: string;
                    actorName: string;
                    action: string;
                    targetTable: string | null;
                    oldValue: unknown;
                    newValue: unknown;
                    createdAt: string;
                }>;
                total: number;
                page: number;
                pages: number;
            }>("/api/admin/audit", { method: "GET", params, token }),
        updateExpense: (
            id: string,
            data: { amount?: number; category?: string; description?: string; date?: string },
            token: string
        ) =>
            fetcher<{ ok: boolean }>(`/api/expenses/${id}`, {
                method: "PUT",
                body: data,
                token,
            }),
        deleteExpense: (id: string, token: string) =>
            fetcher<{ ok: boolean }>(`/api/expenses/${id}`, {
                method: "DELETE",
                token,
            }),
        getSettings: (token: string) =>
            fetcher<MessSettingsResponse>("/api/mess/settings", { method: "GET", token }),
        updateSettings: (
            data: {
                name?: string;
                cutOffTime?: string;
                estimatedMonthlyBudget?: number;
                monthStartDay?: number;
                guestMealPolicy?: GuestMealPolicy;
                bazaarCountsAsDeposit?: boolean;
                carryForwardBalance?: boolean;
                weekendDays?: number[];
                requireJoinApproval?: boolean;
                defaultMeals?: DefaultMealsSetting;
            },
            token: string
        ) =>
            fetcher<{ ok: boolean } & MessSettingsResponse>("/api/mess/settings", {
                method: "PUT",
                body: data,
                token,
            }),
        getTelegramGroup: (token: string) =>
            fetcher<{
                chatId: string | null;
                chatName: string | null;
                timezone: string | null;
                isLinked: boolean;
            }>("/api/admin/telegram-group", { method: "GET", token }),
        /** One-time code the admin sends in the house group as /linkgroup CODE */
        telegramGroupCode: (token: string) =>
            fetcher<{ code: string; expiresAt: string; botUsername: string | null; adminTelegramLinked: boolean }>(
                "/api/admin/telegram-group/code",
                { method: "POST", token }
            ),
        linkTelegramGroup: (
            data: { chatId: string; chatName?: string; timezone?: string },
            token: string
        ) =>
            fetcher<{ ok: boolean }>("/api/admin/telegram-group", {
                method: "POST",
                body: data,
                token,
            }),
    },
};
