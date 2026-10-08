"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, CircleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatPeriodDay, usePeriod } from "@/contexts/PeriodContext";
import styles from "./PeriodNotice.module.css";

/**
 * Says where the books stand. Silent while the period is healthy.
 * When the period has ended and nobody closed it, records dated after it cannot be saved,
 * so everyone needs to know and the admin needs a way to fix it.
 */
export function PeriodNotice() {
    const t = useTranslations("period");
    const locale = useLocale();
    const { user } = useAuth();
    const { period } = usePeriod();

    if (!period || period.isClosed) return null;
    const isAdmin = user?.role === "ADMIN";
    const range = `${formatPeriodDay(period.startDate, locale)} – ${formatPeriodDay(period.endDate, locale)}`;

    if (period.overdue) {
        return (
            <div className={`${styles.notice} ${styles.warn}`} role="alert">
                <CircleAlert size={20} />
                <div className={styles.text}>
                    <b>{t("overdueTitle", { range })}</b>
                    <p>{isAdmin ? t("overdueAdmin") : t("overdueMember")}</p>
                </div>
                {isAdmin && (
                    <Link href={`/${locale}/matrix`} className={styles.action}>
                        {t("closeNow")}
                    </Link>
                )}
            </div>
        );
    }

    // Heads-up for the admin in the last days of the period
    if (isAdmin && period.daysLeft <= 2) {
        return (
            <div className={styles.notice} role="status">
                <CalendarClock size={20} />
                <div className={styles.text}>
                    <b>{t("endingTitle", { range })}</b>
                    <p>{period.daysLeft <= 0 ? t("endsToday") : t("endsIn", { n: period.daysLeft })}</p>
                </div>
            </div>
        );
    }
    return null;
}
