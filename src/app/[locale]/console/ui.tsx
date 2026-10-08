"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import styles from "./console.module.css";

type Tone = "good" | "warn" | "bad" | "brand" | "lime" | undefined;

const TONES: Record<string, Tone> = {
    ACTIVE: "good",
    APPROVED: "good",
    RESOLVED: "good",
    SUSPENDED: "bad",
    DELETED: "bad",
    REJECTED: "bad",
    HIGH: "bad",
    INACTIVE: "warn",
    PENDING: "warn",
    WARN: "warn",
    OPEN: "brand",
    WAITING_ON_USER: "lime",
};

export function toneOf(value: string): Tone {
    return TONES[value];
}

export function Pill({ value, label }: { value: string; label?: string }) {
    return (
        <span className={styles.pill} data-tone={toneOf(value)}>
            {label ?? value.replaceAll("_", " ").toLowerCase()}
        </span>
    );
}

/** "5m ago", "3h ago", "2d ago", then a date */
export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "never";
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
    if (pages <= 1) return null;
    return (
        <div className={styles.pager}>
            <button type="button" className={styles.pagerBtn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
                <ChevronLeft size={18} />
            </button>
            <span>
                Page {page} of {pages}
            </span>
            <button type="button" className={styles.pagerBtn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
                <ChevronRight size={18} />
            </button>
        </div>
    );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <label className={styles.search}>
            <Search size={16} />
            <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </label>
    );
}

export function Filters<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className={styles.filters}>
            {options.map((o) => (
                <button key={o} type="button" className={styles.filter} aria-pressed={value === o} onClick={() => onChange(o)}>
                    {o.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                </button>
            ))}
        </div>
    );
}
