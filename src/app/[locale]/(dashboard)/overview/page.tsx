"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import {
    UtensilsCrossed,
    TrendingUp,
    Wallet,
    Users,
    Receipt,
    Grid3X3,
    ChefHat,
    ArrowRight,
    ArrowUpRight,
    Sun,
    CloudSun,
    Moon,
} from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { cn, formatCurrency, getTimeOfDay, getCategoryColor } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./overview.module.css";

interface TodayMeals {
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
}

interface RecentExpense {
    id: string;
    description: string;
    amount: number;
    category: string;
    date: string;
}

interface Stats {
    mealRate: number;
    balance: number;
    monthExpense: number;
    headcount: number;
}

export default function OverviewPage() {
    const t = useTranslations("overview");
    const tc = useTranslations("common");
    const locale = useLocale();
    const timeOfDay = getTimeOfDay();
    const { user, token } = useAuth();

    const [stats, setStats] = useState<Stats>({
        mealRate: 0,
        balance: 0,
        monthExpense: 0,
        headcount: 0,
    });
    const [todayMeals, setTodayMeals] = useState<TodayMeals>({
        breakfast: true,
        lunch: true,
        dinner: false,
    });
    const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !token) return;

        const today = new Date().toISOString().slice(0, 7); // YYYY-MM

        Promise.allSettled([
            api.expenses.getMealRate(user.messId, today, token),
            api.expenses.getExpenses(user.messId, today, token),
            api.cook.getHeadcount(user.messId, token),
            api.meals.getToday(user.id, token),
            api.members.me(token, today),
        ]).then(([rateRes, expensesRes, headcountRes, mealsRes, meRes]) => {
            if (rateRes.status === "fulfilled") {
                setStats((s) => ({ ...s, mealRate: Number(rateRes.value.mealRate) }));
            }
            if (expensesRes.status === "fulfilled") {
                const exps = expensesRes.value;
                const total = exps.reduce((sum, e) => sum + Number(e.amount), 0);
                setStats((s) => ({ ...s, monthExpense: total }));
                setRecentExpenses(
                    exps.slice(0, 5).map((e) => ({
                        id: e.id,
                        description: e.description || "",
                        amount: Number(e.amount),
                        category: e.category,
                        date: e.date,
                    }))
                );
            }
            if (headcountRes.status === "fulfilled") {
                setStats((s) => ({ ...s, headcount: headcountRes.value.totalHeadcount }));
            }
            if (mealsRes.status === "fulfilled") {
                const m = mealsRes.value;
                setTodayMeals({
                    breakfast: m.breakfast,
                    lunch: m.lunch,
                    dinner: m.dinner,
                });
            }
            if (meRes.status === "fulfilled") {
                setStats((s) => ({ ...s, balance: Number(meRes.value.balance) }));
            }
            setLoading(false);
        });
    }, [user, token]);

    const greeting = t("greeting", {
        timeOfDay: t(timeOfDay),
        name: user?.name?.split(" ")[0] ?? "Friend",
    });

    const mealIcons = {
        breakfast: <Sun size={24} />,
        lunch: <CloudSun size={24} />,
        dinner: <Moon size={24} />,
    };

    const statItems = [
        {
            key: "mealRate",
            label: t("mealRate"),
            value: formatCurrency(stats.mealRate),
            icon: <TrendingUp size={22} />,
            iconClass: styles.statIconPrimary,
            trend: null,
        },
        {
            key: "balance",
            label: t("yourBalance"),
            value: formatCurrency(stats.balance),
            icon: <Wallet size={22} />,
            iconClass: styles.statIconSuccess,
            trend: null,
        },
        {
            key: "monthExpense",
            label: t("monthExpense"),
            value: formatCurrency(stats.monthExpense),
            icon: <Receipt size={22} />,
            iconClass: styles.statIconAccent,
            trend: null,
        },
        {
            key: "headcount",
            label: t("headcountToday"),
            value: String(stats.headcount),
            icon: <Users size={22} />,
            iconClass: styles.statIconInfo,
            trend: null,
        },
    ];

    const quickActions = [
        { key: "toggleMeals", label: t("toggleMeals"), icon: <UtensilsCrossed size={20} />, href: `/${locale}/meals` },
        { key: "addExpense", label: t("addExpense"), icon: <Receipt size={20} />, href: `/${locale}/expenses` },
        { key: "viewMatrix", label: t("viewMatrix"), icon: <Grid3X3 size={20} />, href: `/${locale}/matrix` },
        { key: "viewHeadcount", label: t("viewHeadcount"), icon: <ChefHat size={20} />, href: `/${locale}/headcount` },
    ];

    return (
        <div className={styles.page}>
            <h2 className={styles.greeting}>{greeting}</h2>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                {statItems.map((stat, idx) => (
                    <div
                        key={stat.key}
                        className={styles.statCard}
                        style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                        <div className={cn(styles.statIcon, stat.iconClass)}>
                            {stat.icon}
                        </div>
                        <div className={styles.statContent}>
                            <div className={styles.statLabel}>{stat.label}</div>
                            <div className={styles.statValue}>
                                {loading ? "—" : stat.value}
                            </div>
                            {stat.trend && (
                                <div className={cn(styles.statTrend, styles.trendUp)}>
                                    <ArrowUpRight size={12} />
                                    {stat.trend} {tc("thisMonth")}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Two Column */}
            <div className={styles.twoColumn}>
                {/* Left — Today's Meals + Quick Actions */}
                <div>
                    <Card>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>{t("todayMeals")}</h3>
                            <Link href={`/${locale}/meals`} className={styles.viewAllLink}>
                                {tc("viewAll")}
                                <ArrowRight size={14} />
                            </Link>
                        </div>

                        <div className={styles.mealsPreview}>
                            {(["breakfast", "lunch", "dinner"] as const).map((slot) => (
                                <div
                                    key={slot}
                                    className={cn(
                                        styles.mealSlot,
                                        todayMeals[slot] && styles.mealSlotActive
                                    )}
                                >
                                    <span className={styles.mealSlotIcon}>
                                        {mealIcons[slot]}
                                    </span>
                                    <span className={styles.mealSlotLabel}>
                                        {slot.charAt(0).toUpperCase() + slot.slice(1)}
                                    </span>
                                    <span
                                        className={cn(
                                            styles.mealSlotStatus,
                                            todayMeals[slot] ? styles.mealStatusOn : styles.mealStatusOff
                                        )}
                                    >
                                        {todayMeals[slot] ? "ON" : "OFF"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <div style={{ marginTop: "var(--space-6)" }}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>{t("quickActions")}</h3>
                        </div>
                        <div className={styles.quickActions}>
                            {quickActions.map((action) => (
                                <Link key={action.key} href={action.href}>
                                    <div className={styles.quickAction}>
                                        <div className={styles.quickActionIcon}>{action.icon}</div>
                                        <span className={styles.quickActionLabel}>{action.label}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right — Recent Expenses */}
                <Card>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>{t("recentExpenses")}</h3>
                        <Link href={`/${locale}/expenses`} className={styles.viewAllLink}>
                            {tc("viewAll")}
                            <ArrowRight size={14} />
                        </Link>
                    </div>

                    <div className={styles.expenseList}>
                        {loading ? (
                            <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                                Loading…
                            </p>
                        ) : recentExpenses.length === 0 ? (
                            <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                                No expenses this month.
                            </p>
                        ) : (
                            recentExpenses.map((expense) => (
                                <div key={expense.id} className={styles.expenseItem}>
                                    <span
                                        className={styles.expenseDot}
                                        style={{ backgroundColor: getCategoryColor(expense.category as never) }}
                                    />
                                    <div className={styles.expenseInfo}>
                                        <div className={styles.expenseDesc}>{expense.description}</div>
                                        <div className={styles.expenseDate}>{expense.date}</div>
                                    </div>
                                    <div className={styles.expenseAmount}>
                                        {formatCurrency(expense.amount)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
