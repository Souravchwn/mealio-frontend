"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Ban, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatCurrency, getCategoryColor } from "@/lib/utils";
import { MemoGallery } from "@/components/composed/Memo/MemoGallery";
import type { ArchiveDetail } from "@/types/archive";
import styles from "../archive.module.css";

type Tab = "members" | "bazaar" | "deposits" | "days";

/** One closed month in full, read-only. Every figure here was frozen when the month was closed. */
export default function ArchiveMonthPage() {
    const t = useTranslations("archive");
    const tx = useTranslations("expenses");
    const locale = useLocale();
    const { yearMonth } = useParams<{ yearMonth: string }>();
    const { user, token } = useAuth();
    const [data, setData] = useState<ArchiveDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("members");

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.archive
            .get(yearMonth, token)
            .then((d) => !cancelled && setData(d))
            .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t("loadFailed")));
        return () => {
            cancelled = true;
        };
    }, [yearMonth, token, t]);

    const fmt = (iso: string, withYear = false) =>
        new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

    const back = (
        <Link href={`/${locale}/archive`} className={styles.back}>
            <ArrowLeft size={16} /> {t("title")}
        </Link>
    );

    if (error) return <div className={styles.page}>{back}<p className={styles.empty}>{error}</p></div>;
    if (!data) return <div className={styles.page}>{back}<div className={styles.skeleton} /></div>;

    const tabs: Array<{ key: Tab; label: string }> = [
        { key: "members", label: t("tabs.members") },
        { key: "bazaar", label: t("tabs.bazaar", { n: data.bazaar.length }) },
        { key: "deposits", label: t("tabs.deposits", { n: data.deposits.length }) },
        { key: "days", label: t("tabs.days") },
    ];

    return (
        <div className={styles.page}>
            {back}
            <header className={styles.header}>
                <h2 className={styles.title}>{fmt(data.startDate)} – {fmt(data.endDate, true)}</h2>
                <p className={styles.trust}>
                    <Lock size={14} />
                    {data.closedAt ? t("closedOn", { date: fmt(data.closedAt.slice(0, 10), true) }) : t("closed")}. {t("frozenNote")}
                </p>
            </header>

            <div className={styles.bento}>
                <div className={cn(styles.tile, styles.tileHot)}>
                    <span className={styles.statLabel}>{t("mealRate")}</span>
                    <span className={`${styles.bigValue} num`}>{formatCurrency(data.totals.mealRate)}</span>
                    <span className={styles.tileHint}>{t("rateHow", { expense: formatCurrency(data.totals.totalExpense), meals: data.totals.totalMeals })}</span>
                </div>
                <div className={styles.tile}>
                    <span className={styles.statLabel}>{t("totalExpense")}</span>
                    <span className={`${styles.statValue} num`}>{formatCurrency(data.totals.totalExpense)}</span>
                </div>
                <div className={styles.tile}>
                    <span className={styles.statLabel}>{t("totalMeals")}</span>
                    <span className={`${styles.statValue} num`}>{data.totals.totalMeals}</span>
                    {data.totals.totalGuestMeals > 0 && <span className={styles.tileHint}>{t("guestMealsNote", { n: data.totals.totalGuestMeals })}</span>}
                </div>
                <div className={styles.tile}>
                    <span className={styles.statLabel}>{t("totalDeposits")}</span>
                    <span className={`${styles.statValue} num`}>{formatCurrency(data.totals.totalDeposits)}</span>
                </div>
            </div>

            <p className={styles.rules}>
                {t("rules", {
                    guests: data.settings.guestMealPolicy === "HOST" ? t("guestsHost") : t("guestsShared"),
                    bazaar: data.settings.bazaarCountsAsDeposit ? t("bazaarCredited") : t("bazaarNotCredited"),
                })}
            </p>

            <div className={styles.tabs} role="tablist">
                {tabs.map((x) => (
                    <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={styles.tab} onClick={() => setTab(x.key)}>
                        {x.label}
                    </button>
                ))}
            </div>

            {tab === "members" && (
                <div className={styles.rows}>
                    <div className={cn(styles.row, styles.rowHead)} aria-hidden>
                        <span>{t("member")}</span><span>{t("meals")}</span><span>{t("cost")}</span><span>{t("deposited")}</span><span>{t("balance")}</span>
                    </div>
                    {data.members.map((m) => (
                        <div key={m.id} className={cn(styles.row, m.id === user?.id && styles.rowMe)}>
                            <span className={styles.rowName}>
                                {m.name}
                                {m.id === user?.id && <em className={styles.you}>{t("you")}</em>}
                            </span>
                            <span data-label={t("meals")}>{m.billableMeals}{m.guestMeals > 0 && <small> ({t("withGuests", { n: m.guestMeals })})</small>}</span>
                            <span data-label={t("cost")} className="num">{formatCurrency(m.mealCost)}</span>
                            <span data-label={t("deposited")} className="num">
                                {formatCurrency(m.deposited + m.bazaarCredit)}
                                {m.carriedForward !== 0 && <small> ({t("carriedIn", { amount: formatCurrency(m.carriedForward) })})</small>}
                            </span>
                            <span data-label={t("balance")} className={cn("num", styles.balance, m.balance >= 0 ? styles.pos : styles.neg)}>
                                {m.balance < 0 && "−"}{formatCurrency(Math.abs(m.balance))}
                                <small>{m.balance >= 0 ? t("getsBack") : t("owes")}</small>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {tab === "bazaar" && (
                <div className={styles.stack}>
                    {data.bazaar.length === 0 && <p className={styles.empty}>{t("noBazaar")}</p>}
                    {data.bazaar.map((b) => (
                        <article key={b.id} className={cn(styles.entry, b.isVoided && styles.voided)}>
                            <div className={styles.entryHead}>
                                <b>{fmt(b.date, true)}</b>
                                <span className={`${styles.entryTotal} num`}>{formatCurrency(b.total)}</span>
                            </div>
                            <p className={styles.entryMeta}>
                                {b.shoppers.length > 0 ? t("wentBy", { names: b.shoppers.map((s) => s.name).join(", ") }) : t("noShoppers")}
                                {b.recordedBy && ` · ${t("recordedBy", { name: b.recordedBy })}`}
                                {b.note && ` · ${b.note}`}
                            </p>
                            {b.isVoided && <p className={styles.voidNote}><Ban size={12} /> {t("voided", { reason: b.voidReason ?? "" })}</p>}
                            <ul className={styles.items}>
                                {b.items.map((i) => (
                                    <li key={i.id}>
                                        <span className={styles.dot} style={{ background: getCategoryColor(i.category) }} />
                                        <span>{tx(`categories.${i.category}`)}{i.description ? `: ${i.description}` : ""}</span>
                                        <span className="num">{formatCurrency(i.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                            {token && <MemoGallery sessionId={b.id} memos={b.memos} token={token} />}
                        </article>
                    ))}
                </div>
            )}

            {tab === "deposits" && (
                <div className={styles.stack}>
                    {data.deposits.length === 0 && <p className={styles.empty}>{t("noDeposits")}</p>}
                    {data.deposits.map((d) => (
                        <article key={d.id} className={cn(styles.entry, styles.entryCompact, d.isVoided && styles.voided)}>
                            <div className={styles.entryHead}>
                                <b>{d.memberName}</b>
                                <span className={`${styles.entryTotal} num`}>{formatCurrency(d.amount)}</span>
                            </div>
                            <p className={styles.entryMeta}>
                                {fmt(d.date, true)}{d.note && ` · ${d.note}`}{d.recordedBy && ` · ${t("recordedBy", { name: d.recordedBy })}`}
                            </p>
                            {d.isVoided && <p className={styles.voidNote}><Ban size={12} /> {t("voided", { reason: d.voidReason ?? "" })}</p>}
                        </article>
                    ))}
                </div>
            )}

            {tab === "days" && (
                <div className={styles.gridWrap}>
                    <table className={styles.grid}>
                        <thead>
                            <tr>
                                <th>{t("member")}</th>
                                {data.dates.map((d) => <th key={d}>{Number(d.slice(8))}</th>)}
                                <th>{t("total")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.members.map((m) => (
                                <tr key={m.id} className={m.id === user?.id ? styles.rowMe : undefined}>
                                    <th scope="row">{m.name}</th>
                                    {m.dailyMeals.map((n, i) => {
                                        const g = m.dailyGuestMeals[i];
                                        return (
                                            <td key={data.dates[i]} className={n === 0 && g === 0 ? styles.zero : undefined} title={data.dates[i]}>
                                                {n || "·"}{g > 0 && <sup>+{g}</sup>}
                                            </td>
                                        );
                                    })}
                                    <td className={styles.gridTotal}>{m.billableMeals}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className={styles.gridNote}>{t("daysNote")}</p>
                </div>
            )}
        </div>
    );
}
