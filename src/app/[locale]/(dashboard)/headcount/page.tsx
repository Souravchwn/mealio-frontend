"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Users, UserPlus, RefreshCw, Sun, CloudSun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { HeadcountResponse, MealHeadcount } from "@/types";
import styles from "./headcount.module.css";

type SlotKey = "breakfast" | "lunch" | "dinner";

export default function HeadcountPage() {
    const t = useTranslations("headcount");
    const tm = useTranslations("meals");
    const { user, token } = useAuth();

    const [data, setData] = useState<HeadcountResponse | null>(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [refreshing, setRefreshing] = useState(false);
    const [timeSinceUpdate, setTimeSinceUpdate] = useState(0);

    const fetchHeadcount = useCallback(async () => {
        if (!user || !token) return;
        try {
            const result = await api.cook.getHeadcount(user.messId, token);
            setData(result);
            setLastUpdated(new Date());
        } catch {
            // silently fail on background refresh
        }
    }, [user, token]);

    useEffect(() => {
        const id = setTimeout(fetchHeadcount, 0);
        return () => clearTimeout(id);
    }, [fetchHeadcount]);

    // Tick every second to keep timeSinceUpdate fresh
    useEffect(() => {
        const ticker = setInterval(() => {
            setTimeSinceUpdate(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
        }, 1000);
        return () => clearInterval(ticker);
    }, [lastUpdated]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchHeadcount, 30000);
        return () => clearInterval(interval);
    }, [fetchHeadcount]);

    async function handleRefresh() {
        setRefreshing(true);
        await fetchHeadcount();
        setRefreshing(false);
    }

    const isStale = timeSinceUpdate > 60;

    const slots: { key: SlotKey; icon: React.ReactNode; label: string }[] = [
        { key: "breakfast", icon: <Sun size={28} strokeWidth={1.75} />, label: tm("breakfast") },
        { key: "lunch", icon: <CloudSun size={28} strokeWidth={1.75} />, label: tm("lunch") },
        { key: "dinner", icon: <Moon size={28} strokeWidth={1.75} />, label: tm("dinner") },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <button
                        className={cn(styles.refreshBtn, refreshing && styles.refreshing)}
                        onClick={handleRefresh}
                        aria-label="Refresh"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>

                <div className={styles.mealGrid}>
                    {slots.map((slot) => {
                        const m: MealHeadcount | undefined = data?.meals[slot.key];
                        return (
                            <div
                                key={slot.key}
                                className={cn(styles.mealCard, isStale && styles.stale)}
                            >
                                <div className={styles.mealCardHead}>
                                    <span className={styles.mealIcon}>{slot.icon}</span>
                                    <span className={styles.mealName}>{slot.label}</span>
                                </div>

                                <span className={styles.bigNumber}>
                                    {m ? m.total : "—"}
                                </span>

                                <div className={styles.breakdown}>
                                    <div className={styles.breakdownItem}>
                                        <Users size={16} />
                                        <span className={styles.breakdownValue}>
                                            {m?.memberCount ?? "—"}
                                        </span>
                                        <span className={styles.breakdownLabel}>{t("members")}</span>
                                    </div>
                                    <div className={styles.breakdownItem}>
                                        <UserPlus size={16} />
                                        <span className={styles.breakdownValue}>
                                            {m?.guestCount ?? "—"}
                                        </span>
                                        <span className={styles.breakdownLabel}>{t("guests")}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.lastUpdated}>
                    {t("lastUpdated")}:{" "}
                    {lastUpdated.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                    {isStale && <span className={styles.staleBadge}>Stale</span>}
                </div>
            </div>
        </div>
    );
}
