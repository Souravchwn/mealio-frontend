"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Phone-only call to action. It stays hidden while the hero buttons or the closing
 * call to action are on screen, so the same button never shows twice.
 */
export function StickyCta({ watch, className, children }: { watch: string[]; className: string; children: ReactNode }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const targets = watch.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
        if (!targets.length || !("IntersectionObserver" in window)) return;
        const onScreen = new Set<Element>();
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (e.isIntersecting) onScreen.add(e.target);
                else onScreen.delete(e.target);
            }
            // Only once the hero has been scrolled past, never before it
            const heroPassed = targets[0].getBoundingClientRect().bottom < 0;
            setVisible(heroPassed && onScreen.size === 0);
        });
        targets.forEach((t) => io.observe(t));
        return () => io.disconnect();
    }, [watch]);

    return (
        <div className={className} data-visible={visible} aria-hidden={!visible} inert={!visible}>
            {children}
        </div>
    );
}
