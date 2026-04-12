"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Download, Lock, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { cn, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { MonthMatrixResponse, MemberMatrixRow, DayEntry } from "@/types";
import { Role } from "@/types";
import { toast } from "sonner";
import styles from "./matrix.module.css";

function prevMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(ym: string): number {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m, 0).getDate();
}

function exportCsv(matrix: MonthMatrixResponse) {
    const days = daysInMonth(matrix.yearMonth);
    const header = [
        "Member",
        ...Array.from({ length: days }, (_, i) => String(i + 1)),
        "Total Meals",
        "Amount",
        "Balance",
    ];
    const rows = matrix.members.map((m) => {
        const dayCols = Array.from({ length: days }, (_, i) => {
            const day = m.days.find((d) => d.date.endsWith(`-${String(i + 1).padStart(2, "0")}`));
            if (!day) return "0";
            const count = (day.breakfast ? 1 : 0) + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0);
            return String(count);
        });
        return [m.memberName, ...dayCols, m.totalMeals, m.totalAmount.toFixed(2), m.balance.toFixed(2)];
    });
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix-${matrix.yearMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

interface CellPopoverProps {
    day: DayEntry | null;
    memberId: string;
    memberName: string;
    date: string;
    onToggle: (slot: "breakfast" | "lunch" | "dinner", value: boolean) => void;
    onClose: () => void;
}

function CellPopover({ day, memberId, memberName, date, onToggle, onClose }: CellPopoverProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [onClose]);

    const slots = [
        { key: "breakfast" as const, label: "B", emoji: "🍳" },
        { key: "lunch" as const, label: "L", emoji: "🍱" },
        { key: "dinner" as const, label: "D", emoji: "🌙" },
    ];

    return (
        <div ref={ref} className={styles.popover}>
            <div className={styles.popoverHeader}>
                <span className={styles.popoverName}>{memberName}</span>
                <span className={styles.popoverDate}>{date}</span>
            </div>
            <div className={styles.popoverSlots}>
                {slots.map(({ key, label, emoji }) => {
                    const active = day ? day[key] : true;
                    return (
                        <button
                            key={key}
                            className={cn(styles.slotBtn, active && styles.slotBtnOn)}
                            onClick={() => onToggle(key, !active)}
                            title={key}
                        >
                            <span>{emoji}</span>
                            <span>{label}</span>
                            <span className={styles.slotStatus}>{active ? "ON" : "OFF"}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function MatrixPage() {
    const t = useTranslations("matrix");
    const locale = useLocale();
    const { user, token } = useAuth();

    const currentMonth = new Date().toISOString().slice(0, 7);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [matrix, setMatrix] = useState<MonthMatrixResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [activeCell, setActiveCell] = useState<{ memberId: string; date: string } | null>(null);

    const isAdmin = user?.role === Role.ADMIN;

    const fetchMatrix = useCallback(async (ym: string) => {
        if (!user || !token) return;
        setLoading(true);
        try {
            const data = await api.admin.getMatrix(user.messId, ym, token);
            setMatrix(data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to load matrix");
        } finally {
            setLoading(false);
        }
    }, [user, token]);

    useEffect(() => {
        void fetchMatrix(selectedMonth);
    }, [fetchMatrix, selectedMonth]);

    async function handleCloseMonth() {
        if (!user || !token || !matrix) return;
        if (!confirm(`Close month ${selectedMonth}? This cannot be undone.`)) return;
        setClosing(true);
        try {
            await api.admin.closeMonth(
                { messId: user.messId, adminId: user.id, yearMonth: selectedMonth },
                token
            );
            toast.success(`Month ${selectedMonth} closed successfully`);
            void fetchMatrix(selectedMonth);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to close month");
        } finally {
            setClosing(false);
        }
    }

    async function handleToggleSlot(
        memberId: string,
        date: string,
        slot: "breakfast" | "lunch" | "dinner",
        value: boolean
    ) {
        if (!token) return;
        // Optimistic update
        setMatrix((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                members: prev.members.map((m) => {
                    if (m.memberId !== memberId) return m;
                    const existingDayIdx = m.days.findIndex((d) => d.date === date);
                    let newDays: DayEntry[];
                    if (existingDayIdx >= 0) {
                        newDays = m.days.map((d) =>
                            d.date === date ? { ...d, [slot]: value } : d
                        );
                    } else {
                        newDays = [
                            ...m.days,
                            {
                                logId: `temp-${date}`,
                                memberId,
                                memberName: m.memberName,
                                date,
                                breakfast: slot === "breakfast" ? value : true,
                                lunch: slot === "lunch" ? value : true,
                                dinner: slot === "dinner" ? value : true,
                                guestCount: 0,
                                frozen: false,
                            },
                        ];
                    }
                    const totalMeals = newDays.reduce(
                        (s, d) => s + (d.breakfast ? 1 : 0) + (d.lunch ? 1 : 0) + (d.dinner ? 1 : 0) + d.guestCount,
                        0
                    );
                    return { ...m, days: newDays, totalMeals };
                }),
            };
        });
        try {
            await api.admin.editMeal({ memberId, date, slot, value }, token);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update meal");
            void fetchMatrix(selectedMonth); // revert on error
        }
    }

    const numDays = daysInMonth(selectedMonth);
    const totalExpense = Number(matrix?.totalExpense ?? 0);
    const totalMeals = matrix?.totalMeals ?? 0;
    const mealRate = Number(matrix?.mealRate ?? 0);
    const memberCount = matrix?.members.length ?? 0;

    function renderMemberRow(member: MemberMatrixRow) {
        return (
            <tr key={member.memberId} className={styles.row}>
                <td className={styles.stickyCol}>
                    <span className={styles.memberName}>{member.memberName}</span>
                    {member.isGuest && (
                        <span className={styles.guestBadge}>Guest</span>
                    )}
                </td>
                {Array.from({ length: numDays }, (_, i) => {
                    const dayStr = `${selectedMonth}-${String(i + 1).padStart(2, "0")}`;
                    const day = member.days.find((d) => d.date === dayStr);
                    const mealsOn = day
                        ? (day.breakfast ? 1 : 0) + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0)
                        : 0;
                    const isActive = activeCell?.memberId === member.memberId && activeCell?.date === dayStr;

                    return (
                        <td key={i} className={cn(styles.dayCell, editMode && styles.dayCellEditable)}>
                            <span
                                className={cn(
                                    styles.cellDot,
                                    mealsOn === 3 && styles.cellFull,
                                    mealsOn > 0 && mealsOn < 3 && styles.cellPartial,
                                    mealsOn === 0 && day && styles.cellOff,
                                    !day && styles.cellDefault,
                                    !!(day?.guestCount && day.guestCount > 0) && styles.cellGuest,
                                    isActive && styles.cellActive
                                )}
                                title={
                                    day
                                        ? `B:${day.breakfast ? "✓" : "✗"} L:${day.lunch ? "✓" : "✗"} D:${day.dinner ? "✓" : "✗"}${day.guestCount > 0 ? ` G:${day.guestCount}` : ""}`
                                        : "Default ON"
                                }
                                onClick={() => {
                                    if (!editMode) return;
                                    setActiveCell(isActive ? null : { memberId: member.memberId, date: dayStr });
                                }}
                            >
                                {day ? mealsOn : "·"}
                            </span>
                            {isActive && (
                                <CellPopover
                                    day={day ?? null}
                                    memberId={member.memberId}
                                    memberName={member.memberName}
                                    date={dayStr}
                                    onToggle={(slot, value) => {
                                        void handleToggleSlot(member.memberId, dayStr, slot, value);
                                    }}
                                    onClose={() => setActiveCell(null)}
                                />
                            )}
                        </td>
                    );
                })}
                <td className={styles.totalCell}>
                    <strong>{member.totalMeals}</strong>
                </td>
                <td className={styles.totalCell}>
                    {formatCurrency(Number(member.totalAmount))}
                </td>
                <td
                    className={cn(
                        styles.totalCell,
                        Number(member.balance) >= 0 ? styles.positive : styles.negative
                    )}
                >
                    <strong>{formatCurrency(Math.abs(Number(member.balance)))}</strong>
                    {Number(member.balance) < 0 && <span className={styles.owes}>owes</span>}
                </td>
            </tr>
        );
    }

    if (!isAdmin) {
        return (
            <div className={styles.page}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>{t("title")}</h2>
                        <p className={styles.subtitle}>Admin access required to view the matrix.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{matrix?.messName ?? t("subtitle")}</p>
                </div>
                <div className={styles.headerActions}>
                    <Button
                        variant={editMode ? "primary" : "secondary"}
                        size="small"
                        onClick={() => { setEditMode(!editMode); setActiveCell(null); }}
                    >
                        <Pencil size={16} />
                        {editMode ? "Done Editing" : "Edit Meals"}
                    </Button>
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={() => matrix && exportCsv(matrix)}
                        disabled={!matrix || loading}
                    >
                        <Download size={16} />
                        {t("exportCsv")}
                    </Button>
                    <Button
                        size="small"
                        onClick={handleCloseMonth}
                        disabled={closing || loading || !matrix}
                    >
                        <Lock size={16} />
                        {closing ? "Closing…" : t("closeMonth")}
                    </Button>
                </div>
            </div>

            {editMode && (
                <div className={styles.editBanner}>
                    <Pencil size={14} />
                    Edit mode — click any day cell to toggle meal slots for that member
                </div>
            )}

            {/* Month Selector */}
            <div className={styles.monthSelector}>
                <button
                    className={styles.monthBtn}
                    onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
                >
                    <ChevronLeft size={20} />
                </button>
                <span className={styles.monthLabel}>
                    {new Date(selectedMonth + "-01").toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "long" }
                    )}
                </span>
                <button
                    className={styles.monthBtn}
                    onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.totalExpense")}</span>
                    <span className={styles.summaryValue}>
                        {loading ? "—" : formatCurrency(totalExpense)}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.totalMeals")}</span>
                    <span className={styles.summaryValue}>{loading ? "—" : totalMeals}</span>
                </div>
                <div className={cn(styles.summaryCard, styles.summaryPrimary)}>
                    <span className={styles.summaryLabel}>{t("summary.mealRate")}</span>
                    <span className={styles.summaryValue}>
                        {loading ? "—" : formatCurrency(mealRate)}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.members")}</span>
                    <span className={styles.summaryValue}>{loading ? "—" : memberCount}</span>
                </div>
            </div>

            {/* Matrix Table */}
            <Card noPadding>
                <div className={styles.tableWrap}>
                    {loading ? (
                        <div className={styles.emptyState}>Loading…</div>
                    ) : !matrix || matrix.members.length === 0 ? (
                        <div className={styles.emptyState}>No data for {selectedMonth}.</div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.stickyCol}>{t("member")}</th>
                                    {Array.from({ length: numDays }, (_, i) => (
                                        <th key={i} className={styles.dayHeader}>
                                            {i + 1}
                                        </th>
                                    ))}
                                    <th className={styles.totalHeader}>{t("totalMeals")}</th>
                                    <th className={styles.totalHeader}>{t("amount")}</th>
                                    <th className={styles.totalHeader}>{t("balance")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrix.members.map(renderMemberRow)}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        </div>
    );
}
