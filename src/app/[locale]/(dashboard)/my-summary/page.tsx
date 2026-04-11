"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Sun, CloudSun, Moon, Users } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import styles from "./my-summary.module.css";

interface MonthlySummary {
    breakfastCount: number;
    lunchCount: number;
    dinnerCount: number;
    guestMeals: number;
    totalSlots: number;
    mealCost: number;
    contributed: number;
    balance: number;
    mealRate: number;
}

interface WeekLog {
    date: string;
    dayLabel: string;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
    frozen: boolean;
}

export default function MySummaryPage() {
    const t = useTranslations("mySummary");
    const tc = useTranslations("common");
    const locale = useLocale();
    const { user, token } = useAuth();

    const currentMonth = new Date().toISOString().slice(0, 7);

    const [summary, setSummary] = useState<MonthlySummary | null>(null);
    const [weekLogs, setWeekLogs] = useState<WeekLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !token) return;

        const fetchData = async () => {
            try {
                const [expensesRes, rateRes] = await Promise.allSettled([
                    api.expenses.getExpenses(user.messId, currentMonth, token),
                    api.expenses.getMealRate(user.messId, currentMonth, token),
                ]);

                const expenses = expensesRes.status === "fulfilled" ? expensesRes.value : [];
                const mealRate = rateRes.status === "fulfilled" ? Number(rateRes.value.mealRate) : 0;

                // Fetch last 7 days of logs
                const today = new Date();
                const weekLogPromises: Promise<WeekLog | null>[] = [];

                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(today.getDate() - i);
                    const dateStr = d.toISOString().slice(0, 10);
                    const dayLabel = d.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-US", { weekday: "short" });

                    weekLogPromises.push(
                        api.meals
                            .getToday(user.id, token, dateStr)
                            .then((log) => ({
                                date: dateStr,
                                dayLabel,
                                breakfast: log.breakfast,
                                lunch: log.lunch,
                                dinner: log.dinner,
                                frozen: log.frozen,
                            }))
                            .catch(() => ({
                                date: dateStr,
                                dayLabel,
                                breakfast: false,
                                lunch: false,
                                dinner: false,
                                frozen: false,
                            }))
                    );
                }

                const resolvedLogs = (await Promise.all(weekLogPromises)).filter(Boolean) as WeekLog[];
                setWeekLogs(resolvedLogs);

                // Compute monthly totals from week logs context; use meal rate for cost
                // For full month summary, we compute from matrix if available
                const contributed = expenses
                    .filter((e) => e.memberId === user.id)
                    .reduce((s, e) => s + Number(e.amount), 0);

                // Estimate from week logs (only last 7 days visible here)
                const bfCount = resolvedLogs.filter((l) => l.breakfast).length;
                const lunchCount = resolvedLogs.filter((l) => l.lunch).length;
                const dinnerCount = resolvedLogs.filter((l) => l.dinner).length;
                const totalSlots = bfCount + lunchCount + dinnerCount;
                const mealCost = totalSlots * mealRate;
                const balance = contributed - mealCost;

                setSummary({
                    breakfastCount: bfCount,
                    lunchCount,
                    dinnerCount,
                    guestMeals: 0,
                    totalSlots,
                    mealCost,
                    contributed,
                    balance,
                    mealRate,
                });
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to load summary");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user, token, currentMonth, locale]);

    if (loading) {
        return <div className={styles.loading}>{tc("loading")}</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle", { month: currentMonth })}</p>
            </div>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{t("mealRate")}</span>
                    <span className={styles.statValue}>
                        {formatCurrency(summary?.mealRate ?? 0, locale)}
                    </span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{t("totalMeals")}</span>
                    <span className={styles.statValue}>{summary?.totalSlots ?? 0}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{t("contributed")}</span>
                    <span className={styles.statValue}>
                        {formatCurrency(summary?.contributed ?? 0, locale)}
                    </span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{t("mealCost")}</span>
                    <span className={styles.statValue}>
                        {formatCurrency(summary?.mealCost ?? 0, locale)}
                    </span>
                </div>
                <div className={styles.statCard} style={{ gridColumn: "span 2" }}>
                    <span className={styles.statLabel}>{t("balance")}</span>
                    <span
                        className={`${styles.statValue} ${
                            (summary?.balance ?? 0) >= 0
                                ? styles.statValuePositive
                                : styles.statValueNegative
                        }`}
                    >
                        {(summary?.balance ?? 0) >= 0 ? "+" : ""}
                        {formatCurrency(summary?.balance ?? 0, locale)}
                    </span>
                </div>
            </div>

            {/* Meal Breakdown */}
            <Card>
                <h3 className={styles.sectionTitle}>{t("mealBreakdown")}</h3>
                <div className={styles.mealBreakdown}>
                    {[
                        { key: "breakfast", icon: <Sun size={16} />, label: t("breakfast"), count: summary?.breakfastCount ?? 0 },
                        { key: "lunch", icon: <CloudSun size={16} />, label: t("lunch"), count: summary?.lunchCount ?? 0 },
                        { key: "dinner", icon: <Moon size={16} />, label: t("dinner"), count: summary?.dinnerCount ?? 0 },
                        { key: "guest", icon: <Users size={16} />, label: t("guestMeals"), count: summary?.guestMeals ?? 0 },
                    ].map((item) => (
                        <div key={item.key} className={styles.mealRow}>
                            <div className={styles.mealLabel}>
                                <div className={styles.mealIcon}>{item.icon}</div>
                                {item.label}
                            </div>
                            <span className={styles.mealCount}>{item.count} {t("times")}</span>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Last 7 Days Calendar Strip */}
            <Card>
                <h3 className={styles.sectionTitle}>{t("last7Days")}</h3>
                <div className={styles.calendarStrip}>
                    {weekLogs.map((log) => (
                        <div key={log.date} className={styles.calendarDay}>
                            <span className={styles.calendarDayLabel}>{log.dayLabel}</span>
                            <div className={styles.calendarDaySlots}>
                                <div
                                    className={`${styles.calendarSlot} ${
                                        log.breakfast ? styles.calendarSlotOn : styles.calendarSlotOff
                                    } ${log.frozen ? styles.calendarSlotFrozen : ""}`}
                                    title="Breakfast"
                                />
                                <div
                                    className={`${styles.calendarSlot} ${
                                        log.lunch ? styles.calendarSlotOn : styles.calendarSlotOff
                                    } ${log.frozen ? styles.calendarSlotFrozen : ""}`}
                                    title="Lunch"
                                />
                                <div
                                    className={`${styles.calendarSlot} ${
                                        log.dinner ? styles.calendarSlotOn : styles.calendarSlotOff
                                    } ${log.frozen ? styles.calendarSlotFrozen : ""}`}
                                    title="Dinner"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Financial Summary */}
            <Card>
                <h3 className={styles.sectionTitle}>{t("financialSummary")}</h3>
                <div className={styles.financeCard}>
                    <div className={styles.financeRow}>
                        <span className={styles.financeLabel}>{t("contributed")}</span>
                        <span className={styles.financeValue}>
                            {formatCurrency(summary?.contributed ?? 0, locale)}
                        </span>
                    </div>
                    <div className={styles.financeRow}>
                        <span className={styles.financeLabel}>{t("mealCost")}</span>
                        <span className={styles.financeValue}>
                            − {formatCurrency(summary?.mealCost ?? 0, locale)}
                        </span>
                    </div>
                    <div className={styles.financeRow}>
                        <span className={styles.financeLabel}>{t("balance")}</span>
                        <span
                            className={`${styles.financeValue} ${
                                (summary?.balance ?? 0) >= 0 ? styles.positiveValue : styles.negativeValue
                            }`}
                        >
                            {(summary?.balance ?? 0) >= 0 ? "+" : ""}
                            {formatCurrency(summary?.balance ?? 0, locale)}
                        </span>
                    </div>
                </div>
            </Card>
        </div>
    );
}
