import { ExpenseCategory } from "@/types";

/**
 * Format a number as BDT currency
 */
export function formatCurrency(
    amount: number,
    locale: string = "en"
): string {
    if (locale === "bn") {
        return `৳ ${toBanglaNumber(amount.toFixed(2))}`;
    }
    return `৳ ${amount.toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Convert a number to Bangla numerals
 */
export function toBanglaNumber(num: string | number): string {
    const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    return String(num).replace(/[0-9]/g, (d) => banglaDigits[parseInt(d)]);
}

/**
 * Format a date string
 */
export function formatDate(
    dateStr: string,
    locale: string = "en",
    format: "short" | "long" | "day" = "long"
): string {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions =
        format === "short"
            ? { month: "short", day: "numeric" }
            : format === "day"
                ? { weekday: "short", month: "short", day: "numeric" }
                : { year: "numeric", month: "long", day: "numeric" };

    const loc = locale === "bn" ? "bn-BD" : "en-US";
    return date.toLocaleDateString(loc, options);
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function getTodayISO(): string {
    return new Date().toISOString().split("T")[0];
}

/**
 * Get current year-month as YYYY-MM
 */
export function getCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Get the color for an expense category
 */
export function getCategoryColor(category: ExpenseCategory): string {
    const colors: Record<ExpenseCategory, string> = {
        PROTEIN: "#ef4444",
        CARB: "#f59e0b",
        VEGETABLE: "#10b981",
        SPICE: "#8b5cf6",
        OIL: "#f97316",
        UTILITY: "#3b82f6",
        OTHER: "#6b7280",
    };
    return colors[category] ?? "#6b7280";
}

/**
 * Get the icon name for an expense category
 */
export function getCategoryIcon(category: ExpenseCategory): string {
    const icons: Record<ExpenseCategory, string> = {
        PROTEIN: "drumstick",
        CARB: "wheat",
        VEGETABLE: "carrot",
        SPICE: "flame",
        OIL: "droplets",
        UTILITY: "zap",
        OTHER: "package",
    };
    return icons[category] ?? "package";
}

/**
 * Get the time-of-day greeting key
 */
export function getTimeOfDay(): "morning" | "afternoon" | "evening" {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
}

/**
 * Class name helper — joins class names, filtering falsy values
 */
export function cn(...classes: (string | false | undefined | null)[]): string {
    return classes.filter(Boolean).join(" ");
}

/**
 * Generate initials from a name
 */
export function getInitials(name: string): string {
    return name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}
