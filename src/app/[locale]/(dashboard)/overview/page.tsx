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
    Sun,
    CloudSun,
    Moon,
} from "lucide-react";
import { cn, formatCurrency, getTimeOfDay, getCategoryColor, getCurrentYearMonth } from "@/lib/utils";
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

const MEAL_SLOTS = [
    { key: "breakfast" as const, icon: <Sun size={20} />,      labelKey: "breakfast" },
    { key: "lunch"     as const, icon: <CloudSun size={20} />, labelKey: "lunch" },
    { key: "dinner"    as const, icon: <Moon size={20} />,     labelKey: "dinner" },
];

export default function OverviewPage() {
    const t  = useTranslations("overview");
    const tm = useTranslations("meals");
    const locale = useLocale();
    const timeOfDay = getTimeOfDay();
    const { user, token } = useAuth();

    const [stats, setStats] = useState<Stats>({ mealRate: 0, balance: 0, monthExpense: 0, headcount: 0 });
    const [todayMeals, setTodayMeals] = useState<TodayMeals>({ breakfast: false, lunch: false, dinner: false });
    const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !token) return;
        const yearMonth = getCurrentYearMonth();

        Promise.allSettled([
            // members/me returns mealRate + totalExpense (mess-wide) + balance — one call covers three stats
            api.members.me(token, yearMonth),
            // limit 5 — recent list only; totals come from members/me above
            api.expenses.getExpenses({ messId: user.messId, yearMonth, limit: 5 }, token),
            api.cook.getHeadcount(user.messId, token),
            api.meals.getToday(user.id, token),
        ]).then(([meRes, expensesRes, headcountRes, mealsRes]) => {
            if (meRes.status === "fulfilled") {
                const me = meRes.value;
                setStats((s) => ({
                    ...s,
                    mealRate:     Number(me.mealRate),
                    monthExpense: Number(me.totalExpense),
                    balance:      Number(me.balance),
                }));
            }
            if (expensesRes.status === "fulfilled") {
                setRecentExpenses(
                    expensesRes.value.expenses.map((e) => ({
                        id:          e.id,
                        description: e.description || "",
                        amount:      Number(e.amount),
                        category:    e.category,
                        date:        e.date,
                    }))
                );
            }
            if (headcountRes.status === "fulfilled")
                setStats((s) => ({ ...s, headcount: headcountRes.value.totalHeadcount }));
            if (mealsRes.status === "fulfilled") {
                const m = mealsRes.value;
                setTodayMeals({ breakfast: m.breakfast, lunch: m.lunch, dinner: m.dinner });
            }
            setLoading(false);
        });
    }, [user, token]);

    const firstName = user?.name?.split(" ")[0] ?? "Friend";
    const greeting  = t("greeting", { timeOfDay: t(timeOfDay), name: firstName });

    // Format date as "Monday, 14 Apr 2026"
    const todayLabel = new Date().toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "short", year: "numeric",
    });

    const statItems = [
        {
            key: "mealRate",
            label: t("mealRate"),
            value: formatCurrency(stats.mealRate),
            icon: <TrendingUp size={18} />,
            iconClass: styles.statIconPrimary,
            cardClass: styles.statCardPrimary,
        },
        {
            key: "balance",
            label: t("yourBalance"),
            value: formatCurrency(stats.balance),
            icon: <Wallet size={18} />,
            iconClass: stats.balance >= 0 ? styles.statIconSuccess : styles.statIconDanger,
            cardClass: stats.balance >= 0 ? styles.statCardSuccess : styles.statCardDanger,
            valueClass: stats.balance >= 0 ? styles.balancePositive : styles.balanceNegative,
        },
        {
            key: "monthExpense",
            label: t("monthExpense"),
            value: formatCurrency(stats.monthExpense),
            icon: <Receipt size={18} />,
            iconClass: styles.statIconAccent,
            cardClass: styles.statCardAccent,
        },
        {
            key: "headcount",
            label: t("headcountToday"),
            value: String(stats.headcount),
            icon: <Users size={18} />,
            iconClass: styles.statIconInfo,
            cardClass: styles.statCardInfo,
        },
    ];

    const quickActions = [
        { key: "toggleMeals",   label: t("toggleMeals"),   icon: <UtensilsCrossed size={18} />, href: `/${locale}/meals` },
        { key: "addExpense",    label: t("addExpense"),    icon: <Receipt size={18} />,         href: `/${locale}/expenses` },
        { key: "viewMatrix",    label: t("viewMatrix"),    icon: <Grid3X3 size={18} />,         href: `/${locale}/matrix` },
        { key: "viewHeadcount", label: t("viewHeadcount"), icon: <ChefHat size={18} />,         href: `/${locale}/headcount` },
    ];

    // Filter quick actions by role
    const canSeeExpenses = user?.role === "ADMIN" || user?.role === "MANAGER";
    const canSeeMatrix   = user?.role === "ADMIN";
    const filteredActions = quickActions.filter((a) => {
        if (a.key === "addExpense" && !canSeeExpenses) return false;
        if (a.key === "viewMatrix" && !canSeeMatrix) return false;
        return true;
    });

    return (
        <div className={styles.page}>
            {/* Greeting */}
            <div className={styles.greetingRow}>
                <div className={styles.greetingText}>
                    <h2 className={styles.greeting}>{greeting}</h2>
                    <p className={styles.greetingMeta}>{todayLabel} · {user?.messName}</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                {statItems.map((stat) => (
                    <div key={stat.key} className={cn(styles.statCard, stat.cardClass)}>
                        <div className={styles.statTop}>
                            <span className={styles.statLabel}>{stat.label}</span>
                            <span className={cn(styles.statIcon, stat.iconClass)}>{stat.icon}</span>
                        </div>
                        {loading ? (
                            <div className={styles.statValueSkeleton} />
                        ) : (
                            <div className={cn(styles.statValue, stat.valueClass)}>{stat.value}</div>
                        )}
                    </div>
                ))}
            </div>

            {/* Two-column */}
            <div className={styles.twoColumn}>
                {/* Left: meals + quick actions */}
                <div className={styles.leftCol}>
                    {/* Today's Meals */}
                    <div className={styles.sectionCard}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>{t("todayMeals")}</h3>
                            <Link href={`/${locale}/meals`} className={styles.viewAllLink}>
                                Manage <ArrowRight size={13} />
                            </Link>
                        </div>
                        <div className={styles.mealsPreview}>
                            {MEAL_SLOTS.map((slot) => (
                                <div
                                    key={slot.key}
                                    className={cn(
                                        styles.mealSlot,
                                        todayMeals[slot.key] && styles.mealSlotActive
                                    )}
                                >
                                    <span className={styles.mealSlotIcon}>{slot.icon}</span>
                                    <span className={styles.mealSlotLabel}>{tm(slot.labelKey)}</span>
                                    <span className={cn(
                                        styles.mealSlotStatus,
                                        todayMeals[slot.key] ? styles.mealStatusOn : styles.mealStatusOff
                                    )}>
                                        {todayMeals[slot.key] ? tm("on") : tm("off")}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className={styles.sectionCard}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>{t("quickActions")}</h3>
                        </div>
                        <div className={styles.quickActions}>
                            {filteredActions.map((action) => (
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

                {/* Right: Recent Expenses */}
                <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>{t("recentExpenses")}</h3>
                        {canSeeExpenses && (
                            <Link href={`/${locale}/expenses`} className={styles.viewAllLink}>
                                View all <ArrowRight size={13} />
                            </Link>
                        )}
                    </div>
                    <div className={styles.expenseList}>
                        {loading ? (
                            <p className={styles.emptyState}>Loading…</p>
                        ) : recentExpenses.length === 0 ? (
                            <p className={styles.emptyState}>No expenses this month.</p>
                        ) : (
                            recentExpenses.map((expense) => (
                                <div key={expense.id} className={styles.expenseItem}>
                                    <span
                                        className={styles.expenseDot}
                                        style={{ backgroundColor: getCategoryColor(expense.category as never) }}
                                    />
                                    <div className={styles.expenseInfo}>
                                        <div className={styles.expenseDesc}>
                                            {expense.description || expense.category}
                                        </div>
                                        <div className={styles.expenseDate}>{expense.date}</div>
                                    </div>
                                    <div className={styles.expenseAmount}>
                                        {formatCurrency(expense.amount)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
