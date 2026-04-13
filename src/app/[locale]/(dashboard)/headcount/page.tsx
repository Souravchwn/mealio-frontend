"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Users, UserPlus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { HeadcountResponse } from "@/types";
import styles from "./headcount.module.css";

export default function HeadcountPage() {
    const t = useTranslations("headcount");
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
    const total = data?.totalHeadcount ?? 0;

    return (
        <div className={styles.page}>
            {/* Big Number */}
            <div className={styles.bigNumberCard}>
                <div className={styles.bigNumberHeader}>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <button
                        className={cn(styles.refreshBtn, refreshing && styles.refreshing)}
                        onClick={handleRefresh}
                        aria-label="Refresh"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>

                <div className={styles.bigNumberWrap}>
                    <span className={cn(styles.bigNumber, isStale && styles.stale)}>
                        {data ? total : "—"}
                    </span>
                    <span className={styles.bigLabel}>
                        {t("preparing")} <strong>{data ? total : "—"}</strong>{" "}
                        {t("people")}
                    </span>
                </div>

                <div className={styles.breakdown}>
                    <div className={styles.breakdownItem}>
                        <div className={styles.breakdownIcon}>
                            <Users size={24} />
                        </div>
                        <div className={styles.breakdownInfo}>
                            <span className={styles.breakdownValue}>
                                {data?.memberCount ?? "—"}
                            </span>
                            <span className={styles.breakdownLabel}>{t("members")}</span>
                        </div>
                    </div>

                    <div className={styles.breakdownDivider} />

                    <div className={styles.breakdownItem}>
                        <div className={cn(styles.breakdownIcon, styles.breakdownIconAccent)}>
                            <UserPlus size={24} />
                        </div>
                        <div className={styles.breakdownInfo}>
                            <span className={styles.breakdownValue}>
                                {data?.guestCount ?? "—"}
                            </span>
                            <span className={styles.breakdownLabel}>{t("guests")}</span>
                        </div>
                    </div>
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
