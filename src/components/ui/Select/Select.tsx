"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePopover } from "../Popover/usePopover";
import styles from "./Select.module.css";

export interface SelectOption {
    value: string;
    label: string;
    /** Small grey line under the label */
    hint?: string;
    /** Colour of a leading dot, e.g. an expense category colour */
    dot?: string;
    disabled?: boolean;
}

export interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    /** Shown when no option matches `value` */
    placeholder?: string;
    className?: string;
    id?: string;
    disabled?: boolean;
    /** Lists longer than this get a search box */
    searchAbove?: number;
    "aria-label"?: string;
}

/**
 * The app's own dropdown. Replaces the browser's <select>: same popover as the
 * date and time pickers, themed, touch friendly, keyboard friendly.
 */
export function Select({
    value,
    onChange,
    options,
    placeholder,
    className,
    id,
    disabled,
    searchAbove = 8,
    "aria-label": ariaLabel,
}: SelectProps) {
    const t = useTranslations("picker");
    const { open, setOpen, close, pos, triggerRef, panelRef } = usePopover<HTMLButtonElement>();
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const typed = useRef({ text: "", at: 0 });
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [width, setWidth] = useState<number>();

    const selected = options.find((o) => o.value === value);
    const searchable = options.length > searchAbove;

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    }, [options, query]);

    function openPanel() {
        if (disabled) return;
        setQuery("");
        setWidth(triggerRef.current?.getBoundingClientRect().width);
        const i = options.findIndex((o) => o.value === value);
        setActive(Math.max(0, i));
        setOpen(true);
    }

    function choose(o: SelectOption | undefined) {
        if (!o || o.disabled) return;
        onChange(o.value);
        close();
    }

    // Focus the search box (or the list) as the panel opens, and keep the active row in view
    useEffect(() => {
        if (!open) return;
        (searchable ? searchRef.current : listRef.current)?.focus({ preventScroll: true });
    }, [open, searchable, pos]);

    useEffect(() => {
        if (!open) return;
        listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [open, active, pos]);

    function move(delta: number) {
        if (visible.length === 0) return;
        let i = active;
        for (let n = 0; n < visible.length; n++) {
            i = (i + delta + visible.length) % visible.length;
            if (!visible[i].disabled) break;
        }
        setActive(i);
    }

    function onPanelKeyDown(e: React.KeyboardEvent) {
        switch (e.key) {
            case "ArrowDown": e.preventDefault(); move(1); return;
            case "ArrowUp": e.preventDefault(); move(-1); return;
            case "Home": if (!searchable) { e.preventDefault(); setActive(0); } return;
            case "End": if (!searchable) { e.preventDefault(); setActive(Math.max(0, visible.length - 1)); } return;
            case "Enter": e.preventDefault(); choose(visible[active]); return;
            case "Tab": close(false); return;
        }
        // Type-ahead on short lists: "pr" jumps to "Protein"
        if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const now = Date.now();
            typed.current.text = now - typed.current.at > 700 ? e.key.toLowerCase() : typed.current.text + e.key.toLowerCase();
            typed.current.at = now;
            const i = visible.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
            if (i >= 0) setActive(i);
        }
    }

    const panel = open && (
        <div
            ref={panelRef}
            className={cn(styles.panel, pos?.placement === "top" && styles.panelTop)}
            style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                width: width ? Math.max(width, 180) : undefined,
                visibility: pos ? "visible" : "hidden",
            }}
            onKeyDown={onPanelKeyDown}
        >
            {searchable && (
                <label className={styles.search}>
                    <Search size={14} />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                        placeholder={t("search")}
                        aria-label={t("search")}
                    />
                </label>
            )}
            <div ref={listRef} className={styles.list} role="listbox" tabIndex={-1} aria-label={ariaLabel}>
                {visible.length === 0 && <p className={styles.empty}>{t("noResults")}</p>}
                {visible.map((o, i) => (
                    <button
                        key={o.value}
                        type="button"
                        role="option"
                        data-index={i}
                        tabIndex={-1}
                        disabled={o.disabled}
                        aria-selected={o.value === value}
                        className={cn(styles.option, i === active && styles.optionActive, o.value === value && styles.optionSelected)}
                        onPointerMove={() => i !== active && setActive(i)}
                        onClick={() => choose(o)}
                    >
                        {o.dot && <span className={styles.dot} style={{ background: o.dot }} />}
                        <span className={styles.optionText}>
                            <span className={styles.optionLabel}>{o.label}</span>
                            {o.hint && <span className={styles.optionHint}>{o.hint}</span>}
                        </span>
                        {o.value === value && <Check size={15} className={styles.check} />}
                    </button>
                ))}
            </div>
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
                onClick={() => (open ? close() : openPanel())}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        if (!open) openPanel();
                    }
                }}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
            >
                {selected?.dot && <span className={styles.dot} style={{ background: selected.dot }} />}
                <span className={cn(styles.triggerText, !selected && styles.placeholder)}>
                    {selected ? selected.label : placeholder ?? ""}
                </span>
                <ChevronDown size={14} className={cn(styles.triggerChevron, open && styles.triggerChevronOpen)} />
            </button>
            {panel && typeof document !== "undefined" && createPortal(panel, document.body)}
        </>
    );
}
