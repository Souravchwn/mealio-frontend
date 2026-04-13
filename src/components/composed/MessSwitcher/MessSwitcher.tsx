"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./MessSwitcher.module.css";

interface MessItem {
    id: string;
    name: string;
    inviteCode: string;
    cutOffTime: string;
    isCurrent: boolean;
    role: string;
}

export function MessSwitcher() {
    const t = useTranslations("messSwitcher");
    const { user, token, login } = useAuth();
    const router = useRouter();
    const locale = useLocale();

    const [messes, setMesses] = useState<MessItem[]>([]);
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!token) return;
        api.mess.list(token).then((data) => setMesses(data.messes)).catch(() => {});
    }, [token]);

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Only render for ADMIN (always) or if 2+ messes
    if (user?.role !== "ADMIN" && messes.length < 2) return null;

    const current = messes.find((m) => m.isCurrent);

    async function handleSwitch(messId: string) {
        if (!token || !user || switching) return;
        setOpen(false);
        setSwitching(true);
        try {
            const res = await api.mess.switchMess(messId, token);
            // Update auth context with new token and new mess info
            login({ ...user, messId: res.mess.id, messName: res.mess.name }, res.accessToken);
            router.refresh();
            window.location.reload();
        } catch {
            setSwitching(false);
        }
    }

    return (
        <div className={styles.wrapper} ref={wrapperRef}>
            <button
                className={styles.trigger}
                onClick={() => setOpen((v) => !v)}
                aria-label={t("label")}
                disabled={switching}
            >
                <span className={styles.triggerName}>
                    {switching ? t("switching") : (current?.name ?? "Mess")}
                </span>
                <ChevronDown size={14} />
            </button>

            {open && (
                <div className={styles.dropdown}>
                    <div className={styles.dropdownLabel}>{t("label")}</div>
                    {messes.map((m) => (
                        <button
                            key={m.id}
                            className={`${styles.dropdownItem} ${m.isCurrent ? styles.dropdownItemActive : ""}`}
                            onClick={() => !m.isCurrent && handleSwitch(m.id)}
                            disabled={m.isCurrent}
                        >
                            <span className={m.isCurrent ? styles.activeDot : styles.inactiveDot} />
                            {m.name}
                        </button>
                    ))}
                    {user?.role === "ADMIN" && (
                        <button
                            className={`${styles.dropdownItem} ${styles.dropdownItemCreate}`}
                            onClick={() => { setOpen(false); router.push(`/${locale}/mess/create`); }}
                        >
                            <Plus size={14} />
                            {t("createNew")}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
