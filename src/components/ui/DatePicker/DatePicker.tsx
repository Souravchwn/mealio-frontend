"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopover } from "../Popover/usePopover";
import styles from "./DatePicker.module.css";

/* ── Plain-date helpers (YYYY-MM-DD, no timezone drift) ─────────────────── */

type YMD = { y: number; m: number; d: number }; // m: 0–11

function parse(value: string | undefined | null): YMD | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return { y, m: m - 1, d };
}

function format({ y, m, d }: YMD): string {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toUTC({ y, m, d }: YMD): Date {
    return new Date(Date.UTC(y, m, d));
}

function fromUTC(date: Date): YMD {
    return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

function addDays(v: YMD, n: number): YMD {
    const date = toUTC(v);
    date.setUTCDate(date.getUTCDate() + n);
    return fromUTC(date);
}

function addMonths(v: YMD, n: number): YMD {
    const target = new Date(Date.UTC(v.y, v.m + n, 1));
    const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return { y: target.getUTCFullYear(), m: target.getUTCMonth(), d: Math.min(v.d, daysInTarget) };
}

function todayLocal(): YMD {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

/* ── Component ──────────────────────────────────────────────────────────── */

export interface DatePickerProps {
    /** YYYY-MM-DD */
    value: string;
    onChange: (value: string) => void;
    /** YYYY-MM-DD, inclusive */
    min?: string;
    /** YYYY-MM-DD, inclusive */
    max?: string;
    /** Extra classes for the trigger, e.g. the page's `.input` so sizes match */
    className?: string;
    id?: string;
    disabled?: boolean;
    "aria-label"?: string;
    /** 0 = Sunday … 6 = Saturday */
    weekStartsOn?: number;
    /** Show "Today" / "Yesterday" shortcuts */
    shortcuts?: boolean;
    /** Weekday numbers to tint as weekend (e.g. the mess's weekend setting) */
    weekendDays?: number[];
}

export function DatePicker({
    value,
    onChange,
    min,
    max,
    className,
    id,
    disabled,
    "aria-label": ariaLabel,
    weekStartsOn = 0,
    shortcuts = true,
    weekendDays = [],
}: DatePickerProps) {
    const t = useTranslations("picker");
    const locale = useLocale();
    const { open, setOpen, close, pos, triggerRef, panelRef } = usePopover<HTMLButtonElement>();

    const selected = parse(value);
    const today = todayLocal();
    const [focus, setFocus] = useState<YMD>(selected ?? today);
    const [view, setView] = useState<"days" | "months">("days");
    const gridRef = useRef<HTMLDivElement>(null);

    const minV = parse(min);
    const maxV = parse(max);
    const isDisabled = (v: YMD) =>
        (minV && format(v) < format(minV)) || (maxV && format(v) > format(maxV)) || false;

    // ── Localised labels ──
    const fmtTrigger = useMemo(
        () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        [locale],
    );
    const fmtMonthYear = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }), [locale]);
    const fmtMonthShort = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }), [locale]);
    const fmtFull = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }), [locale]);
    const fmtDay = useMemo(() => new Intl.NumberFormat(locale), [locale]);
    const fmtYear = useMemo(() => new Intl.NumberFormat(locale, { useGrouping: false }), [locale]);
    const weekdays = useMemo(() => {
        const f = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
        const long = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
        // 2023-01-01 was a Sunday
        return Array.from({ length: 7 }, (_, i) => {
            const dow = (weekStartsOn + i) % 7;
            const date = new Date(Date.UTC(2023, 0, 1 + dow));
            return { short: f.format(date), long: long.format(date), dow };
        });
    }, [locale, weekStartsOn]);

    // ── 6-week grid for the focused month ──
    const cells = useMemo(() => {
        const first = { y: focus.y, m: focus.m, d: 1 };
        const offset = (toUTC(first).getUTCDay() - weekStartsOn + 7) % 7;
        const start = addDays(first, -offset);
        return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    }, [focus.y, focus.m, weekStartsOn]);

    // Move keyboard focus to the focused day whenever it changes
    useEffect(() => {
        if (!open || view !== "days") return;
        const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${format(focus)}"]`);
        el?.focus({ preventScroll: true });
    }, [open, view, focus]);

    function openPicker() {
        if (disabled) return;
        setFocus(selected ?? today);
        setView("days");
        setOpen(!open);
    }

    function pick(v: YMD) {
        if (isDisabled(v)) return;
        onChange(format(v));
        close();
    }

    function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
        const moves: Record<string, () => YMD> = {
            ArrowLeft: () => addDays(focus, -1),
            ArrowRight: () => addDays(focus, 1),
            ArrowUp: () => addDays(focus, -7),
            ArrowDown: () => addDays(focus, 7),
            PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
            PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
            Home: () => addDays(focus, -((toUTC(focus).getUTCDay() - weekStartsOn + 7) % 7)),
            End: () => addDays(focus, 6 - ((toUTC(focus).getUTCDay() - weekStartsOn + 7) % 7)),
        };
        if (moves[e.key]) {
            e.preventDefault();
            setFocus(moves[e.key]());
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick(focus);
        }
    }

    const yesterday = addDays(today, -1);

    const panel = open && (
        <div
            ref={panelRef}
            className={cn(styles.panel, pos?.placement === "top" && styles.panelTop)}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
            role="dialog"
            aria-label={ariaLabel ?? t("chooseDate")}
        >
            {/* Header */}
            <div className={styles.header}>
                <button
                    type="button"
                    className={styles.titleBtn}
                    onClick={() => setView(view === "days" ? "months" : "days")}
                    aria-label={view === "days" ? t("chooseMonth") : t("backToDays")}
                >
                    {view === "days" ? fmtMonthYear.format(toUTC({ ...focus, d: 1 })) : fmtYear.format(focus.y)}
                    <ChevronDown size={14} className={cn(styles.titleChevron, view === "months" && styles.titleChevronUp)} />
                </button>
                <div className={styles.navGroup}>
                    <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() => setFocus(addMonths(focus, view === "days" ? -1 : -12))}
                        aria-label={view === "days" ? t("prevMonth") : t("prevYear")}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        type="button"
                        className={styles.navBtn}
                        onClick={() => setFocus(addMonths(focus, view === "days" ? 1 : 12))}
                        aria-label={view === "days" ? t("nextMonth") : t("nextYear")}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {view === "days" ? (
                <>
                    <div className={styles.weekdays} aria-hidden>
                        {weekdays.map((w) => (
                            <span key={w.dow} className={cn(styles.weekday, weekendDays.includes(w.dow) && styles.weekdayEnd)} title={w.long}>
                                {w.short}
                            </span>
                        ))}
                    </div>
                    <div className={styles.grid} role="grid" ref={gridRef} onKeyDown={onGridKey}>
                        {cells.map((c) => {
                            const key = format(c);
                            const outside = c.m !== focus.m;
                            const isSel = selected && key === format(selected);
                            const isToday = key === format(today);
                            const off = isDisabled(c);
                            const isFocus = key === format(focus);
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    role="gridcell"
                                    data-date={key}
                                    tabIndex={isFocus ? 0 : -1}
                                    disabled={off}
                                    aria-selected={!!isSel}
                                    aria-current={isToday ? "date" : undefined}
                                    aria-label={fmtFull.format(toUTC(c))}
                                    onClick={() => pick(c)}
                                    onFocus={() => !isFocus && setFocus(c)}
                                    className={cn(
                                        styles.day,
                                        outside && styles.dayOutside,
                                        isToday && styles.dayToday,
                                        isSel && styles.daySelected,
                                    )}
                                >
                                    {fmtDay.format(c.d)}
                                </button>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className={styles.months}>
                    {Array.from({ length: 12 }, (_, m) => {
                        const isSel = selected && selected.y === focus.y && selected.m === m;
                        const isNow = today.y === focus.y && today.m === m;
                        return (
                            <button
                                key={m}
                                type="button"
                                className={cn(styles.month, isNow && styles.dayToday, isSel && styles.daySelected)}
                                onClick={() => {
                                    setFocus(addMonths({ ...focus, m, d: 1 }, 0));
                                    setView("days");
                                }}
                            >
                                {fmtMonthShort.format(new Date(Date.UTC(focus.y, m, 1)))}
                            </button>
                        );
                    })}
                </div>
            )}

            {shortcuts && view === "days" && (
                <div className={styles.footer}>
                    <button type="button" className={styles.chip} disabled={isDisabled(today)} onClick={() => pick(today)}>
                        {t("today")}
                    </button>
                    <button type="button" className={styles.chip} disabled={isDisabled(yesterday)} onClick={() => pick(yesterday)}>
                        {t("yesterday")}
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                disabled={disabled}
                className={cn(styles.trigger, open && styles.triggerOpen, className)}
                onClick={openPicker}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={ariaLabel}
            >
                <CalendarDays size={16} className={styles.triggerIcon} />
                <span className={cn(styles.triggerText, !selected && styles.placeholder)}>
                    {selected ? fmtTrigger.format(toUTC(selected)) : t("chooseDate")}
                </span>
                <ChevronDown size={14} className={cn(styles.triggerChevron, open && styles.triggerChevronOpen)} />
            </button>
            {panel && typeof document !== "undefined" && createPortal(panel, document.body)}
        </>
    );
}
