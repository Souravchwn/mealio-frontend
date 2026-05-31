/* Enums */

export const Role = {
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    MEMBER: "MEMBER",
    GUEST: "GUEST",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const MealSlot = {
    BREAKFAST: "BREAKFAST",
    LUNCH: "LUNCH",
    DINNER: "DINNER",
} as const;

export type MealSlot = (typeof MealSlot)[keyof typeof MealSlot];

export const ExpenseCategory = {
    PROTEIN: "PROTEIN",
    CARB: "CARB",
    VEGETABLE: "VEGETABLE",
    SPICE: "SPICE",
    OIL: "OIL",
    UTILITY: "UTILITY",
    OTHER: "OTHER",
} as const;

export type ExpenseCategory =
    (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const MonthStatus = {
    OPEN: "OPEN",
    CLOSED: "CLOSED",
} as const;

export type MonthStatus = (typeof MonthStatus)[keyof typeof MonthStatus];

/* Entities */

export interface Mess {
    id: string;
    name: string;
    inviteCode: string;
    cutOffTime: string;
    isActive: boolean;
    estimatedMonthlyBudget?: number;
    createdAt: string;
}

export interface Member {
    id: string;
    messId: string;
    name: string;
    phone?: string;
    telegramUid?: number;
    telegramLinked: boolean;
    role: Role;
    isActive: boolean;
    balance: number;
}

export interface DailyLog {
    id: string;
    memberId: string;
    date: string;
    breakfastCount: number;
    lunchCount: number;
    dinnerCount: number;
    /** Convenience booleans: count > 0 */
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
    /** Per-slot guest counts, billed to the host member. */
    guestBreakfastCount: number;
    guestLunchCount: number;
    guestDinnerCount: number;
    frozen: boolean;
    overrideType?: string | null;
}

export interface MealConfig {
    id: string;
    messId: string;
    mealType: "BREAKFAST" | "LUNCH" | "DINNER";
    enabled: boolean;
    cutoffTime: string; // HH:MM
    maxCount: number;
}

export interface Expense {
    id: string;
    messId: string;
    memberId: string | null;
    memberName?: string;
    amount: number;
    category: ExpenseCategory;
    description: string;
    date: string;
    createdAt: string;
}

export interface MonthlySnapshot {
    id: string;
    messId: string;
    yearMonth: string;
    totalExpense: number;
    mealRate: number;
    totalMeals: number;
    isClosed: boolean;
    closedAt?: string;
}

export interface AuditTrail {
    id: string;
    adminId: string;
    adminName?: string;
    entityType: string;
    entityId: string;
    oldValue: string;
    newValue: string;
    reason: string;
    createdAt: string;
}

/* Auth */

export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    messId: string;
    messName: string;
}

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    user: User;
}

/* API Responses */

export interface MealHeadcount {
    memberCount: number;
    guestCount: number;
    total: number;
}

export interface HeadcountResponse {
    messName: string;
    date: string;
    meals: {
        breakfast: MealHeadcount;
        lunch: MealHeadcount;
        dinner: MealHeadcount;
    };
    source: "database";
}

export interface ExpenseResponse {
    id: string;
    messId: string;
    memberId: string;
    memberName: string;
    amount: number;
    category: ExpenseCategory;
    description: string | null;
    date: string;
    createdAt: string;
    liveMealRate: number;
}

export interface MonthMatrixResponse {
    messId: string;
    messName: string;
    yearMonth: string;
    mealRate: number;
    totalExpense: number;
    totalMeals: number;
    members: MemberMatrixRow[];
}

export interface MemberMatrixRow {
    memberId: string;
    memberName: string;
    memberRole: string;
    days: DayEntry[];
    totalMeals: number;
    totalAmount: number;
    balance: number;
}

export interface DayEntry {
    logId: string;
    memberId: string;
    memberName: string;
    date: string;
    breakfastCount: number;
    lunchCount: number;
    dinnerCount: number;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
    guestBreakfastCount: number;
    guestLunchCount: number;
    guestDinnerCount: number;
    frozen: boolean;
}

/* API Requests */

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    name: string;
    email: string;
    phone?: string;
    password: string;
    messInviteCode: string;
}

export interface ExpenseRequest {
    messId: string;
    memberId?: string;
    amount: number;
    category: ExpenseCategory;
    description: string;
    date: string;
}

export interface MealToggleRequest {
    memberId: string;
    date: string;
    slot: MealSlot;
    /** Integer count: 0 = off, 1 = normal, 2+ = extra. Preferred over `status`. */
    count?: number;
    /** Legacy boolean — converted to count 0/1 on the server. */
    status?: boolean;
}

export interface GuestUpdateRequest {
    memberId: string;
    date: string;
    slot: MealSlot;
    guestCount: number;
}

export interface CloseMonthRequest {
    messId: string;
    adminId: string;
    yearMonth: string;
}

export interface MessSwitchResponse {
    accessToken: string;
    refreshToken: string;
    mess: { id: string; name: string };
}
