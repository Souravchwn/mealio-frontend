"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GAP = 6;
const EDGE = 8;

export type PopoverPosition = { top: number; left: number; placement: "bottom" | "top" };

/**
 * Anchored floating panel: rendered in a portal with fixed positioning so it
 * is never clipped by modals or scroll containers. Opens below the trigger,
 * flips above when there is no room, and stays inside the viewport.
 * Closes on outside click and Escape.
 *
 * Usage: put `triggerRef` on the button and `panelRef` (a callback ref) on the
 * portalled panel; render the panel only while `open`, styled with `pos`.
 */
export function usePopover<T extends HTMLElement = HTMLButtonElement>() {
    const [open, setOpenState] = useState(false);
    const [pos, setPos] = useState<PopoverPosition | null>(null);
    const triggerRef = useRef<T>(null);
    const panelEl = useRef<HTMLDivElement | null>(null);

    const place = useCallback(() => {
        const trigger = triggerRef.current;
        const panel = panelEl.current;
        if (!trigger || !panel) return;
        const t = trigger.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const fitsBelow = t.bottom + GAP + p.height <= vh - EDGE;
        const fitsAbove = t.top - GAP - p.height >= EDGE;
        const placement = fitsBelow || !fitsAbove ? "bottom" : "top";
        const top = placement === "bottom"
            ? Math.min(t.bottom + GAP, Math.max(EDGE, vh - EDGE - p.height))
            : t.top - GAP - p.height;
        const left = Math.min(Math.max(EDGE, t.left), Math.max(EDGE, vw - EDGE - p.width));
        setPos({ top, left, placement });
    }, []);

    /** Callback ref: measures the panel as soon as it mounts. */
    const panelRef = useCallback((el: HTMLDivElement | null) => {
        panelEl.current = el;
        if (el) place();
    }, [place]);

    const setOpen = useCallback((value: boolean) => {
        setOpenState(value);
        if (!value) setPos(null);
    }, []);

    const close = useCallback((refocus = true) => {
        setOpen(false);
        if (refocus) triggerRef.current?.focus();
    }, [setOpen]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: PointerEvent) => {
            const target = e.target as Node;
            if (panelEl.current?.contains(target) || triggerRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener("pointerdown", onPointer, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            document.removeEventListener("pointerdown", onPointer, true);
            document.removeEventListener("keydown", onKey, true);
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, place, setOpen, close]);

    return { open, setOpen, close, pos, triggerRef, panelRef, panelEl };
}
