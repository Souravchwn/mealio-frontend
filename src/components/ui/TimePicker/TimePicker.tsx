"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopover } from "../Popover/usePopover";
import styles from "./TimePicker.module.css";

function parse(value: string | undefined | null): { h: number; m: number } | null {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(":").map(Number);
    return { h, m };
}

function toValue(h: number, m: number): string {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface TimePickerProps {
    /** HH:MM, 24-hour */
    value: string;
    onChange: (value: string) => void;
    /** Minute increments shown in the list (the current value is always included) */
    minuteStep?: number;
    className?: string;
    id?: string;
    disabled?: boolean;
    "aria-label"?: string;
}

export function TimePicker({
    value,
    onChange,
    minuteStep = 5,
    className,
    id,
    disabled,
    "aria-label": ariaLabel,
}: TimePickerProps) {
    const t = useTranslations("picker");
    const locale = useLocale();
    const { open, setOpen, close, pos, triggerRef, panelRef } = usePopover<HTMLButtonElement>();
    const columnsRef = useRef<HTMLDivElement>(null);

    const current = parse(value);
    const h24 = current?.h ?? 9;
    const minute = current?.m ?? 0;
    const isPm = h24 >= 12;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

    const fmtTime = useMemo(
        () => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }),
        [locale],
    );
    const fmtNum = useMemo(() => new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }), [locale]);
    const fmtHour = useMemo(() => new Intl.NumberFormat(locale), [locale]);
    // Localised AM / PM labels
    const periods = useMemo(() => {
        const label = (hour: number) =>
            fmtTime.formatToParts(new Date(Date.UTC(2023, 0, 1, hour))).find((p) => p.type === "dayPeriod")?.value
            ?? (hour < 12 ? "AM" : "PM");
        return { am: label(9), pm: label(21) };
    }, [fmtTime]);

    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const minutes = useMemo(() => {
        const list = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep).filter((m) => m < 60);
        if (!list.includes(minute)) list.push(minute);
        return list.sort((a, b) => a - b);
    }, [minuteStep, minute]);

    // Bring the selected options into view when the panel opens
    useEffect(() => {
        if (!open) return;
        columnsRef.current
            ?.querySelectorAll<HTMLElement>("[aria-selected='true']")
            .forEach((el) => el.scrollIntoView({ block: "center" }));
    }, [open, pos]);

    function set(next: { h12?: number; m?: number; pm?: boolean }) {
        const hour12 = next.h12 ?? h12;
        const pm = next.pm ?? isPm;
        const hour24 = (hour12 % 12) + (pm ? 12 : 0);
        onChange(toValue(hour24, next.m ?? minute));
    }

    const preview = fmtTime.format(new Date(Date.UTC(2023, 0, 1, h24, minute)));

    const panel = open && (
        <div
            ref={panelRef}
            className={cn(styles.panel, pos?.placement === "top" && styles.panelTop)}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
            role="dialog"
            aria-label={ariaLabel ?? t("chooseTime")}
        >
            <div className={styles.preview}>{preview}</div>

            <div className={styles.columns} ref={columnsRef}>
                <div className={styles.column} role="listbox" aria-label={t("hour")}>
                    {hours.map((h) => (
                        <button
                            key={h}
                            type="button"
                            role="option"
                            aria-selected={h === h12}
                            className={cn(styles.option, h === h12 && styles.optionSelected)}
                            onClick={() => set({ h12: h })}
                        >
                            {fmtHour.format(h)}
                        </button>
                    ))}
                </div>
                <div className={styles.column} role="listbox" aria-label={t("minute")}>
                    {minutes.map((m) => (
                        <button
                            key={m}
                            type="button"
                            role="option"
                            aria-selected={m === minute}
                            className={cn(styles.option, m === minute && styles.optionSelected)}
                            onClick={() => set({ m })}
                        >
                            {fmtNum.format(m)}
                        </button>
                    ))}
                </div>
                <div className={cn(styles.column, styles.columnShort)} role="listbox" aria-label="AM / PM">
                    {[false, true].map((pm) => (
                        <button
                            key={String(pm)}
                            type="button"
                            role="option"
                            aria-selected={pm === isPm}
                            className={cn(styles.option, pm === isPm && styles.optionSelected)}
                            onClick={() => set({ pm })}
                        >
                            {pm ? periods.pm : periods.am}
                        </button>
                    ))}
                </div>
            </div>

            <button type="button" className={styles.done} onClick={() => close()}>
                {t("done")}
            </button>
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
                onClick={() => !disabled && setOpen(!open)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={ariaLabel}
            >
                <Clock size={16} className={styles.triggerIcon} />
                <span className={cn(styles.triggerText, !current && styles.placeholder)}>
                    {current ? preview : t("chooseTime")}
                </span>
                <ChevronDown size={14} className={cn(styles.triggerChevron, open && styles.triggerChevronOpen)} />
            </button>
            {panel && typeof document !== "undefined" && createPortal(panel, document.body)}
        </>
    );
}
