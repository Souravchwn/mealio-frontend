"use client";

/**
 * Printable monthly statement for one member: the balance, how it is made up, every deposit
 * and every day's meals. "Save as PDF" uses the browser's print dialog (no PDF library), and
 * "Share" sends a short text summary through the phone's share sheet.
 *
 *   /{locale}/my-summary/statement              the current period, for me
 *   ?month=YYYY-MM                              another period (closed months come from the archive)
 *   ?member=<id>                                another member (admin and manager only)
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatCurrency } from "@/lib/utils";
import type { MemberStatement } from "@/types";
import styles from "./statement.module.css";

export default function StatementPage() {
    return (
        <Suspense>
            <Statement />
        </Suspense>
    );
}

function Statement() {
    const t = useTranslations("statement");
    const tPay = useTranslations("expenses.payment");
    const locale = useLocale();
    const { token } = useAuth();
    const params = useSearchParams();
    const month = params.get("month") ?? undefined;
    const memberId = params.get("member") ?? undefined;

    const backHref = memberId ? `/${locale}/members` : `/${locale}/my-summary`;
    const [data, setData] = useState<MemberStatement | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.members
            .statement(token, { yearMonth: month, memberId })
            .then((s) => !cancelled && setData(s))
            .catch((err) => !cancelled && setError(err instanceof Error ? err.message : t("loadFailed")));
        return () => {
            cancelled = true;
        };
    }, [token, month, memberId, t]);

    const fmtDate = useMemo(
        () => (d: string) =>
            new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
                new Date(`${d}T00:00:00Z`),
            ),
        [locale],
    );
    const fmtDay = (d: string) =>
        new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
            new Date(`${d}T00:00:00Z`),
        );
    const num = (n: number) => new Intl.NumberFormat(locale).format(n);

    if (error) {
        return (
            <div className={styles.page}>
                <Link href={backHref} className={styles.back}><ArrowLeft size={16} /> {memberId ? t("backMembers") : t("back")}</Link>
                <p className={styles.error}>{error}</p>
            </div>
        );
    }
    if (!data) {
        return (
            <div className={styles.page}>
                <div className={styles.skeleton} />
            </div>
        );
    }

    const s = data;
    const ahead = s.balance >= 0;
    const period = `${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}`;
    const totals = s.days.reduce(
        (acc, d) => ({
            b: acc.b + d.breakfast,
            l: acc.l + d.lunch,
            d: acc.d + d.dinner,
            g: acc.g + d.guests,
        }),
        { b: 0, l: 0, d: 0, g: 0 },
    );

    const shareText = [
        `${s.messName} · ${s.memberName}`,
        period,
        `${t("meals")}: ${s.myMealCount} × ${formatCurrency(s.mealRate)} = ${formatCurrency(s.mealCost)}`,
        `${t("deposited")}: ${formatCurrency(s.deposited)}`,
        `${t("balance")}: ${ahead ? "+" : ""}${formatCurrency(s.balance)} (${ahead ? t("ahead") : t("owes")})`,
    ].join("\n");

    const share = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: t("title"), text: shareText });
            } else {
                await navigator.clipboard.writeText(shareText);
                toast.success(t("copied"));
            }
        } catch {
            /* the person closed the share sheet */
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.toolbar} data-print-hide>
                <Link href={backHref} className={styles.back}><ArrowLeft size={16} /> {memberId ? t("backMembers") : t("back")}</Link>
                <div className={styles.actions}>
                    <button type="button" className={styles.secondaryBtn} onClick={share}>
                        <Share2 size={16} /> {t("share")}
                    </button>
                    <button type="button" className={styles.primaryBtn} onClick={() => window.print()}>
                        <Download size={16} /> {t("savePdf")}
                    </button>
                </div>
            </div>

            <article className={styles.sheet} data-print-root>
                <header className={styles.head}>
                    <div>
                        <p className={styles.mess}>{s.messName}</p>
                        <h1 className={styles.title}>{t("title")}</h1>
                        <p className={styles.meta}>{s.memberName} · {period}</p>
                    </div>
                    <span className={cn(styles.badge, s.isClosed ? styles.badgeClosed : styles.badgeOpen)}>
                        {s.isClosed ? t("closed") : t("open")}
                    </span>
                </header>

                <section className={cn(styles.balance, ahead ? styles.ahead : styles.owes)}>
                    <span>{t("balance")}</span>
                    <strong className="num">{ahead ? "+" : ""}{formatCurrency(s.balance)}</strong>
                    <small>{ahead ? t("aheadHint") : t("owesHint")}</small>
                </section>

                <section>
                    <h2 className={styles.h2}>{t("howCalculated")}</h2>
                    <table className={styles.table}>
                        <tbody>
                            <tr><td>{t("deposited")}</td><td className="num">{formatCurrency(s.deposited)}</td></tr>
                            {s.carriedForward !== 0 && (
                                <tr><td>{t("carriedForward")}</td><td className="num">{formatCurrency(s.carriedForward)}</td></tr>
                            )}
                            {s.bazaarCredit !== 0 && (
                                <tr><td>{t("bazaarCredit")}</td><td className="num">{formatCurrency(s.bazaarCredit)}</td></tr>
                            )}
                            <tr>
                                <td>
                                    {t("mealCost")}
                                    <small className={styles.sub}>
                                        {t("mealsTimesRate", { meals: num(s.myMealCount), rate: formatCurrency(s.mealRate) })}
                                        {s.guestMealCount > 0 && s.guestMealPolicy === "HOST" && ` · ${t("includesGuests", { n: num(s.guestMealCount) })}`}
                                    </small>
                                </td>
                                <td className="num">− {formatCurrency(s.mealCost)}</td>
                            </tr>
                            <tr className={styles.total}>
                                <td>{t("balance")}</td>
                                <td className="num">{ahead ? "+" : ""}{formatCurrency(s.balance)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p className={styles.note}>
                        {t("messTotals", { expense: formatCurrency(s.totalExpense), rate: formatCurrency(s.mealRate) })}
                    </p>
                </section>

                <section>
                    <h2 className={styles.h2}>{t("deposits")}</h2>
                    {s.deposits.length === 0 ? (
                        <p className={styles.empty}>{t("noDeposits")}</p>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr><th>{t("date")}</th><th>{t("method")}</th><th className="num">{t("amount")}</th></tr>
                            </thead>
                            <tbody>
                                {s.deposits.map((d, i) => (
                                    <tr key={i}>
                                        <td>{fmtDate(d.date)}</td>
                                        <td>
                                            {tPay(`methods.${d.method ?? "UNKNOWN"}`)}
                                            {d.reference && <small className={styles.sub}>{d.reference}</small>}
                                        </td>
                                        <td className="num">{formatCurrency(d.amount)}</td>
                                    </tr>
                                ))}
                                <tr className={styles.total}>
                                    <td colSpan={2}>{t("total")}</td>
                                    <td className="num">{formatCurrency(s.deposited)}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </section>

                <section>
                    <h2 className={styles.h2}>{t("dailyMeals")}</h2>
                    {s.days.length === 0 ? (
                        <p className={styles.empty}>{t("noMeals")}</p>
                    ) : (
                        <table className={cn(styles.table, styles.days)}>
                            <thead>
                                <tr>
                                    <th>{t("date")}</th>
                                    <th className="num">{t("breakfast")}</th>
                                    <th className="num">{t("lunch")}</th>
                                    <th className="num">{t("dinner")}</th>
                                    <th className="num">{t("guests")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {s.days.map((d) => (
                                    <tr key={d.date} className={d.breakfast + d.lunch + d.dinner + d.guests === 0 ? styles.offDay : undefined}>
                                        <td>{fmtDay(d.date)}</td>
                                        <td className="num">{d.breakfast ? num(d.breakfast) : "–"}</td>
                                        <td className="num">{d.lunch ? num(d.lunch) : "–"}</td>
                                        <td className="num">{d.dinner ? num(d.dinner) : "–"}</td>
                                        <td className="num">{d.guests ? num(d.guests) : "–"}</td>
                                    </tr>
                                ))}
                                <tr className={styles.total}>
                                    <td>{t("total")}</td>
                                    <td className="num">{num(totals.b)}</td>
                                    <td className="num">{num(totals.l)}</td>
                                    <td className="num">{num(totals.d)}</td>
                                    <td className="num">{num(totals.g)}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </section>

                <footer className={styles.footer}>
                    {t("generated", {
                        date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(s.generatedAt)),
                    })}
                    {!s.isClosed && ` · ${t("openNote")}`}
                </footer>
            </article>
        </div>
    );
}
