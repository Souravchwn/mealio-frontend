/* Enums */

export const Role = {
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    MEMBER: "MEMBER",
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
    cutOffTime: string;
    createdAt: string;
}

export interface Member {
    id: string;
    messId: string;
    name: string;
    phone?: string;
    telegramUserId?: string;
    role: Role;
    balance: number;
}

export interface DailyLog {
    id: string;
    memberId: string;
    date: string;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
    guestCount: number;
    frozen: boolean;
}

export interface Expense {
    id: string;
    messId: string;
    memberId: string;
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
    status: MonthStatus;
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

export interface HeadcountResponse {
    messName: string;
    date: string;
    memberCount: number;
    guestCount: number;
    totalHeadcount: number;
    source: "firebase" | "database";
}

export interface ExpenseResponse {
    id: string;
    amount: number;
    category: ExpenseCategory;
    description: string;
    date: string;
    liveMealRate: number;
}

export interface MonthMatrixResponse {
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
    days: DayEntry[];
    totalMeals: number;
    totalAmount: number;
    balance: number;
}

export interface DayEntry {
    date: string;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
    guestCount: number;
    totalMeals: number;
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
    memberId: string;
    amount: number;
    category: ExpenseCategory;
    description: string;
    date: string;
}

export interface MealToggleRequest {
    memberId: string;
    date: string;
    slot: MealSlot;
    status: boolean;
}

export interface GuestUpdateRequest {
    memberId: string;
    date: string;
    guestCount: number;
}

export interface CloseMonthRequest {
    messId: string;
    adminId: string;
    yearMonth: string;
}
