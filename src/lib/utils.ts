import { ExpenseCategory } from "@/types";

/**
 * Format a number as BDT currency
 */
export function formatCurrency(amount: number): string {
    return `৳ ${amount.toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Format a date string
 */
export function formatDate(
    dateStr: string,
    format: "short" | "long" | "day" = "long"
): string {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions =
        format === "short"
            ? { month: "short", day: "numeric" }
            : format === "day"
                ? { weekday: "short", month: "short", day: "numeric" }
                : { year: "numeric", month: "long", day: "numeric" };

    return date.toLocaleDateString("en-US", options);
}

/** "Oct 7, 3:42 PM" in the viewer's own time zone */
export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
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

/**
 * Today's date (YYYY-MM-DD) in the browser's own timezone.
 * Use this instead of `new Date().toISOString().slice(0, 10)`, which is the UTC date
 * (in Dhaka that is still "yesterday" until 6 AM).
 */
export function localISODate(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
