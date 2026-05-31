"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card/Card";
import {
    FileText, Utensils, DollarSign, Users,
    Settings, ChevronLeft, ChevronRight, RefreshCw
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

const ACTION_FILTERS = [
    { value: "", label: "All Actions" },
    { value: "TOGGLE_MEAL", label: "Meal Toggles" },
    { value: "ADMIN_MEAL_OVERRIDE", label: "Meal Overrides" },
    { value: "ADMIN_EXPENSE_EDIT", label: "Expense Edits" },
    { value: "ADMIN_EXPENSE_DELETE", label: "Expense Deletes" },
    { value: "ADMIN_MEMBER_UPDATE", label: "Member Updates" },
    { value: "ADMIN_SETTINGS_UPDATE", label: "Settings Changes" },
    { value: "CLOSE_MONTH", label: "Month Close" },
];

function actionIcon(action: string) {
    if (action.includes("MEAL")) return <Utensils size={14} />;
    if (action.includes("EXPENSE")) return <DollarSign size={14} />;
    if (action.includes("MEMBER")) return <Users size={14} />;
    if (action.includes("SETTINGS") || action.includes("MONTH")) return <Settings size={14} />;
    return <FileText size={14} />;
}

function actionLabel(action: string): string {
    return action
        .replace(/^ADMIN_/, "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionColor(action: string): string {
    if (action.includes("DELETE")) return styles.tagDanger;
    if (action.includes("OVERRIDE") || action.includes("EDIT")) return styles.tagWarning;
    if (action.includes("CLOSE")) return styles.tagInfo;
    return styles.tagDefault;
}

function formatDiff(value: unknown): string {
    if (!value) return "—";
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export default function AuditPage() {
    const t = useTranslations("audit");
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
            const data = await api.admin.getAuditLog(
                { page, limit: 20, action: actionFilter || undefined },
                token
            );
            setEntries(data.entries as AuditEntry[]);
            setTotal(data.total);
            setPages(data.pages);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to load audit log");
        } finally {
            setLoading(false);
        }
    }, [token, page, actionFilter]);

    useEffect(() => {
        void fetchAudit();
    }, [fetchAudit]);

    // Reset to page 1 when filter changes
    useEffect(() => {
        setPage(1);
    }, [actionFilter]);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                <button
                    className={styles.refreshBtn}
                    onClick={() => void fetchAudit()}
                    disabled={loading}
                    aria-label="Refresh"
                >
                    <RefreshCw size={16} className={loading ? styles.spinning : undefined} />
                </button>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                {ACTION_FILTERS.map((f) => (
                    <button
                        key={f.value}
                        className={cn(styles.filterBtn, actionFilter === f.value && styles.filterBtnActive)}
                        onClick={() => setActionFilter(f.value)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Count */}
            <p className={styles.count}>
                {loading ? "Loading…" : `${total} record${total !== 1 ? "s" : ""}`}
            </p>

            {/* List */}
            <div className={styles.auditList}>
                {!loading && entries.length === 0 && (
                    <Card>
                        <div className={styles.empty}>No audit records found.</div>
                    </Card>
                )}
                {entries.map((entry) => {
                    const isExpanded = expanded === entry.id;
                    return (
                        <div
                            key={entry.id}
                            className={cn(styles.auditCard, isExpanded && styles.auditCardExpanded)}
                            onClick={() => setExpanded(isExpanded ? null : entry.id)}
                        >
                            <div className={styles.auditRow}>
                                <div className={cn(styles.actionIcon, actionColor(entry.action))}>
                                    {actionIcon(entry.action)}
                                </div>
                                <div className={styles.auditInfo}>
                                    <div className={styles.auditTitle}>
                                        <strong>{entry.actorName}</strong>
                                        <span className={cn(styles.actionTag, actionColor(entry.action))}>
                                            {actionLabel(entry.action)}
                                        </span>
                                    </div>
                                    <div className={styles.auditMeta}>
                                        {entry.targetTable && (
                                            <span className={styles.metaItem}>{entry.targetTable}</span>
                                        )}
                                        <span className={styles.metaItem}>
                                            {new Date(entry.createdAt).toLocaleString("en-US", {
                                                month: "short", day: "numeric",
                                                hour: "2-digit", minute: "2-digit",
                                            })}
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight
                                    size={16}
                                    className={cn(styles.chevron, isExpanded && styles.chevronOpen)}
                                />
                            </div>

                            {isExpanded && (
                                <div className={styles.diffPanel}>
                                    {entry.oldValue && (
                                        <div className={styles.diffBlock}>
                                            <span className={styles.diffLabel}>{t("oldValue")}</span>
                                            <pre className={cn(styles.diffCode, styles.diffOld)}>
                                                {formatDiff(entry.oldValue)}
                                            </pre>
                                        </div>
                                    )}
                                    {entry.newValue && (
                                        <div className={styles.diffBlock}>
                                            <span className={styles.diffLabel}>{t("newValue")}</span>
                                            <pre className={cn(styles.diffCode, styles.diffNew)}>
                                                {formatDiff(entry.newValue)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Pagination */}
            {pages > 1 && (
                <div className={styles.pagination}>
                    <button
                        className={styles.pageBtn}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        <ChevronLeft size={16} /> Prev
                    </button>
                    <span className={styles.pageInfo}>Page {page} of {pages}</span>
                    <button
                        className={styles.pageBtn}
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                        disabled={page === pages}
                    >
                        Next <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}
