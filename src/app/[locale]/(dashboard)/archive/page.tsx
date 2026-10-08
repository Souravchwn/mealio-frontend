"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Archive, ChevronRight, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/utils";
import type { ArchivePeriodRow } from "@/types/archive";
import styles from "./archive.module.css";

/** Every closed month of the mess. Open to all members so anyone can check the books. */
export default function ArchivePage() {
    const t = useTranslations("archive");
    const locale = useLocale();
    const { token } = useAuth();
    const [periods, setPeriods] = useState<ArchivePeriodRow[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.archive
            .list(token)
            .then((r) => !cancelled && setPeriods(r.periods))
            .catch(() => !cancelled && setFailed(true));
        return () => {
            cancelled = true;
        };
    }, [token]);

    const fmt = (iso: string, withYear = false) =>
        new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle")}</p>
                <p className={styles.trust}><Lock size={14} /> {t("frozenNote")}</p>
            </header>

            {failed && <p className={styles.empty}>{t("loadFailed")}</p>}
            {periods === null && !failed && (
                <div className={styles.list}>
                    {[0, 1].map((i) => <div key={i} className={styles.skeleton} />)}
                </div>
            )}
            {periods?.length === 0 && (
                <div className={styles.empty}>
                    <Archive size={28} />
                    <p>{t("empty")}</p>
                </div>
            )}

            <div className={styles.list}>
                {periods?.map((p) => (
                    <Link key={p.yearMonth} href={`/${locale}/archive/${p.yearMonth}`} className={styles.card}>
                        <div className={styles.cardTop}>
                            <span className={styles.range}>{fmt(p.startDate)} – {fmt(p.endDate, true)}</span>
                            <ChevronRight size={18} />
                        </div>
                        <div className={styles.cardStats}>
                            <div className={styles.rateTile}>
                                <span className={styles.statLabel}>{t("mealRate")}</span>
                                <span className={`${styles.rateValue} num`}>{formatCurrency(p.mealRate)}</span>
                            </div>
                            <div>
                                <span className={styles.statLabel}>{t("totalExpense")}</span>
                                <span className={`${styles.statValue} num`}>{formatCurrency(p.totalExpense)}</span>
                            </div>
                            <div>
                                <span className={styles.statLabel}>{t("totalMeals")}</span>
                                <span className={`${styles.statValue} num`}>{p.totalMeals ?? "–"}</span>
                            </div>
                        </div>
                        {p.closedAt && <span className={styles.closedAt}><Lock size={12} /> {t("closedOn", { date: fmt(p.closedAt.slice(0, 10), true) })}</span>}
                    </Link>
                ))}
            </div>
        </div>
    );
}
