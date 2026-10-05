"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Download, Lock, ChevronLeft, ChevronRight, Pencil, Maximize2, Minimize2, Filter, X } from "lucide-react";
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

function getWeekDates(ym: string, weekOffset: number): { date: string; day: number }[] {
    const [y, m] = ym.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const allDays: { date: string; day: number }[] = [];

    for (let i = 1; i <= lastDay.getDate(); i++) {
        allDays.push({
            date: `${ym}-${String(i).padStart(2, "0")}`,
            day: i
        });
    }

    const startIdx = Math.min(weekOffset * 7, allDays.length);
    const endIdx = Math.min(startIdx + 7, allDays.length);
    return allDays.slice(startIdx, endIdx);
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

function CellPopover({ day, memberName, date, onToggle, onClose }: CellPopoverProps) {
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
    const { user, token } = useAuth();

    const currentMonth = new Date().toISOString().slice(0, 7);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [matrix, setMatrix] = useState<MonthMatrixResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [activeCell, setActiveCell] = useState<{ memberId: string; date: string } | null>(null);

    // View modes
    const [viewMode, setViewMode] = useState<'monthly' | 'weekly'>('monthly');
    const [weekOffset, setWeekOffset] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Filters
    const [filterOpen, setFilterOpen] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
    const [showGuests, setShowGuests] = useState(true);

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
        setWeekOffset(0);
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
                                breakfastCount: slot === "breakfast" ? (value ? 1 : 0) : 1,
                                lunchCount: slot === "lunch" ? (value ? 1 : 0) : 1,
                                dinnerCount: slot === "dinner" ? (value ? 1 : 0) : 1,
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
            void fetchMatrix(selectedMonth);
        }
    }

    // Apply filters to members
    const filteredMembers = useMemo(() => {
        if (!matrix) return [];
        let filtered = [...matrix.members];

        // Guest filter
        if (!showGuests) {
            filtered = filtered.filter(m => !m.isGuest);
        }

        // Member search filter
        if (memberSearch.trim()) {
            const search = memberSearch.toLowerCase();
            filtered = filtered.filter(m => m.memberName.toLowerCase().includes(search));
        }

        // Selected members filter
        if (selectedMembers.size > 0) {
            filtered = filtered.filter(m => selectedMembers.has(m.memberId));
        }

        return filtered;
    }, [matrix, memberSearch, selectedMembers, showGuests]);

    // Calculate filtered statistics
    const filteredStats = useMemo(() => {
        let totalMeals = 0;
        let totalAmount = 0;

        for (const member of filteredMembers) {
            totalMeals += member.totalMeals;
            totalAmount += Number(member.totalAmount);
        }

        const mealRate = totalMeals > 0 ? totalAmount / totalMeals : 0;

        return { totalMeals, totalAmount, mealRate };
    }, [filteredMembers]);

    const numDays = viewMode === 'monthly' ? daysInMonth(selectedMonth) : getWeekDates(selectedMonth, weekOffset).length;
    const displayDays = viewMode === 'monthly' 
        ? Array.from({ length: numDays }, (_, i) => i + 1)
        : getWeekDates(selectedMonth, weekOffset);

    const canPrevWeek = viewMode === 'weekly' && weekOffset > 0;
    const canNextWeek = viewMode === 'weekly' && (weekOffset + 1) * 7 < daysInMonth(selectedMonth);

    function renderMemberRow(member: MemberMatrixRow) {
        return (
            <tr key={member.memberId} className={styles.row}>
                <td className={styles.stickyCol}>
                    <span className={styles.memberName}>{member.memberName}</span>
                    {member.isGuest && (
                        <span className={styles.guestBadge}>Guest</span>
                    )}
                </td>
                {(viewMode === 'monthly'
                    ? Array.from({ length: numDays }, (_, i) => i + 1)
                    : getWeekDates(selectedMonth, weekOffset).map(d => d.day)
                ).map((dayNum, idx) => {
                    const dayStr = viewMode === 'monthly'
                        ? `${selectedMonth}-${String(dayNum).padStart(2, "0")}`
                        : (displayDays as any)[idx].date;
                    
                    const day = member.days.find((d) => d.date === dayStr);
                    const mealsOn = day
                        ? (day.breakfast ? 1 : 0) + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0)
                        : 0;
                    const isActive = activeCell?.memberId === member.memberId && activeCell?.date === dayStr;

                    return (
                        <td key={idx} className={cn(styles.dayCell, editMode && styles.dayCellEditable)}>
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

    const pageContent = (
        <div className={cn(styles.page, isFullscreen && styles.pageFullscreen)}>
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
                        variant="secondary"
                        size="small"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
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

            {/* Month/Week Selector & Filters */}
            <div className={styles.controlsRow}>
                <div className={styles.viewToggle}>
                    <button
                        className={cn(styles.viewToggleBtn, viewMode === 'monthly' && styles.active)}
                        onClick={() => { setViewMode('monthly'); setWeekOffset(0); }}
                    >
                        Monthly
                    </button>
                    <button
                        className={cn(styles.viewToggleBtn, viewMode === 'weekly' && styles.active)}
                        onClick={() => setViewMode('weekly')}
                    >
                        Weekly
                    </button>
                </div>

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

                {viewMode === 'weekly' && (
                    <div className={styles.weekNav}>
                        <button
                            className={styles.monthBtn}
                            onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                            disabled={!canPrevWeek}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className={styles.weekLabel}>Week {weekOffset + 1}</span>
                        <button
                            className={styles.monthBtn}
                            onClick={() => setWeekOffset(weekOffset + 1)}
                            disabled={!canNextWeek}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}

                <button
                    className={cn(styles.filterBtn, filterOpen && styles.filterBtnActive)}
                    onClick={() => setFilterOpen(!filterOpen)}
                >
                    <Filter size={16} />
                    Filters {selectedMembers.size > 0 || memberSearch || !showGuests ? `(${[selectedMembers.size > 0, memberSearch, !showGuests].filter(Boolean).length})` : ''}
                </button>
            </div>

            {/* Filters Panel */}
            {filterOpen && (
                <div className={styles.filterPanel}>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Search Members</label>
                        <input
                            type="text"
                            placeholder="Type name..."
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            className={styles.filterInput}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>
                            <input
                                type="checkbox"
                                checked={showGuests}
                                onChange={(e) => setShowGuests(e.target.checked)}
                            />
                            Show Guests
                        </label>
                    </div>

                    {matrix && matrix.members.length > 0 && (
                        <div className={styles.filterGroup}>
                            <label className={styles.filterLabel}>Members</label>
                            <div className={styles.memberCheckboxes}>
                                {matrix.members.slice(0, 10).map(m => (
                                    <label key={m.memberId} className={styles.checkbox}>
                                        <input
                                            type="checkbox"
                                            checked={selectedMembers.has(m.memberId)}
                                            onChange={(e) => {
                                                const newSet = new Set(selectedMembers);
                                                if (e.target.checked) {
                                                    newSet.add(m.memberId);
                                                } else {
                                                    newSet.delete(m.memberId);
                                                }
                                                setSelectedMembers(newSet);
                                            }}
                                        />
                                        {m.memberName}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        className={styles.clearFiltersBtn}
                        onClick={() => {
                            setMemberSearch('');
                            setSelectedMembers(new Set());
                            setShowGuests(true);
                        }}
                    >
                        Clear All
                    </button>
                </div>
            )}

            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.totalExpense")}</span>
                    <span className={styles.summaryValue}>
                        {loading ? "—" : formatCurrency(Number(matrix?.totalExpense ?? 0))}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.totalMeals")}</span>
                    <span className={styles.summaryValue}>{loading ? "—" : filteredStats.totalMeals}</span>
                </div>
                <div className={cn(styles.summaryCard, styles.summaryPrimary)}>
                    <span className={styles.summaryLabel}>{t("summary.mealRate")}</span>
                    <span className={styles.summaryValue}>
                        {loading ? "—" : formatCurrency(filteredStats.mealRate)}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.members")}</span>
                    <span className={styles.summaryValue}>{loading ? "—" : filteredMembers.length}</span>
                </div>
            </div>

            {/* Matrix Table */}
            <Card noPadding>
                <div className={styles.tableWrap}>
                    {loading ? (
                        <div className={styles.emptyState}>Loading…</div>
                    ) : !matrix || filteredMembers.length === 0 ? (
                        <div className={styles.emptyState}>No data for {selectedMonth}.</div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.stickyCol}>{t("member")}</th>
                                    {(viewMode === 'monthly'
                                        ? Array.from({ length: numDays }, (_, i) => i + 1)
                                        : getWeekDates(selectedMonth, weekOffset).map(d => d.day)
                                    ).map((dayNum, idx) => (
                                        <th key={idx} className={styles.dayHeader}>
                                            {dayNum}
                                        </th>
                                    ))}
                                    <th className={styles.totalHeader}>{t("totalMeals")}</th>
                                    <th className={styles.totalHeader}>{t("amount")}</th>
                                    <th className={styles.totalHeader}>{t("balance")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMembers.map(renderMemberRow)}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        </div>
    );

    if (isFullscreen) {
        return (
            <div className={styles.fullscreenContainer}>
                <div className={styles.fullscreenHeader}>
                    <h3>{matrix?.messName ?? t("title")} - {selectedMonth}</h3>
                    <button
                        className={styles.fullscreenClose}
                        onClick={() => setIsFullscreen(false)}
                    >
                        <X size={24} />
                    </button>
                </div>
                <div className={styles.fullscreenContent}>
                    {pageContent}
                </div>
            </div>
        );
    }

    return pageContent;
}
