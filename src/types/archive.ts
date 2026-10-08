/* Archive (closed months) API shapes, already camelCased by api.ts */

import type { BazaarMemoInfo, BazaarEntryMode, ExpenseCategory, GuestMealPolicy } from "./index";

export interface ArchivePeriodRow {
    yearMonth: string;
    startDate: string;
    endDate: string;
    closedAt: string | null;
    mealRate: number;
    totalExpense: number;
    totalMeals: number | null;
    members: number | null;
}

export interface ArchiveMember {
    id: string;
    name: string;
    ownMeals: number;
    guestMeals: number;
    billableMeals: number;
    deposited: number;
    bazaarCredit: number;
    carriedForward: number;
    mealCost: number;
    balance: number;
    /** Own meals on each date of the period, same order as `dates` */
    dailyMeals: number[];
    dailyGuestMeals: number[];
}

export interface ArchiveBazaarTrip {
    id: string;
    date: string;
    shoppers: Array<{ id: string; name: string }>;
    note: string | null;
    entryMode: BazaarEntryMode;
    recordedBy: string | null;
    isVoided: boolean;
    voidReason: string | null;
    total: number;
    items: Array<{ id: string; category: ExpenseCategory; amount: number; description: string | null }>;
    memos: BazaarMemoInfo[];
}

export interface ArchiveDeposit {
    id: string;
    memberId: string;
    memberName: string;
    amount: number;
    date: string;
    note: string | null;
    recordedBy: string | null;
    isVoided: boolean;
    voidReason: string | null;
}

export interface ArchiveDetail {
    yearMonth: string;
    startDate: string;
    endDate: string;
    closedAt: string | null;
    /** When the figures were frozen (the moment of closing, or the first read for months closed earlier) */
    frozenAt: string | null;
    settings: { guestMealPolicy: GuestMealPolicy; bazaarCountsAsDeposit: boolean };
    totals: { totalExpense: number; totalMeals: number; totalGuestMeals: number; mealRate: number; totalDeposits: number };
    members: ArchiveMember[];
    dates: string[];
    bazaar: ArchiveBazaarTrip[];
    deposits: ArchiveDeposit[];
}
