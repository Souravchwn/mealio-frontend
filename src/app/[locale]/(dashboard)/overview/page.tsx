"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
    UtensilsCrossed,
    TrendingUp,
    Users,
    Receipt,
    Grid3X3,
    ChefHat,
    ArrowUpRight,
    Sun,
    CloudSun,
    Moon,
    Sparkles,
    Wallet,
    Clock,
} from "lucide-react";
import { cn, formatCurrency, getTimeOfDay, getCategoryColor } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { usePeriod, formatPeriodDay } from "@/contexts/PeriodContext";
import styles from "./overview.module.css";

type Slot = "breakfast" | "lunch" | "dinner";

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
    myMeals: number;
}

const MEAL_SLOTS: { key: Slot; Icon: typeof Sun }[] = [
    { key: "breakfast", Icon: Sun },
    { key: "lunch", Icon: CloudSun },
    { key: "dinner", Icon: Moon },
];

export default function OverviewPage() {
    const t = useTranslations("overview");
    const tm = useTranslations("meals");
    const locale = useLocale();
    const timeOfDay = getTimeOfDay();
    const { user, token } = useAuth();
    const { period } = usePeriod();
    const tp = useTranslations("period");

    const [stats, setStats] = useState<Stats>({ mealRate: 0, balance: 0, monthExpense: 0, headcount: 0, myMeals: 0 });
    const [todayMeals, setTodayMeals] = useState<Record<Slot, boolean>>({ breakfast: false, lunch: false, dinner: false });
    const [nextCutoff, setNextCutoff] = useState<{ time: string; passed: boolean } | null>(null);
    const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !token) return;

        Promise.allSettled([
            api.members.me(token),
            api.expenses.getExpenses({ messId: user.messId, limit: 5 }, token),
            api.cook.getHeadcount(user.messId, token),
            api.meals.getToday(user.id, token),
        ]).then(([meRes, expensesRes, headcountRes, mealsRes]) => {
            if (meRes.status === "fulfilled") {
                const me = meRes.value;
                setStats((s) => ({
                    ...s,
                    mealRate: Number(me.mealRate),
                    monthExpense: Number(me.totalExpense),
                    balance: Number(me.balance),
                    myMeals: Number(me.myMealCount),
                }));
            }
            if (expensesRes.status === "fulfilled") {
                setRecentExpenses(
                    expensesRes.value.expenses.map((e) => ({
                        id: e.id,
                        description: e.description || "",
                        amount: Number(e.amount),
                        category: e.category,
                        date: e.date,
                    })),
                );
            }
            if (headcountRes.status === "fulfilled") {
                setStats((s) => ({ ...s, headcount: headcountRes.value.totalHeadcount }));
            }
            if (mealsRes.status === "fulfilled") {
                const m = mealsRes.value;
                setTodayMeals({ breakfast: m.breakfast, lunch: m.lunch, dinner: m.dinner });
                setNextCutoff({ time: m.cutOffTime, passed: m.cutOffPassed });
            }
            setLoading(false);
        });
    }, [user, token]);

    const firstName = user?.name?.split(" ")[0] ?? "";
    const greeting = t("greeting", { timeOfDay: t(timeOfDay), name: firstName });
    const todayLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short" }).format(new Date());
    const fmtDate = (d: string) =>
        new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

    const ahead = stats.balance >= 0;
    const mealsOn = MEAL_SLOTS.filter((s) => todayMeals[s.key]).length;
    const canAddExpense = user?.role === "ADMIN" || user?.role === "MANAGER";
    const canSeeMatrix = user?.role === "ADMIN" || user?.role === "MANAGER";

    const quickActions = [
        { key: "toggleMeals", label: t("toggleMeals"), Icon: UtensilsCrossed, href: `/${locale}/meals`, tone: styles.toneViolet, show: true },
        { key: "addExpense", label: t("addExpense"), Icon: Receipt, href: `/${locale}/expenses`, tone: styles.toneLime, show: canAddExpense },
        { key: "viewHeadcount", label: t("viewHeadcount"), Icon: ChefHat, href: `/${locale}/headcount`, tone: styles.tonePink, show: true },
        { key: "viewMatrix", label: t("viewMatrix"), Icon: Grid3X3, href: `/${locale}/matrix`, tone: styles.toneBlue, show: canSeeMatrix },
    ].filter((a) => a.show);

    return (
        <div className={styles.page}>
            {/* Greeting */}
            <header className={styles.greetingRow}>
                <p className={styles.greetingMeta}>{todayLabel}</p>
                {period && (
                    <p className={styles.periodLine}>
                        {tp("label", { range: `${formatPeriodDay(period.startDate, locale)} – ${formatPeriodDay(period.endDate, locale)}` })}
                    </p>
                )}
                <h2 className={styles.greeting}>{greeting}</h2>
            </header>

            {/* ── Bento ─────────────────────────────────────────────────── */}
            <section className={styles.bento}>
                {/* Balance hero */}
                <Link href={`/${locale}/my-summary`} className={cn(styles.hero, ahead ? styles.heroAhead : styles.heroOwe)}>
                    <div className={styles.heroTop}>
                        <span className={styles.heroLabel}>
                            <Wallet size={16} /> {t("yourBalance")}
                        </span>
                        <ArrowUpRight size={20} className={styles.heroArrow} />
                    </div>
                    {loading ? (
                        <span className={cn(styles.skeleton, styles.skeletonHero)} />
                    ) : (
                        <span className={cn(styles.heroValue, "num")}>{formatCurrency(stats.balance)}</span>
                    )}
                    <div className={styles.heroFooter}>
                        <span className={cn(styles.heroChip, ahead ? styles.heroChipAhead : styles.heroChipOwe)}>
                            {ahead ? t("youAreAhead") : t("youOwe")}
                        </span>
                        <span className={styles.heroMeta}>
                            {t("myMealsCount", { n: stats.myMeals })}
                        </span>
                    </div>
                    <Sparkles className={styles.heroSparkle} size={88} aria-hidden />
                </Link>

                {/* Today's meals */}
                <Link href={`/${locale}/meals`} className={styles.mealsCard}>
                    <div className={styles.cardHead}>
                        <h3 className={styles.cardTitle}>{t("todayMeals")}</h3>
                        <span className={styles.mealsCount}>
                            <span className="num">{mealsOn}</span>/3
                        </span>
                    </div>
                    <div className={styles.mealTiles}>
                        {MEAL_SLOTS.map(({ key, Icon }) => (
                            <span key={key} className={cn(styles.mealTile, todayMeals[key] && styles.mealTileOn)}>
                                <Icon size={22} />
                                <span className={styles.mealTileLabel}>{tm(key)}</span>
                                <span className={styles.mealTileStatus}>{todayMeals[key] ? tm("on") : tm("off")}</span>
                            </span>
                        ))}
                    </div>
                    {nextCutoff && (
                        <span className={cn(styles.cutoffNote, nextCutoff.passed && styles.cutoffNoteDone)}>
                            <Clock size={14} />
                            {nextCutoff.passed ? tm("cutoffPassed") : tm("cutoffAt", { time: nextCutoff.time })}
                        </span>
                    )}
                </Link>

                {/* Small stats */}
                <div className={cn(styles.stat, styles.statViolet)}>
                    <span className={styles.statIcon}><TrendingUp size={18} /></span>
                    <span className={styles.statLabel}>{t("mealRate")}</span>
                    {loading ? <span className={styles.skeleton} /> : <span className={cn(styles.statValue, "num")}>{formatCurrency(stats.mealRate)}</span>}
                </div>
                <div className={cn(styles.stat, styles.statLime)}>
                    <span className={styles.statIcon}><Receipt size={18} /></span>
                    <span className={styles.statLabel}>{t("monthExpense")}</span>
                    {loading ? <span className={styles.skeleton} /> : <span className={cn(styles.statValue, "num")}>{formatCurrency(stats.monthExpense)}</span>}
                </div>
                <Link href={`/${locale}/headcount`} className={cn(styles.stat, styles.statPink, styles.statWide)}>
                    <span className={styles.statIcon}><Users size={18} /></span>
                    <span className={styles.statLabel}>{t("headcountToday")}</span>
                    {loading ? <span className={styles.skeleton} /> : <span className={cn(styles.statValue, "num")}>{stats.headcount}</span>}
                </Link>
            </section>

            {/* Quick actions */}
            <section>
                <h3 className={styles.sectionTitle}>{t("quickActions")}</h3>
                <div className={styles.actions}>
                    {quickActions.map(({ key, label, Icon, href, tone }) => (
                        <Link key={key} href={href} className={cn(styles.action, tone)}>
                            <span className={styles.actionIcon}><Icon size={20} /></span>
                            <span className={styles.actionLabel}>{label}</span>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Recent bazaar */}
            <section className={styles.listCard}>
                <div className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>{t("recentExpenses")}</h3>
                    <Link href={`/${locale}/expenses`} className={styles.viewAll}>
                        {t("viewAll")} <ArrowUpRight size={14} />
                    </Link>
                </div>
                {loading ? (
                    <div className={styles.listSkeleton}>
                        {[0, 1, 2].map((i) => <span key={i} className={styles.skeletonRow} />)}
                    </div>
                ) : recentExpenses.length === 0 ? (
                    <p className={styles.empty}>{t("noExpenses")}</p>
                ) : (
                    <ul className={styles.expenseList}>
                        {recentExpenses.map((e) => (
                            <li key={e.id} className={styles.expenseItem}>
                                <span
                                    className={styles.expenseBadge}
                                    style={{ "--cat": getCategoryColor(e.category as never) } as React.CSSProperties}
                                >
                                    {(e.description || e.category).charAt(0).toUpperCase()}
                                </span>
                                <span className={styles.expenseInfo}>
                                    <span className={styles.expenseDesc}>{e.description || e.category}</span>
                                    <span className={styles.expenseDate}>{fmtDate(e.date)}</span>
                                </span>
                                <span className={cn(styles.expenseAmount, "num")}>{formatCurrency(e.amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
