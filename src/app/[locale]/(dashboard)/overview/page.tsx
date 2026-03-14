"use client";

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
import styles from "./overview.module.css";

// Mock data — replace with real API calls
const MOCK_STATS = {
    mealRate: 87.5,
    balance: 1250.0,
    totalMembers: 14,
    monthExpense: 45000.0,
    totalMeals: 514,
    headcount: 16,
};

const MOCK_TODAY_MEALS = {
    breakfast: true,
    lunch: true,
    dinner: false,
};

const MOCK_RECENT_EXPENSES = [
    { id: "1", desc: "Rui Fish — Karwan Bazar", amount: 850, category: "PROTEIN" as const, date: "2026-03-14" },
    { id: "2", desc: "Rice (25kg)", amount: 1400, category: "CARB" as const, date: "2026-03-14" },
    { id: "3", desc: "Mixed Vegetables", amount: 450, category: "VEGETABLE" as const, date: "2026-03-13" },
    { id: "4", desc: "Cooking Oil (5L)", amount: 680, category: "OIL" as const, date: "2026-03-13" },
];

export default function OverviewPage() {
    const t = useTranslations("overview");
    const tc = useTranslations("common");
    const locale = useLocale();
    const timeOfDay = getTimeOfDay();

    const greeting = t("greeting", {
        timeOfDay: t(timeOfDay),
        name: "Sourav",
    });

    const mealIcons = {
        breakfast: <Sun size={24} />,
        lunch: <CloudSun size={24} />,
        dinner: <Moon size={24} />,
    };

    const stats = [
        {
            key: "mealRate",
            label: t("mealRate"),
            value: formatCurrency(MOCK_STATS.mealRate, locale),
            icon: <TrendingUp size={22} />,
            iconClass: styles.statIconPrimary,
            trend: "+2.3%",
            trendDir: "up",
        },
        {
            key: "balance",
            label: t("yourBalance"),
            value: formatCurrency(MOCK_STATS.balance, locale),
            icon: <Wallet size={22} />,
            iconClass: styles.statIconSuccess,
            trend: null,
            trendDir: null,
        },
        {
            key: "monthExpense",
            label: t("monthExpense"),
            value: formatCurrency(MOCK_STATS.monthExpense, locale),
            icon: <Receipt size={22} />,
            iconClass: styles.statIconAccent,
            trend: "+12%",
            trendDir: "up",
        },
        {
            key: "headcount",
            label: t("headcountToday"),
            value: String(MOCK_STATS.headcount),
            icon: <Users size={22} />,
            iconClass: styles.statIconInfo,
            trend: "-1",
            trendDir: "down",
        },
    ];

    const quickActions = [
        {
            key: "toggleMeals",
            label: t("toggleMeals"),
            icon: <UtensilsCrossed size={20} />,
            href: `/${locale}/meals`,
        },
        {
            key: "addExpense",
            label: t("addExpense"),
            icon: <Receipt size={20} />,
            href: `/${locale}/expenses`,
        },
        {
            key: "viewMatrix",
            label: t("viewMatrix"),
            icon: <Grid3X3 size={20} />,
            href: `/${locale}/matrix`,
        },
        {
            key: "viewHeadcount",
            label: t("viewHeadcount"),
            icon: <ChefHat size={20} />,
            href: `/${locale}/headcount`,
        },
    ];

    return (
        <div className={styles.page}>
            {/* Greeting */}
            <h2 className={styles.greeting}>{greeting}</h2>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                {stats.map((stat, idx) => (
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
                            <div className={styles.statValue}>{stat.value}</div>
                            {stat.trend && (
                                <div
                                    className={cn(
                                        styles.statTrend,
                                        stat.trendDir === "up" ? styles.trendUp : styles.trendDown
                                    )}
                                >
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
                                        MOCK_TODAY_MEALS[slot] && styles.mealSlotActive
                                    )}
                                >
                                    <span className={styles.mealSlotIcon}>
                                        {mealIcons[slot]}
                                    </span>
                                    <span className={styles.mealSlotLabel}>
                                        {t(slot === "breakfast" ? "todayMeals" : slot === "lunch" ? "mealRate" : "yourBalance").split(" ")[0]}
                                    </span>
                                    <span
                                        className={cn(
                                            styles.mealSlotStatus,
                                            MOCK_TODAY_MEALS[slot]
                                                ? styles.mealStatusOn
                                                : styles.mealStatusOff
                                        )}
                                    >
                                        {MOCK_TODAY_MEALS[slot] ? "ON" : "OFF"}
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
                                        <div className={styles.quickActionIcon}>
                                            {action.icon}
                                        </div>
                                        <span className={styles.quickActionLabel}>
                                            {action.label}
                                        </span>
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
                        {MOCK_RECENT_EXPENSES.map((expense) => (
                            <div key={expense.id} className={styles.expenseItem}>
                                <span
                                    className={styles.expenseDot}
                                    style={{
                                        backgroundColor: getCategoryColor(expense.category),
                                    }}
                                />
                                <div className={styles.expenseInfo}>
                                    <div className={styles.expenseDesc}>{expense.desc}</div>
                                    <div className={styles.expenseDate}>{expense.date}</div>
                                </div>
                                <div className={styles.expenseAmount}>
                                    {formatCurrency(expense.amount, locale)}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
