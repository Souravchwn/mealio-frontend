"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
    ScrollText, UtensilsCrossed, Receipt, Users, Settings, ChevronLeft, ChevronRight, RefreshCw,
    Lock, Wallet, Ban, ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import styles from "./audit.module.css";

type AuditEntry = {
    id: string;
    actorName: string;
    action: string;
    targetTable: string | null;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    createdAt: string;
};

/** Filter chips: label key + the action codes they match (first one is sent to the API). */
const FILTERS = [
    { key: "all", action: "" },
    { key: "meals", action: "TOGGLE_MEAL" },
    { key: "overrides", action: "ADMIN_MEAL_OVERRIDE" },
    { key: "noCook", action: "NO_COOK" },
    { key: "bazaar", action: "ADD_BAZAAR_SESSION" },
    { key: "deposits", action: "ADD_CONTRIBUTION" },
    { key: "members", action: "ADMIN_MEMBER_UPDATE" },
    { key: "settings", action: "ADMIN_SETTINGS_UPDATE" },
    { key: "closeMonth", action: "CLOSE_MONTH" },
] as const;

function actionIcon(action: string) {
    if (action.startsWith("VOID") || action.includes("DELETE")) return <Ban size={18} />;
    if (action.includes("MEAL") || action === "NO_COOK") return <UtensilsCrossed size={18} />;
    if (action.includes("CONTRIBUTION")) return <Wallet size={18} />;
    if (action.includes("EXPENSE") || action.includes("BAZAAR")) return <Receipt size={18} />;
    if (action.includes("MEMBER") || action.includes("GUEST")) return <Users size={18} />;
    if (action.includes("MONTH")) return <Lock size={18} />;
    if (action.includes("SETTINGS")) return <Settings size={18} />;
    return <ScrollText size={18} />;
}

function actionTone(action: string): string {
    if (action.startsWith("VOID") || action.includes("DELETE")) return styles.toneDanger;
    if (action.includes("OVERRIDE") || action.includes("EDIT") || action === "NO_COOK") return styles.toneWarning;
    if (action.includes("MONTH")) return styles.toneInfo;
    if (action.includes("CONTRIBUTION")) return styles.toneSuccess;
    return styles.toneDefault;
}

/** "ADMIN_MEMBER_UPDATE" → "Member update" (fallback when no translation exists) */
function humanize(action: string): string {
    const s = action.replace(/^ADMIN_/, "").replace(/_/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function show(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

export default function AuditPage() {
    const t = useTranslations("audit");
    const tc = useTranslations("common");
    const locale = useLocale();
    const { token } = useAuth();

    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [actionFilter, setActionFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const fetchAudit = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const data = await api.admin.getAuditLog({ page, limit: 20, action: actionFilter || undefined }, token);
            setEntries(data.entries as AuditEntry[]);
            setTotal(data.total);
            setPages(data.pages);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [token, page, actionFilter, t]);

    useEffect(() => {
        void fetchAudit();
    }, [fetchAudit]);

    const label = (action: string) => (t.has(`actions.${action}`) ? t(`actions.${action}`) : humanize(action));
    const fmtWhen = (iso: string) =>
        new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>
                        {loading ? tc("loading") : t("recordCount", { n: total })}
                    </p>
                </div>
                <button className={styles.refreshBtn} onClick={() => void fetchAudit()} disabled={loading} aria-label={t("refresh")}>
                    <RefreshCw size={18} className={loading ? styles.spinning : undefined} />
                </button>
            </header>

            {/* Filter chips — horizontal scroll on phones */}
            <div className={styles.filters} role="group" aria-label={t("filterLabel")}>
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        className={cn(styles.filterBtn, actionFilter === f.action && styles.filterBtnActive)}
                        onClick={() => {
                            setActionFilter(f.action);
                            setPage(1);
                        }}
                        aria-pressed={actionFilter === f.action}
                    >
                        {t(`filters.${f.key}`)}
                    </button>
                ))}
            </div>

            <ul className={styles.auditList}>
                {loading && entries.length === 0
                    ? [0, 1, 2, 3, 4].map((i) => <li key={i} className={styles.skeleton} />)
                    : entries.length === 0
                        ? <li className={styles.empty}>{t("empty")}</li>
                        : entries.map((entry) => {
                            const isExpanded = expanded === entry.id;
                            const keys = Array.from(new Set([
                                ...Object.keys(entry.oldValue ?? {}),
                                ...Object.keys(entry.newValue ?? {}),
                            ]));
                            return (
                                <li key={entry.id} className={cn(styles.auditCard, isExpanded && styles.auditCardExpanded)}>
                                    <button
                                        type="button"
                                        className={styles.auditRow}
                                        onClick={() => setExpanded(isExpanded ? null : entry.id)}
                                        aria-expanded={isExpanded}
                                    >
                                        <span className={cn(styles.actionIcon, actionTone(entry.action))}>{actionIcon(entry.action)}</span>
                                        <span className={styles.auditInfo}>
                                            <span className={styles.auditTitle}>
                                                <strong>{entry.actorName || t("system")}</strong>
                                                <span className={cn(styles.actionTag, actionTone(entry.action))}>{label(entry.action)}</span>
                                            </span>
                                            <span className={styles.auditMeta}>{fmtWhen(entry.createdAt)}</span>
                                        </span>
                                        <ChevronDown size={18} className={cn(styles.chevron, isExpanded && styles.chevronOpen)} />
                                    </button>

                                    {isExpanded && (
                                        <div className={styles.diffPanel}>
                                            {keys.length === 0 ? (
                                                <p className={styles.noDetails}>{t("noDetails")}</p>
                                            ) : (
                                                <dl className={styles.diffList}>
                                                    {keys.map((k) => {
                                                        const before = entry.oldValue?.[k];
                                                        const after = entry.newValue?.[k];
                                                        const changed = entry.oldValue && entry.newValue && show(before) !== show(after);
                                                        return (
                                                            <div key={k} className={styles.diffRow}>
                                                                <dt className={styles.diffKey}>{k.replace(/_/g, " ")}</dt>
                                                                <dd className={styles.diffVal}>
                                                                    {entry.oldValue && entry.newValue ? (
                                                                        <>
                                                                            <span className={cn(changed && styles.diffOld)}>{show(before)}</span>
                                                                            {changed && <>
                                                                                <ChevronRight size={12} className={styles.diffArrow} />
                                                                                <span className={styles.diffNew}>{show(after)}</span>
                                                                            </>}
                                                                        </>
                                                                    ) : (
                                                                        <span>{show(after ?? before)}</span>
                                                                    )}
                                                                </dd>
                                                            </div>
                                                        );
                                                    })}
                                                </dl>
                                            )}
                                            {entry.targetTable && <span className={styles.metaItem}>{entry.targetTable}</span>}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
            </ul>

            {pages > 1 && (
                <nav className={styles.pagination} aria-label={t("pagination")}>
                    <button className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                        <ChevronLeft size={16} /> {t("prev")}
                    </button>
                    <span className={styles.pageInfo}>{t("pageOf", { page, pages })}</span>
                    <button className={styles.pageBtn} onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}>
                        {t("next")} <ChevronRight size={16} />
                    </button>
                </nav>
            )}
        </div>
    );
}
