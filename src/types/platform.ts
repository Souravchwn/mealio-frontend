/* Platform console (super admin) API shapes, already camelCased by api.ts */

export type MessStatus = "ACTIVE" | "SUSPENDED" | "DELETED" | "INACTIVE";
export type UserStatus = "ACTIVE" | "INACTIVE" | "PENDING" | "REJECTED" | "DELETED";
export type Severity = "INFO" | "WARN" | "HIGH";

export interface Paged {
    total: number;
    page: number;
    pages: number;
}

export interface PlatformAdmin {
    id: string;
    name: string;
    email: string;
}

export interface PlatformStats {
    messes: { total: number; active: number; suspended: number; deleted: number; newThisWeek: number };
    members: { total: number; pending: number; newThisWeek: number; activeToday: number };
    support: { open: number; high: number };
    security: { failedLoginsDay: number; highEventsDay: number };
    signups: Array<{ date: string; members: number; messes: number }>;
    recentMesses: Array<{ id: string; name: string; plan: string; members: number; createdAt: string }>;
    recentEvents: Array<{ id: string; type: string; severity: Severity; email: string | null; ip: string | null; createdAt: string }>;
}

export interface PlatformMessRow {
    id: string;
    name: string;
    plan: string;
    members: number;
    status: MessStatus;
    owner: { id: string; name: string; email: string } | null;
    createdAt: string;
}

export interface PlatformMessDetail {
    id: string;
    name: string;
    inviteCode: string;
    plan: string;
    planExpiresAt: string | null;
    requireJoinApproval: boolean;
    ownerId: string | null;
    status: MessStatus;
    suspendedReason: string | null;
    suspendedAt: string | null;
    deletedAt: string | null;
    createdAt: string;
    telegramGroup: { chatName: string | null; timezone: string } | null;
    period: { label: string; start: string; end: string } | null;
    money: { mealRate: number; totalExpense: number; totalMeals: number } | null;
    members: Array<{
        id: string; name: string; email: string; phone: string | null; role: string;
        isActive: boolean; joinStatus: string; deleted: boolean; telegramLinked: boolean;
        emailVerified: boolean; joinedAt: string; lastLoginAt: string | null;
    }>;
    recentActivity: Array<{ id: string; action: string; actor: string; createdAt: string }>;
    tickets: Array<{ id: string; subject: string; status: string; updatedAt: string }>;
}

export type MessAction =
    | { action: "suspend"; reason: string }
    | { action: "unsuspend" | "restore" | "delete" | "rotate_invite" }
    | { action: "set_plan"; plan: string }
    | { action: "set_join_approval"; value: boolean };

export interface PlatformUserRow {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    status: UserStatus;
    emailVerified: boolean;
    mess: { id: string; name: string } | null;
    lastLoginAt: string | null;
    joinedAt: string;
}

export interface PlatformUserDetail extends PlatformUserRow {
    telegramLinked: boolean;
    passwordChangedAt: string | null;
    events: Array<{ id: string; type: string; severity: Severity; ip: string | null; createdAt: string }>;
    tickets: Array<{ id: string; subject: string; status: string; updatedAt: string }>;
}

export type UserAction =
    | { action: "deactivate" | "reactivate" | "verify_email" | "reset_code" | "unlink_telegram" | "sign_out_everywhere" }
    | { action: "change_email"; email: string };

export interface SecurityEventRow {
    id: string;
    type: string;
    severity: Severity;
    email: string | null;
    ip: string | null;
    memberId: string | null;
    messId: string | null;
    detail: unknown;
    createdAt: string;
}

export interface PlatformAuditRow {
    id: string;
    actor: string;
    action: string;
    target: string | null;
    detail: unknown;
    mess?: { id: string; name: string } | null;
    createdAt: string;
}
