/* Telegram Mini App home payload (camelCased by api.ts) */

export interface TgPerson { name: string; count: number; guests: number }
export interface TgSlot { total: number; guests: number; cutoffTime: string; people: TgPerson[] }
type Slots<T> = { breakfast: T; lunch: T; dinner: T }

export interface TgHomeLinked {
    linked: true;
    member: { name: string; role: string };
    mess: { name: string; timezone: string; periodStart: string; periodEnd: string };
    today: {
        date: string;
        breakfast: number;
        lunch: number;
        dinner: number;
        guests: number;
        cutoffs: Slots<string>;
        passed: Slots<boolean>;
        frozen: boolean;
    } | null;
    money: { balance: number; meals: number; guestMeals: number; deposited: number; carriedIn: number; mealCost: number; mealRate: number };
    headcount: Slots<TgSlot> | null;
    siteUrl: string;
}

export interface TgHomeUnlinked {
    linked: false;
    firstName: string;
    linkUrl: string;
}

export type TgHome = TgHomeLinked | TgHomeUnlinked;
