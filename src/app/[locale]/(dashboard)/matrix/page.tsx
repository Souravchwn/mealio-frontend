"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
    Download, Lock, ChevronLeft, ChevronRight,
    Pencil, Maximize2, Minimize2, Filter, X, Calendar, CalendarDays, Users
} from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { cn, formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { MonthMatrixResponse, MemberMatrixRow, DayEntry } from "@/types";
import { Role } from "@/types";
import { toast } from "sonner";
import styles from "./matrix.module.css";

/* ─── Date helpers ─── */
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

const DAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Build day info from a date string like "2026-05-10" */
function getDayInfoFromDate(dateStr: string): { day: number; dayOfWeek: number; isWeekend: boolean } {
    const d = new Date(dateStr + "T00:00:00.000Z");
    const dow = d.getUTCDay();
    return { day: d.getUTCDate(), dayOfWeek: dow, isWeekend: dow === 0 || dow === 6 };
}

/** Generate all days between startDate and endDate (inclusive) */
function getPeriodDays(startDate: string, endDate: string): { date: string; day: number; dayOfWeek: number; isWeekend: boolean }[] {
    const days: { date: string; day: number; dayOfWeek: number; isWeekend: boolean }[] = [];
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T00:00:00.000Z");
    const current = new Date(start);
    while (current <= end) {
        const dateStr = current.toISOString().slice(0, 10);
        const { day, dayOfWeek, isWeekend } = getDayInfoFromDate(dateStr);
        days.push({ date: dateStr, day, dayOfWeek, isWeekend });
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return days;
}

function getWeekChunksFromDays(days: { date: string; day: number; dayOfWeek: number; isWeekend: boolean }[]) {
    const chunks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
    return chunks;
}

/* ─── CSV Export ─── */
function exportCsv(matrix: MonthMatrixResponse) {
    const allDays = getPeriodDays(matrix.startDate, matrix.endDate);
    const header = [
        "Member",
        ...allDays.map(d => d.date.slice(5)), // MM-DD format
        "Total Meals", "Amount", "Balance",
    ];
    const rows = matrix.members.map((m) => {
        const dayCols = allDays.map(({ date }) => {
            const day = m.days.find((d) => d.date === date);
            if (!day) return "0";
            return String((day.breakfast ? 1 : 0) + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0));
        });
        return [m.memberName, ...dayCols, m.totalMeals, m.totalAmount.toFixed(2), m.balance.toFixed(2)];
    });
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix-${matrix.startDate}-to-${matrix.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/* ─── Cell Popover ─── */
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
        { key: "breakfast" as const, label: "Breakfast", emoji: "🍳" },
        { key: "lunch" as const, label: "Lunch", emoji: "🍱" },
        { key: "dinner" as const, label: "Dinner", emoji: "🌙" },
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
                            <span className={styles.slotEmoji}>{emoji}</span>
                            <span className={styles.slotLabel}>{label}</span>
                            <span className={cn(styles.slotStatus, active && styles.slotStatusOn)}>
                                {active ? "ON" : "OFF"}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Main Component ─── */
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

    // View
    const [viewMode, setViewMode] = useState<"monthly" | "weekly">("monthly");
    const [weekIndex, setWeekIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Filters
    const [filterOpen, setFilterOpen] = useState(false);
    const [memberSearch, setMemberSearch] = useState("");
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
    const [showGuests, setShowGuests] = useState(true);

    const isAdmin = user?.role === Role.ADMIN;

    // Close month dialog
    const [showCloseDialog, setShowCloseDialog] = useState(false);
    const [nextManagerId, setNextManagerId] = useState<string>("");
    const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);

    // Load managers for close-month picker
    useEffect(() => {
        if (!user || !token) return;
        api.members.list(user.messId, token).then((data) => {
            const mgrs = data.members.filter((m: { role: string; id: string; name: string }) =>
                m.role === "ADMIN" || m.role === "MANAGER"
            ).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }));
            setManagers(mgrs);
        }).catch(() => {});
    }, [user, token]);

    /* ─── Data Fetching ─── */
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
        setWeekIndex(0);
    }, [fetchMatrix, selectedMonth]);

    /* ─── Fullscreen keyboard shortcut ─── */
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isFullscreen]);

    /* ─── Actions ─── */
    async function handleCloseMonth() {
        if (!user || !token || !matrix) return;
        setClosing(true);
        try {
            await api.admin.closeMonth(
                {
                    messId: user.messId,
                    adminId: user.id,
                    yearMonth: selectedMonth,
                    nextManagerId: nextManagerId || undefined,
                },
                token
            );
            toast.success(`Period closed successfully`);
            setShowCloseDialog(false);
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

    /* ─── Filters ─── */
    const filteredMembers = useMemo(() => {
        if (!matrix) return [];
        let filtered = [...matrix.members];
        if (!showGuests) filtered = filtered.filter((m) => !m.isGuest);
        if (memberSearch.trim()) {
            const s = memberSearch.toLowerCase();
            filtered = filtered.filter((m) => m.memberName.toLowerCase().includes(s));
        }
        if (selectedMembers.size > 0) {
            filtered = filtered.filter((m) => selectedMembers.has(m.memberId));
        }
        return filtered;
    }, [matrix, memberSearch, selectedMembers, showGuests]);

    const filteredStats = useMemo(() => {
        let totalMeals = 0;
        let totalAmount = 0;
        for (const m of filteredMembers) {
            totalMeals += m.totalMeals;
            totalAmount += Number(m.totalAmount);
        }
        const mealRate = totalMeals > 0 ? totalAmount / totalMeals : 0;
        return { totalMeals, totalAmount, mealRate };
    }, [filteredMembers]);

    const activeFilterCount = [
        memberSearch.trim().length > 0,
        selectedMembers.size > 0,
        !showGuests,
    ].filter(Boolean).length;

    /* ─── Day columns (period-aware) ─── */
    const periodDays = useMemo(() => {
        if (!matrix) return [];
        return getPeriodDays(matrix.startDate, matrix.endDate);
    }, [matrix]);

    const weekChunks = useMemo(() => getWeekChunksFromDays(periodDays), [periodDays]);

    const displayDays = viewMode === "monthly"
        ? periodDays
        : (weekChunks[weekIndex] ?? []);

    // Period label for display
    const periodLabel = useMemo(() => {
        if (!matrix) return selectedMonth;
        const startD = new Date(matrix.startDate + "T00:00:00.000Z");
        const endD = new Date(matrix.endDate + "T00:00:00.000Z");
        const startStr = startD.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        const endStr = endD.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
        return `${startStr} → ${endStr}`;
    }, [matrix, selectedMonth]);

    /* ─── Row Renderer ─── */
    function renderMemberRow(member: MemberMatrixRow) {
        return (
            <tr key={member.memberId} className={styles.row}>
                <td className={styles.stickyCol}>
                    <div className={styles.memberCell}>
                        <span className={styles.memberAvatar}>
                            {member.memberName.charAt(0).toUpperCase()}
                        </span>
                        <div className={styles.memberInfo}>
                            <span className={styles.memberName}>{member.memberName}</span>
                            {member.isGuest && (
                                <span className={styles.guestBadge}>Guest</span>
                            )}
                        </div>
                    </div>
                </td>
                {displayDays.map(({ day, date: dayStr, isWeekend }) => {
                    const day2 = member.days.find((d) => d.date === dayStr);
                    const mealsOn = day2
                        ? (day2.breakfast ? 1 : 0) + (day2.lunch ? 1 : 0) + (day2.dinner ? 1 : 0)
                        : 0;
                    const isActive = activeCell?.memberId === member.memberId && activeCell?.date === dayStr;
                    const hasGuest = !!(day2?.guestCount && day2.guestCount > 0);

                    return (
                        <td
                            key={dayStr}
                            className={cn(
                                styles.dayCell,
                                isWeekend && styles.weekendCell,
                                editMode && styles.dayCellEditable
                            )}
                        >
                            <span
                                className={cn(
                                    styles.cellDot,
                                    mealsOn === 3 && styles.cellFull,
                                    mealsOn > 0 && mealsOn < 3 && styles.cellPartial,
                                    mealsOn === 0 && day2 && styles.cellOff,
                                    !day2 && styles.cellDefault,
                                    hasGuest && styles.cellGuest,
                                    isActive && styles.cellActive
                                )}
                                title={
                                    day2
                                        ? `B:${day2.breakfast ? "✓" : "✗"} L:${day2.lunch ? "✓" : "✗"} D:${day2.dinner ? "✓" : "✗"}${day2.guestCount > 0 ? ` +${day2.guestCount}G` : ""}`
                                        : "Default ON"
                                }
                                onClick={() => {
                                    if (!editMode) return;
                                    setActiveCell(isActive ? null : { memberId: member.memberId, date: dayStr });
                                }}
                            >
                                {day2 ? mealsOn : "·"}
                            </span>
                            {isActive && (
                                <CellPopover
                                    day={day2 ?? null}
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
                        styles.balanceCell,
                        Number(member.balance) >= 0 ? styles.positive : styles.negative
                    )}
                >
                    <strong>{formatCurrency(Math.abs(Number(member.balance)))}</strong>
                    {Number(member.balance) < 0 && <span className={styles.owes}>owes</span>}
                </td>
            </tr>
        );
    }

    /* ─── Access guard ─── */
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

    /* ─── Main render ─── */
    const matrixTable = (
        <div className={styles.tableWrap}>
            {loading ? (
                <div className={styles.emptyState}>
                    <div className={styles.spinner} />
                    <span>Loading matrix…</span>
                </div>
            ) : !matrix || filteredMembers.length === 0 ? (
                <div className={styles.emptyState}>
                    No data for {selectedMonth}.
                </div>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={cn(styles.stickyCol, styles.headerCell)}>
                                {t("member")}
                            </th>
                            {displayDays.map(({ day, dayOfWeek, isWeekend, date: dayStr }) => (
                                <th
                                    key={dayStr}
                                    className={cn(
                                        styles.dayHeader,
                                        isWeekend && styles.weekendHeader
                                    )}
                                >
                                    <div className={styles.dayHeaderInner}>
                                        <span className={styles.dayNum}>{day}</span>
                                        <span className={styles.dayName}>{DAY_SHORT[dayOfWeek]}</span>
                                    </div>
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
    );

    const pageInner = (
        <div className={cn(styles.page, isFullscreen && styles.pageFullscreen)}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    {isFullscreen && (
                        <div className={styles.fullscreenBrand}>
                            <span className={styles.fullscreenTitle}>
                                {matrix?.messName ?? t("title")}
                            </span>
                            <span className={styles.fullscreenMonth}>{periodLabel}</span>
                        </div>
                    )}
                    {!isFullscreen && (
                        <>
                            <h2 className={styles.title}>{t("title")}</h2>
                            <p className={styles.subtitle}>
                                {matrix?.messName ?? t("subtitle")}
                                {matrix?.isClosed && (
                                    <span className={styles.closedBadge}>Closed</span>
                                )}
                            </p>
                        </>
                    )}
                </div>
                <div className={styles.headerActions}>
                    {isAdmin && (
                        <Button
                            variant={editMode ? "primary" : "secondary"}
                            size="small"
                            onClick={() => { setEditMode(!editMode); setActiveCell(null); }}
                        >
                            <Pencil size={15} />
                            {editMode ? "Done" : "Edit"}
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={() => matrix && exportCsv(matrix)}
                        disabled={!matrix || loading}
                    >
                        <Download size={15} />
                        CSV
                    </Button>
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </Button>
                    {isAdmin && !matrix?.isClosed && (
                        <Button
                            size="small"
                            onClick={() => setShowCloseDialog(true)}
                            disabled={closing || loading || !matrix}
                        >
                            <Lock size={15} />
                            {t("closeMonth")}
                        </Button>
                    )}
                    {isFullscreen && (
                        <button
                            className={styles.closeBtn}
                            onClick={() => setIsFullscreen(false)}
                            aria-label="Close fullscreen"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {editMode && (
                <div className={styles.editBanner}>
                    <Pencil size={13} />
                    Edit mode — click any cell to toggle breakfast / lunch / dinner
                </div>
            )}

            {/* Controls Row */}
            <div className={styles.controlsRow}>
                {/* View toggle */}
                <div className={styles.viewToggle}>
                    <button
                        className={cn(styles.viewToggleBtn, viewMode === "monthly" && styles.viewToggleBtnActive)}
                        onClick={() => { setViewMode("monthly"); setWeekIndex(0); }}
                    >
                        <CalendarDays size={14} />
                        Monthly
                    </button>
                    <button
                        className={cn(styles.viewToggleBtn, viewMode === "weekly" && styles.viewToggleBtnActive)}
                        onClick={() => setViewMode("weekly")}
                    >
                        <Calendar size={14} />
                        Weekly
                    </button>
                </div>

                {/* Month navigator */}
                <div className={styles.monthSelector}>
                    <button
                        className={styles.navBtn}
                        onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
                        aria-label="Previous month"
                    >
                        <ChevronLeft size={18} />
                    </button>
                <span className={styles.monthLabel}>
                    {periodLabel}
                </span>
                    <button
                        className={styles.navBtn}
                        onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
                        aria-label="Next month"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Week navigator (weekly mode only) */}
                {viewMode === "weekly" && (
                    <div className={styles.weekNav}>
                        <button
                            className={styles.navBtn}
                            onClick={() => setWeekIndex(Math.max(0, weekIndex - 1))}
                            disabled={weekIndex === 0}
                            aria-label="Previous week"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className={styles.weekLabel}>
                            Week {weekIndex + 1} / {weekChunks.length}
                        </span>
                        <button
                            className={styles.navBtn}
                            onClick={() => setWeekIndex(Math.min(weekChunks.length - 1, weekIndex + 1))}
                            disabled={weekIndex >= weekChunks.length - 1}
                            aria-label="Next week"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}

                {/* Filter toggle */}
                <button
                    className={cn(styles.filterBtn, filterOpen && styles.filterBtnActive)}
                    onClick={() => setFilterOpen(!filterOpen)}
                >
                    <Filter size={15} />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className={styles.filterBadge}>{activeFilterCount}</span>
                    )}
                </button>
            </div>

            {/* Filter Panel */}
            {filterOpen && (
                <div className={styles.filterPanel}>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Search Members</label>
                        <input
                            type="text"
                            placeholder="Type name…"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            className={styles.filterInput}
                            autoFocus
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label className={styles.filterCheckLabel}>
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
                            <label className={styles.filterLabel}>Pin Members</label>
                            <div className={styles.memberCheckboxes}>
                                {matrix.members.map((m) => (
                                    <label key={m.memberId} className={styles.checkbox}>
                                        <input
                                            type="checkbox"
                                            checked={selectedMembers.has(m.memberId)}
                                            onChange={(e) => {
                                                const newSet = new Set(selectedMembers);
                                                if (e.target.checked) newSet.add(m.memberId);
                                                else newSet.delete(m.memberId);
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
                            setMemberSearch("");
                            setSelectedMembers(new Set());
                            setShowGuests(true);
                        }}
                    >
                        <X size={13} /> Clear All
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
                    <span className={styles.summaryValue}>
                        {loading ? "—" : filteredStats.totalMeals}
                    </span>
                </div>
                <div className={cn(styles.summaryCard, styles.summaryPrimary)}>
                    <span className={styles.summaryLabel}>{t("summary.mealRate")}</span>
                    <span className={styles.summaryValue}>
                        {loading ? "—" : formatCurrency(Number(matrix?.mealRate ?? 0))}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.members")}</span>
                    <span className={styles.summaryValue}>
                        {loading ? "—" : filteredMembers.length}
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className={styles.tableCard}>
                {matrixTable}
            </div>

            {/* Close Month Dialog */}
            {showCloseDialog && (
                <div className={styles.dialogOverlay} onClick={() => setShowCloseDialog(false)}>
                    <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
                        <h3 className={styles.dialogTitle}>
                            <Lock size={18} />
                            Close Period
                        </h3>
                        <p className={styles.dialogDesc}>
                            Close the current billing period ({periodLabel})? This will:
                        </p>
                        <ul className={styles.dialogList}>
                            <li>Freeze all meal logs</li>
                            <li>Calculate final balances</li>
                            <li>Create the next billing period</li>
                            <li>Carry forward balances</li>
                        </ul>

                        <div className={styles.dialogField}>
                            <label className={styles.dialogLabel}>
                                <Users size={14} />
                                Next Period Manager (optional)
                            </label>
                            <select
                                className={styles.dialogSelect}
                                value={nextManagerId}
                                onChange={(e) => setNextManagerId(e.target.value)}
                            >
                                <option value="">— Keep current managers —</option>
                                {managers.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.dialogActions}>
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => setShowCloseDialog(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="small"
                                onClick={handleCloseMonth}
                                disabled={closing}
                            >
                                <Lock size={14} />
                                {closing ? "Closing…" : "Close & Start Next Period"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    if (isFullscreen) {
        return (
            <div className={styles.fullscreenOverlay}>
                {pageInner}
            </div>
        );
    }

    return pageInner;
}
