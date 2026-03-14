"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Users, UserPlus, ChefHat, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./headcount.module.css";

const MOCK_HEADCOUNT = {
    memberCount: 14,
    guestCount: 2,
    totalHeadcount: 16,
    messName: "Bashundhara Mess",
    date: "2026-03-15",
};

export default function HeadcountPage() {
    const t = useTranslations("headcount");
    const [data, setData] = useState(MOCK_HEADCOUNT);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [refreshing, setRefreshing] = useState(false);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setLastUpdated(new Date());
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    function handleRefresh() {
        setRefreshing(true);
        setTimeout(() => {
            setLastUpdated(new Date());
            setRefreshing(false);
        }, 800);
    }

    const timeSinceUpdate = Math.floor(
        (Date.now() - lastUpdated.getTime()) / 1000
    );
    const isStale = timeSinceUpdate > 60;

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
                        {data.totalHeadcount}
                    </span>
                    <span className={styles.bigLabel}>
                        {t("preparing")} <strong>{data.totalHeadcount}</strong>{" "}
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
                                {data.memberCount}
                            </span>
                            <span className={styles.breakdownLabel}>{t("members")}</span>
                        </div>
                    </div>

                    <div className={styles.breakdownDivider} />

                    <div className={styles.breakdownItem}>
                        <div
                            className={cn(styles.breakdownIcon, styles.breakdownIconAccent)}
                        >
                            <UserPlus size={24} />
                        </div>
                        <div className={styles.breakdownInfo}>
                            <span className={styles.breakdownValue}>
                                {data.guestCount}
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
