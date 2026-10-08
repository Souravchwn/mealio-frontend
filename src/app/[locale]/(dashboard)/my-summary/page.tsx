"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sun, CloudSun, Moon, UserPlus, UtensilsCrossed, TrendingUp, Equal, Minus, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatCurrency, localISODate } from "@/lib/utils";
import { toast } from "sonner";
import styles from "./my-summary.module.css";

interface Summary {
    mealRate: number;
    myMealCount: number;
    ownMealCount: number;
    guestMealCount: number;
    guestMealPolicy: "HOST" | "SHARED";
    deposited: number;
    carriedForward: number;
    contributed: number;
    mealCost: number;
    balance: number;
    startDate?: string;
    endDate?: string;
}

interface DayLog {
    date: string;
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
}

export default function MySummaryPage() {
    const t = useTranslations("mySummary");
    const locale = useLocale();
    const { user, token } = useAuth();

    const [summary, setSummary] = useState<Summary | null>(null);
    const [week, setWeek] = useState<DayLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !token) return;
        const run = async () => {
            try {
                const me = await api.members.me(token);
                setSummary({
                    mealRate: me.mealRate,
                    myMealCount: me.myMealCount,
                    ownMealCount: me.ownMealCount ?? me.myMealCount,
                    guestMealCount: me.guestMealCount ?? 0,
                    guestMealPolicy: me.guestMealPolicy ?? "HOST",
                    deposited: me.deposited ?? me.contributed,
                    carriedForward: me.carriedForward ?? 0,
                    contributed: me.contributed,
                    mealCost: me.mealCost,
                    balance: me.balance,
                });

                // Last 7 days (local dates; the API never creates rows for past days)
                const days: Promise<DayLog>[] = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const date = localISODate(d);
                    days.push(
                        api.meals
                            .getToday(user.id, token, date)
                            .then((log) => ({ date, breakfast: log.breakfast, lunch: log.lunch, dinner: log.dinner }))
                            .catch(() => ({ date, breakfast: false, lunch: false, dinner: false })),
                    );
                }
                setWeek(await Promise.all(days));
            } catch (err) {
                toast.error(err instanceof Error ? err.message : t("loadFailed"));
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [user, token, t]);

    const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date());
    const fmtDay = (d: string) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
    const fmtNum = (d: string) => new Intl.NumberFormat(locale).format(Number(d.slice(8, 10)));
    const today = localISODate();

    const s = summary;
    const ahead = (s?.balance ?? 0) >= 0;

    return (
        <div className={styles.page}>
            <header>
                <p className={styles.eyebrow}>{monthLabel}</p>
                <h2 className={styles.title}>{t("title")}</h2>
            </header>

            {/* Balance hero */}
            <section className={cn(styles.hero, ahead ? styles.heroAhead : styles.heroOwe)}>
                <span className={styles.heroLabel}>{t("balance")}</span>
                {loading ? (
                    <span className={cn(styles.skeleton, styles.skeletonHero)} />
                ) : (
                    <span className={cn(styles.heroValue, "num")}>
                        {ahead ? "+" : ""}
                        {formatCurrency(s?.balance ?? 0)}
                    </span>
                )}
                <span className={styles.heroHint}>{ahead ? t("aheadHint") : t("oweHint")}</span>
            </section>

            {/* Stat tiles */}
            <section className={styles.tiles}>
                <div className={styles.tile}>
                    <span className={cn(styles.tileIcon, styles.tileViolet)}><TrendingUp size={18} /></span>
                    <span className={styles.tileLabel}>{t("mealRate")}</span>
                    <span className={cn(styles.tileValue, "num")}>{loading ? "—" : formatCurrency(s?.mealRate ?? 0)}</span>
                </div>
                <div className={styles.tile}>
                    <span className={cn(styles.tileIcon, styles.tileLime)}><UtensilsCrossed size={18} /></span>
                    <span className={styles.tileLabel}>{t("myMeals")}</span>
                    <span className={cn(styles.tileValue, "num")}>{loading ? "—" : s?.ownMealCount ?? 0}</span>
                </div>
                <div className={styles.tile}>
                    <span className={cn(styles.tileIcon, styles.tilePink)}><UserPlus size={18} /></span>
                    <span className={styles.tileLabel}>{t("guestMeals")}</span>
                    <span className={cn(styles.tileValue, "num")}>{loading ? "—" : s?.guestMealCount ?? 0}</span>
                </div>
            </section>

            {/* Receipt — how the balance is calculated */}
            <section className={styles.receipt}>
                <h3 className={styles.sectionTitle}>{t("howCalculated")}</h3>
                <div className={styles.receiptRows}>
                    <div className={styles.receiptRow}>
                        <span className={cn(styles.op, styles.opPlus)}><Plus size={12} strokeWidth={3} /></span>
                        <span className={styles.receiptLabel}>{t("deposited")}</span>
                        <span className={cn(styles.receiptValue, "num")}>{formatCurrency(s?.deposited ?? 0)}</span>
                    </div>
                    {(s?.carriedForward ?? 0) !== 0 && (
                        <div className={styles.receiptRow}>
                            <span className={cn(styles.op, styles.opPlus)}><Plus size={12} strokeWidth={3} /></span>
                            <span className={styles.receiptLabel}>{t("carriedForward")}</span>
                            <span className={cn(styles.receiptValue, "num")}>{formatCurrency(s?.carriedForward ?? 0)}</span>
                        </div>
                    )}
                    {(s?.contributed ?? 0) - (s?.deposited ?? 0) - (s?.carriedForward ?? 0) > 0.005 && (
                        <div className={styles.receiptRow}>
                            <span className={cn(styles.op, styles.opPlus)}><Plus size={12} strokeWidth={3} /></span>
                            <span className={styles.receiptLabel}>{t("bazaarCredit")}</span>
                            <span className={cn(styles.receiptValue, "num")}>
                                {formatCurrency((s?.contributed ?? 0) - (s?.deposited ?? 0) - (s?.carriedForward ?? 0))}
                            </span>
                        </div>
                    )}
                    <div className={styles.receiptRow}>
                        <span className={cn(styles.op, styles.opMinus)}><Minus size={12} strokeWidth={3} /></span>
                        <span className={styles.receiptLabel}>
                            {t("mealCost")}
                            <small className={styles.receiptSub}>
                                {t("mealsTimesRate", { meals: s?.myMealCount ?? 0, rate: formatCurrency(s?.mealRate ?? 0) })}
                                {(s?.guestMealCount ?? 0) > 0 && s?.guestMealPolicy === "HOST" && ` · ${t("includesGuests")}`}
                            </small>
                        </span>
                        <span className={cn(styles.receiptValue, "num")}>{formatCurrency(s?.mealCost ?? 0)}</span>
                    </div>
                    <div className={cn(styles.receiptRow, styles.receiptTotal)}>
                        <span className={cn(styles.op, ahead ? styles.opPlus : styles.opMinus)}><Equal size={12} strokeWidth={3} /></span>
                        <span className={styles.receiptLabel}>{t("balance")}</span>
                        <span className={cn(styles.receiptValue, "num", ahead ? styles.positive : styles.negative)}>
                            {ahead ? "+" : ""}
                            {formatCurrency(s?.balance ?? 0)}
                        </span>
                    </div>
                </div>
            </section>

            {/* Last 7 days */}
            <section className={styles.weekCard}>
                <div className={styles.weekHead}>
                    <h3 className={styles.sectionTitle}>{t("last7Days")}</h3>
                    <span className={styles.legend} aria-hidden>
                        <Sun size={12} /> <CloudSun size={12} /> <Moon size={12} />
                    </span>
                </div>
                <div className={styles.week}>
                    {(loading ? Array.from({ length: 7 }, (_, i) => ({ date: `x${i}`, breakfast: false, lunch: false, dinner: false })) : week).map((d) => {
                        const count = Number(d.breakfast) + Number(d.lunch) + Number(d.dinner);
                        const isToday = d.date === today;
                        return (
                            <div key={d.date} className={cn(styles.day, isToday && styles.dayToday)}>
                                <span className={styles.dayName}>{loading ? "" : fmtDay(d.date)}</span>
                                <span className={styles.dayNum}>{loading ? "" : fmtNum(d.date)}</span>
                                <span className={styles.dayDots} aria-label={t("mealsThatDay", { n: count })}>
                                    <span className={cn(styles.dot, d.breakfast && styles.dotB)} />
                                    <span className={cn(styles.dot, d.lunch && styles.dotL)} />
                                    <span className={cn(styles.dot, d.dinner && styles.dotD)} />
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
