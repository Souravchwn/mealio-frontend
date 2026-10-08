"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
    Plus, Search, Trash2, ChevronDown, ChevronUp,
    ShoppingBag, TrendingDown, X, Check,
    Calculator, Zap, Users, Ban, Sparkles, Camera, ListChecks, Paperclip,
} from "lucide-react";
import { cn, formatCurrency, getCategoryColor, localISODate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/DatePicker/DatePicker";
import { Select } from "@/components/ui/Select/Select";
import { MemoPicker, type MemoDraft } from "@/components/composed/Memo/MemoPicker";
import { MemoGallery } from "@/components/composed/Memo/MemoGallery";
import type { ExpenseCategory, BazaarSessionResponse, BazaarEntryMode, ContributionResponse } from "@/types";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import styles from "./expenses.module.css";

const CATEGORIES: ExpenseCategory[] = ["PROTEIN", "CARB", "VEGETABLE", "SPICE", "OIL", "UTILITY", "OTHER"];

interface ItemRow      { category: ExpenseCategory; amount: string; description: string }
interface MemberOption { id: string; name: string }

export default function ExpensesPage() {
    const t  = useTranslations("expenses");
    const tc = useTranslations("common");
    const tk = useTranslations("calculator");
    const locale = useLocale();
    const { user, token } = useAuth();

    const canWrite  = user?.role === "ADMIN" || user?.role === "MANAGER";
    const canDelete = user?.role === "ADMIN";

    /* ─── Tab ─── */
    const [activeTab, setActiveTab] = useState<"sessions" | "contributions">("sessions");

    /* ─── Stats ─── */
    const [mealRate,     setMealRate]     = useState(0);
    const [totalExpense, setTotalExpense] = useState(0);

    /* ─── Sessions ─── */
    const [sessions,         setSessions]         = useState<BazaarSessionResponse[]>([]);
    const [sessionsTotal,    setSessionsTotal]    = useState(0);
    const [sessionsPage,     setSessionsPage]     = useState(1);
    const [sessionsPages,    setSessionsPages]    = useState(1);
    const [sessionsLoading,  setSessionsLoading]  = useState(true);
    const [expandedSession,  setExpandedSession]  = useState<string | null>(null);
    const [sessionSearch,    setSessionSearch]    = useState("");

    /* ─── Void modal ─── */
    const [voidModal, setVoidModal] = useState<{
        type: "session" | "contribution";
        id: string;
        label: string;
    } | null>(null);
    const [voidReason,     setVoidReason]     = useState("");
    const [voidSubmitting, setVoidSubmitting] = useState(false);

    /* ─── Add Session form ─── */
    const [showSessionForm,   setShowSessionForm]   = useState(false);
    const [sessionDate,       setSessionDate]       = useState(localISODate);
    const [shoppers,          setShoppers]          = useState<MemberOption[]>([]);
    const [sessionNote,       setSessionNote]       = useState("");
    const [items,             setItems]             = useState<ItemRow[]>([{ category: "PROTEIN", amount: "", description: "" }]);
    const [sessionSubmitting, setSessionSubmitting] = useState(false);
    // Two ways to record a trip: typed line items, or a photo of the paper memo plus its total
    const [entryMode,         setEntryMode]         = useState<BazaarEntryMode>("ITEMIZED");
    const [memoTotal,         setMemoTotal]         = useState("");
    const [memoDrafts,        setMemoDrafts]        = useState<MemoDraft[]>([]);
    const [members,           setMembers]           = useState<MemberOption[]>([]);

    /* ─── Contributions ─── */
    const [contributions,        setContributions]        = useState<ContributionResponse[]>([]);
    const [contribTotal,         setContribTotal]         = useState(0);
    const [contribPage,          setContribPage]          = useState(1);
    const [contribPages,         setContribPages]         = useState(1);
    const [contribLoading,       setContribLoading]       = useState(true);
    const [contribSummaryOpen,   setContribSummaryOpen]   = useState(true);
    // Backend-owned aggregates — no frontend arithmetic
    const [totalContrib,         setTotalContrib]         = useState(0);
    const [memberContribSummary, setMemberContribSummary] = useState<Array<{ name: string; total: number; count: number }>>([]);

    /* ─── Add Contribution form ─── */
    const [showContribForm,   setShowContribForm]   = useState(false);
    const [contribMember,     setContribMember]     = useState("");
    const [contribAmount,     setContribAmount]     = useState("");
    const [contribNote,       setContribNote]       = useState("");
    const [contribDate,       setContribDate]       = useState(localISODate);
    const [contribSubmitting, setContribSubmitting] = useState(false);

    /* ─── Magic Calculator ─── */
    const [calcOpen,    setCalcOpen]    = useState(false);
    const [calcMode,    setCalcMode]    = useState<"smart" | "manual">("smart");
    const [whatIfAmt,   setWhatIfAmt]   = useState("");
    // Manual calculator state
    const [calcDisplay, setCalcDisplay] = useState("0");
    const [calcPrev,    setCalcPrev]    = useState<number | null>(null);
    const [calcOp,      setCalcOp]      = useState<string | null>(null);
    const [calcFresh,   setCalcFresh]   = useState(false);

    /* ─── Calculator: what-if (interactive UI only, not financial data) ─── */
    const totalMeals    = mealRate > 0 ? totalExpense / mealRate : 0;
    const whatIfNewRate = useMemo(() => {
        const n = parseFloat(whatIfAmt);
        if (isNaN(n) || n <= 0 || totalMeals <= 0) return null;
        return (totalExpense + n) / totalMeals;
    }, [whatIfAmt, totalExpense, totalMeals]);

    /* ─── Data loading ─── */
    const loadSessions = useCallback(async (p: number) => {
        if (!user || !token) return;
        setSessionsLoading(true);
        try {
            const res = await api.expenses.sessions.list(
                { messId: user.messId, page: p, limit: 20 }, token
            );
            setSessions(res.sessions);
            setSessionsTotal(res.total);
            setSessionsPage(res.page);
            setSessionsPages(res.pages);
            setMealRate(res.liveMealRate);
            setTotalExpense(res.totalExpense);
        } catch {
            toast.error("Failed to load expenses");
        } finally {
            setSessionsLoading(false);
        }
    }, [user, token]);

    const loadContributions = useCallback(async (p: number) => {
        if (!user || !token) return;
        setContribLoading(true);
        try {
            const res = await api.contributions.list({ page: p, limit: 20 }, token);
            setContributions(res.contributions);
            setContribTotal(res.total);
            setContribPage(res.page);
            setContribPages(res.pages);
            // Backend-owned aggregates
            setTotalContrib(res.totalContributed);
            setMemberContribSummary(
                res.memberSummary.map((s) => ({ name: s.memberName, total: s.total, count: s.count }))
            );
        } catch { /* silent — non-critical */ } finally {
            setContribLoading(false);
        }
    }, [user, token]);

    const loadMembers = useCallback(async () => {
        if (!user || !token || !canWrite) return;
        try {
            const res = await api.members.list(user.messId, token);
            setMembers(res.members.map((m) => ({ id: m.id, name: m.name })));
        } catch { /* ignore */ }
    }, [user, token, canWrite]);

    useEffect(() => {
        loadSessions(1);
        loadContributions(1);
        loadMembers();
    }, [loadSessions, loadContributions, loadMembers]);

    /* ─── Session handlers ─── */
    const addItem    = () => setItems((p) => [...p, { category: "PROTEIN", amount: "", description: "" }]);
    const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
    const updateItem = (i: number, f: keyof ItemRow, v: string) =>
        setItems((p) => p.map((row, idx) => idx === i ? { ...row, [f]: v } : row));
    const toggleShopper = (m: MemberOption) =>
        setShoppers((p) => p.some((s) => s.id === m.id) ? p.filter((s) => s.id !== m.id) : [...p, m]);

    function resetSessionForm() {
        setSessionDate(localISODate());
        setShoppers([]); setSessionNote("");
        setItems([{ category: "PROTEIN", amount: "", description: "" }]);
        memoDrafts.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        setMemoDrafts([]); setMemoTotal(""); setEntryMode("ITEMIZED");
        setShowSessionForm(false);
    }

    async function handleAddSession(e: React.FormEvent) {
        e.preventDefault();
        if (!token) return;
        const validItems = items.filter((i) => i.amount && Number(i.amount) > 0);
        const memos = memoDrafts.map((m) => ({ data: m.data }));
        if (entryMode === "MEMO_TOTAL") {
            if (memos.length === 0) { toast.error(t("memo.photoRequired")); return; }
            if (!(Number(memoTotal) > 0)) { toast.error(t("memo.totalRequired")); return; }
        } else if (validItems.length === 0) {
            toast.error(t("ui.addOneItem")); return;
        }
        setSessionSubmitting(true);
        try {
            const created = await api.expenses.sessions.create(
                entryMode === "MEMO_TOTAL"
                    ? { date: sessionDate, shoppers, mode: "MEMO_TOTAL", total: Number(memoTotal), memos, note: sessionNote || undefined }
                    : {
                        date: sessionDate, shoppers, mode: "ITEMIZED",
                        items: validItems.map((i) => ({
                            category: i.category as ExpenseCategory,
                            amount:   Number(i.amount),
                            description: i.description || undefined,
                        })),
                        memos: memos.length > 0 ? memos : undefined,
                        note: sessionNote || undefined,
                    },
                token
            );
            setSessions((p) => [created, ...p]);
            setSessionsTotal((p) => p + 1);
            setTotalExpense((p) => p + created.total);
            resetSessionForm();
            toast.success("Bazaar session added");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to add session");
        } finally {
            setSessionSubmitting(false);
        }
    }

    function openVoidModal(type: "session" | "contribution", id: string, label: string) {
        setVoidModal({ type, id, label });
        setVoidReason("");
    }

    async function handleVoidConfirm() {
        if (!voidModal || !token || !voidReason.trim()) return;
        setVoidSubmitting(true);
        try {
            if (voidModal.type === "session") {
                await api.expenses.sessions.void(voidModal.id, voidReason.trim(), token);
                setSessions((p) => p.map((s) =>
                    s.id === voidModal.id
                        ? { ...s, isVoided: true, voidReason: voidReason.trim(), voidedAt: new Date().toISOString() }
                        : s
                ));
                // Subtract voided session total from totalExpense stat
                const voided = sessions.find((s) => s.id === voidModal.id);
                if (voided) setTotalExpense((p) => p - voided.total);
                toast.success("Session voided");
            } else {
                await api.contributions.void(voidModal.id, voidReason.trim(), token);
                toast.success("Deposit voided");
                // Reload so backend-owned totals (totalContributed, memberSummary) stay accurate
                void loadContributions(1);
            }
            setVoidModal(null);
            setVoidReason("");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to void");
        } finally {
            setVoidSubmitting(false);
        }
    }

    /* ─── Contribution handlers ─── */
    async function handleAddContribution(e: React.FormEvent) {
        e.preventDefault();
        if (!token || !contribMember || !contribAmount) return;
        setContribSubmitting(true);
        try {
            await api.contributions.add(
                { memberId: contribMember, amount: Number(contribAmount),
                  note: contribNote || undefined, date: contribDate }, token
            );
            setContribMember(""); setContribAmount("");
            setContribNote(""); setContribDate(localISODate());
            setShowContribForm(false);
            toast.success("Deposit recorded");
            // Reload page 1 so backend-owned totals (totalContributed, memberSummary) stay accurate
            void loadContributions(1);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to record deposit");
        } finally {
            setContribSubmitting(false);
        }
    }

    /* ─── Manual calculator logic ─── */
    function calcDigit(d: string) {
        if (calcFresh) {
            setCalcDisplay(d === "." ? "0." : d);
            setCalcFresh(false);
        } else {
            if (d === "." && calcDisplay.includes(".")) return;
            setCalcDisplay(calcDisplay === "0" && d !== "." ? d : calcDisplay + d);
        }
    }
    function calcOperator(op: string) {
        setCalcPrev(parseFloat(calcDisplay));
        setCalcOp(op); setCalcFresh(true);
    }
    function calcEquals() {
        if (calcPrev === null || calcOp === null) return;
        const curr = parseFloat(calcDisplay);
        const map: Record<string, number> = {
            "+": calcPrev + curr, "−": calcPrev - curr,
            "×": calcPrev * curr, "÷": curr === 0 ? 0 : calcPrev / curr,
        };
        const result = map[calcOp] ?? curr;
        const str = Number.isInteger(result)
            ? String(result)
            : result.toFixed(6).replace(/\.?0+$/, "");
        setCalcDisplay(str);
        setCalcPrev(null); setCalcOp(null); setCalcFresh(true);
    }
    function calcClear() {
        setCalcDisplay("0"); setCalcPrev(null); setCalcOp(null); setCalcFresh(false);
    }

    const fmtDate = (d: string) =>
        new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
            .format(new Date(`${d}T00:00:00Z`));

    /* ─── Filtered sessions ─── */
    const filteredSessions = sessionSearch.trim()
        ? sessions.filter((s) => {
              const q = sessionSearch.toLowerCase();
              const names = (s.shoppers as Array<{ name: string }>).map((sh) => sh.name.toLowerCase()).join(" ");
              return names.includes(q) || s.date.includes(q);
          })
        : sessions;

    return (
        <div className={styles.page}>

            {/* ── Header ── */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                <div className={styles.headerActions}>
                    {canWrite && activeTab === "sessions" && (
                        <button className={styles.addBtn} onClick={() => setShowSessionForm(!showSessionForm)}>
                            <Plus size={16} /> {t("addSession")}
                        </button>
                    )}
                    {canWrite && activeTab === "contributions" && (
                        <button className={styles.addBtn} onClick={() => setShowContribForm(!showContribForm)}>
                            <Plus size={16} /> {t("addContribution")}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Stats ── */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <span className={styles.statLabel}>{t("totalExpense")}</span>
                    {sessionsLoading
                        ? <div className={cn(styles.skeleton, styles.skeletonValue)} />
                        : <span className={styles.statValue}>{formatCurrency(totalExpense)}</span>
                    }
                </div>
                <div className={cn(styles.statCard, styles.statCardPrimary)}>
                    <span className={styles.statLabel}>{t("mealRate")}</span>
                    {sessionsLoading
                        ? <div className={cn(styles.skeleton, styles.skeletonValue)} />
                        : <span className={cn(styles.statValue, styles.primaryText)}>{formatCurrency(mealRate)}</span>
                    }
                </div>
                <div className={cn(styles.statCard, styles.statCardGreen)}>
                    <span className={styles.statLabel}>{t("contributionsTab")}</span>
                    {contribLoading
                        ? <div className={cn(styles.skeleton, styles.skeletonValue)} />
                        : <span className={cn(styles.statValue, styles.greenText)}>{formatCurrency(totalContrib)}</span>
                    }
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className={styles.tabs}>
                <button
                    className={cn(styles.tab, activeTab === "sessions" && styles.tabActive)}
                    onClick={() => setActiveTab("sessions")}
                >
                    <ShoppingBag size={15} /> {t("sessionsTab")}
                    {sessionsTotal > 0 && <span className={styles.tabBadge}>{sessionsTotal}</span>}
                </button>
                <button
                    className={cn(styles.tab, activeTab === "contributions" && styles.tabActive)}
                    onClick={() => setActiveTab("contributions")}
                >
                    <TrendingDown size={15} /> {t("contributionsTab")}
                    {contribTotal > 0 && <span className={styles.tabBadge}>{contribTotal}</span>}
                </button>
            </div>

            {/* ══════════════ SESSIONS TAB ══════════════ */}
            {activeTab === "sessions" && (
                <>
                    {showSessionForm && canWrite && (
                        <div className={styles.formCard}>
                            <div className={styles.formCardHeader}>
                                <h3 className={styles.formTitle}>{t("addSession")}</h3>
                                <button className={styles.closeBtn} onClick={resetSessionForm} aria-label={tc("close")}>
                                    <X size={16} />
                                </button>
                            </div>
                            <form onSubmit={(e) => void handleAddSession(e)}>
                                <div className={styles.formRow}>
                                    <div className={styles.field}>
                                        <label className={styles.label}>{t("sessionDate")}</label>
                                        <DatePicker value={sessionDate} onChange={setSessionDate}
                                            max={localISODate()} aria-label={t("sessionDate")} />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label}>{t("note")}</label>
                                        <input className={styles.input} type="text"
                                            placeholder={t("ui.notePlaceholder")}
                                            value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} />
                                    </div>
                                </div>

                                {members.length > 0 && (
                                    <div className={styles.field}>
                                        <label className={styles.label}>{t("shoppers")}</label>
                                        <div className={styles.shopperPills}>
                                            {members.map((m) => (
                                                <button key={m.id} type="button"
                                                    onClick={() => toggleShopper(m)}
                                                    className={cn(styles.shopperPill,
                                                        shoppers.some((s) => s.id === m.id) && styles.shopperPillActive)}
                                                >
                                                    {shoppers.some((s) => s.id === m.id) && <Check size={11} />}
                                                    {m.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className={styles.modeToggle} role="tablist" aria-label={t("memo.modeLabel")}>
                                    <button type="button" role="tab" aria-selected={entryMode === "ITEMIZED"}
                                        className={styles.modeBtn} onClick={() => setEntryMode("ITEMIZED")}>
                                        <ListChecks size={16} /> {t("memo.modeItems")}
                                    </button>
                                    <button type="button" role="tab" aria-selected={entryMode === "MEMO_TOTAL"}
                                        className={styles.modeBtn} onClick={() => setEntryMode("MEMO_TOTAL")}>
                                        <Camera size={16} /> {t("memo.modeMemo")}
                                    </button>
                                </div>

                                {entryMode === "MEMO_TOTAL" ? (
                                    <>
                                        <div className={styles.field}>
                                            <label className={styles.label}>{t("memo.title")}</label>
                                            <MemoPicker value={memoDrafts} onChange={setMemoDrafts} required />
                                        </div>
                                        <div className={styles.field}>
                                            <label className={styles.label} htmlFor="memo-total">{t("memo.total")}</label>
                                            <input id="memo-total" className={styles.memoTotalInput} type="number"
                                                inputMode="decimal" step="0.01" min="0.01" placeholder="৳ 0"
                                                value={memoTotal} onChange={(e) => setMemoTotal(e.target.value)} required />
                                            <span className={styles.fieldHint}>{t("memo.totalHint")}</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className={styles.field}>
                                            <label className={styles.label}>{t("ui.items")}</label>
                                            <div className={styles.itemsList}>
                                                {items.map((item, idx) => (
                                                    <div key={idx} className={styles.itemRow}>
                                                        <Select
                                                            className={styles.selectTrigger}
                                                            value={item.category}
                                                            onChange={(v) => updateItem(idx, "category", v)}
                                                            aria-label={t("category")}
                                                            options={CATEGORIES.map((cat) => ({
                                                                value: cat,
                                                                label: t(`categories.${cat}`),
                                                                dot: getCategoryColor(cat),
                                                            }))}
                                                        />
                                                        <input className={styles.itemAmountInput} type="number"
                                                            inputMode="decimal" step="0.01" min="0.01" placeholder="৳"
                                                            value={item.amount}
                                                            onChange={(e) => updateItem(idx, "amount", e.target.value)} required />
                                                        <input className={styles.itemDescInput} type="text"
                                                            placeholder={t("description")} value={item.description}
                                                            onChange={(e) => updateItem(idx, "description", e.target.value)} />
                                                        {items.length > 1 && (
                                                            <button type="button" className={styles.removeItemBtn}
                                                                onClick={() => removeItem(idx)} aria-label={t("ui.removeItem")}>
                                                                <X size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <button type="button" className={styles.addItemBtn} onClick={addItem}>
                                                {t("addItem")}
                                            </button>
                                        </div>
                                        <div className={styles.field}>
                                            <label className={styles.label}>{t("memo.optionalTitle")}</label>
                                            <MemoPicker value={memoDrafts} onChange={setMemoDrafts} />
                                        </div>
                                    </>
                                )}

                                {(entryMode === "MEMO_TOTAL" ? Number(memoTotal) > 0 : items.some((i) => Number(i.amount) > 0)) && (
                                    <div className={styles.sessionTotal}>
                                        {t("ui.sessionTotal")}
                                        <strong>{formatCurrency(
                                            entryMode === "MEMO_TOTAL"
                                                ? Number(memoTotal)
                                                : items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
                                        )}</strong>
                                    </div>
                                )}

                                <div className={styles.formActions}>
                                    <button type="button" className={styles.cancelBtn} onClick={resetSessionForm}>
                                        {tc("cancel")}
                                    </button>
                                    <button type="submit" className={styles.submitBtn} disabled={sessionSubmitting}>
                                        {sessionSubmitting ? tc("loading") : tc("save")}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className={styles.listCard}>
                        <div className={styles.listHeader}>
                            <div className={styles.searchWrap}>
                                <Search size={15} />
                                <input className={styles.searchInput} type="text"
                                    placeholder={t("ui.searchPlaceholder")}
                                    value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} />
                            </div>
                        </div>

                        <div className={styles.sessionList}>
                            {sessionsLoading ? (
                                Array.from({ length: 4 }, (_, i) => (
                                    <div key={i} className={styles.skeletonSessionRow}>
                                        <div className={styles.skeletonSessionLeft}>
                                            <div className={cn(styles.skeleton, styles.skeletonDate)} />
                                            <div className={cn(styles.skeleton, styles.skeletonTag)} />
                                        </div>
                                        <div className={cn(styles.skeleton, styles.skeletonAmt)} />
                                    </div>
                                ))
                            ) : filteredSessions.length === 0 ? (
                                <div className={styles.emptyState}>{t("noSessions")}</div>
                            ) : (
                                filteredSessions.map((session) => {
                                    const isExpanded  = expandedSession === session.id;
                                    const shopperList = (session.shoppers as Array<{ name: string }>)
                                        .map((s) => s.name).join(", ");
                                    return (
                                        <div key={session.id}
                                            className={cn(
                                                styles.sessionRow,
                                                isExpanded && styles.sessionRowExpanded,
                                                session.isVoided && styles.sessionRowVoided,
                                            )}>
                                            <div className={styles.sessionHeader}
                                                onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                                                role="button" tabIndex={0}
                                                onKeyDown={(e) => e.key === "Enter" && setExpandedSession(isExpanded ? null : session.id)}>
                                                <div className={styles.sessionMeta}>
                                                    <span className={cn(styles.sessionDate, session.isVoided && styles.voidedText)}>
                                                        {fmtDate(session.date)}
                                                    </span>
                                                    {session.isVoided && (
                                                        <span className={styles.voidedBadge}>
                                                            <Ban size={10} /> {t("ui.voided")}
                                                        </span>
                                                    )}
                                                    {shopperList && (
                                                        <span className={styles.sessionShoppers}>
                                                            <Users size={12} /> {shopperList}
                                                        </span>
                                                    )}
                                                    {session.note && (
                                                        <span className={styles.sessionNote}>{session.note}</span>
                                                    )}
                                                </div>
                                                <div className={styles.sessionRight}>
                                                    {session.memos.length > 0 && (
                                                        <span className={styles.memoBadge} title={t("memo.attached", { n: session.memos.length })}>
                                                            <Paperclip size={11} /> {session.memos.length}
                                                        </span>
                                                    )}
                                                    <span className={styles.sessionItemCount}>
                                                        {session.entryMode === "MEMO_TOTAL"
                                                            ? t("memo.memoTotal")
                                                            : `${session.items.length} ${session.items.length === 1 ? t("item") : t("items")}`}
                                                    </span>
                                                    <span className={cn(styles.sessionTotal2, session.isVoided && styles.voidedAmount)}>
                                                        {formatCurrency(session.total)}
                                                    </span>
                                                    {canDelete && !session.isVoided && (
                                                        <button className={styles.deleteBtn}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openVoidModal("session", session.id,
                                                                    `${fmtDate(session.date)} · ${formatCurrency(session.total)}`);
                                                            }}
                                                            aria-label={t("ui.voidSession")}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    )}
                                                    <span className={styles.chevron}>
                                                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                    </span>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className={styles.sessionItems}>
                                                    {session.isVoided && session.voidReason && (
                                                        <div className={styles.voidReasonRow}>
                                                            <Ban size={12} />
                                                            <span>{t("ui.voidReason", { reason: session.voidReason })}</span>
                                                        </div>
                                                    )}
                                                    {session.items.map((item) => (
                                                        <div key={item.id} className={cn(styles.sessionItem, session.isVoided && styles.voidedItemRow)}>
                                                            <span className={styles.categoryDot}
                                                                style={{ backgroundColor: getCategoryColor(item.category) }} />
                                                            <span className={styles.itemCatTag}
                                                                style={{
                                                                    background: getCategoryColor(item.category) + "18",
                                                                    color: getCategoryColor(item.category),
                                                                }}>
                                                                {t(`categories.${item.category}`)}
                                                            </span>
                                                            <span className={styles.itemDesc}>{item.description || "—"}</span>
                                                            <span className={styles.itemAmount}>{formatCurrency(item.amount)}</span>
                                                        </div>
                                                    ))}
                                                    {token && (
                                                        <MemoGallery
                                                            sessionId={session.id}
                                                            memos={session.memos}
                                                            token={token}
                                                            canAdd={canWrite && !session.isVoided}
                                                            onAdded={(memos) =>
                                                                setSessions((p) => p.map((x) => (x.id === session.id ? { ...x, memos } : x)))}
                                                        />
                                                    )}
                                                    <div className={styles.sessionItemsFooter}>
                                                        <span className={styles.addedByLabel}>
                                                            {t("ui.addedBy", { name: session.createdByName ?? "—" })}
                                                        </span>
                                                        <span className={styles.sessionItemsTotal}>
                                                            {t("ui.total", { amount: formatCurrency(session.total) })}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {sessionsPages > 1 && (
                            <div className={styles.pagination}>
                                <button className={styles.pageBtn} disabled={sessionsPage === 1}
                                    onClick={() => { void loadSessions(sessionsPage - 1); }}>{t("ui.prev")}</button>
                                <span className={styles.pageInfo}>{sessionsPage} / {sessionsPages}</span>
                                <button className={styles.pageBtn} disabled={sessionsPage === sessionsPages}
                                    onClick={() => { void loadSessions(sessionsPage + 1); }}>{t("ui.next")}</button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ══════════════ CONTRIBUTIONS TAB ══════════════ */}
            {activeTab === "contributions" && (
                <>
                    {/* Add form */}
                    {showContribForm && canWrite && (
                        <div className={styles.formCard}>
                            <div className={styles.formCardHeader}>
                                <h3 className={styles.formTitle}>{t("addContribution")}</h3>
                                <button className={styles.closeBtn} onClick={() => setShowContribForm(false)} aria-label={tc("close")}>
                                    <X size={16} />
                                </button>
                            </div>
                            <form onSubmit={(e) => void handleAddContribution(e)}>
                                <div className={styles.formRow}>
                                    <div className={styles.field}>
                                        <label className={styles.label}>{t("member")}</label>
                                        <Select
                                            className={styles.selectTrigger}
                                            value={contribMember}
                                            onChange={setContribMember}
                                            placeholder={t("ui.selectMember")}
                                            aria-label={t("member")}
                                            options={members.map((m) => ({ value: m.id, label: m.name }))}
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label}>{t("amount")}</label>
                                        <input className={styles.input} type="number" step="0.01" min="0.01"
                                            placeholder="৳ 0.00" value={contribAmount}
                                            onChange={(e) => setContribAmount(e.target.value)} required />
                                    </div>
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.field}>
                                        <label className={styles.label}>{t("date")}</label>
                                        <DatePicker value={contribDate} onChange={setContribDate}
                                            max={localISODate()} aria-label={t("date")} />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label}>{t("contributionNote")}</label>
                                        <input className={styles.input} type="text"
                                            placeholder={t("ui.depositNotePlaceholder")}
                                            value={contribNote} onChange={(e) => setContribNote(e.target.value)} />
                                    </div>
                                </div>
                                <div className={styles.formActions}>
                                    <button type="button" className={styles.cancelBtn}
                                        onClick={() => setShowContribForm(false)}>{tc("cancel")}</button>
                                    <button type="submit" className={styles.submitBtn} disabled={contribSubmitting}>
                                        {contribSubmitting ? tc("loading") : tc("save")}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Member summary — collapsible */}
                    {memberContribSummary.length > 0 && (
                        <div className={styles.summaryCard}>
                            <button className={styles.summaryToggle}
                                onClick={() => setContribSummaryOpen(!contribSummaryOpen)}>
                                <span className={styles.summaryTitle}>
                                    <Users size={14} /> {t("ui.memberDeposits", { total: formatCurrency(totalContrib) })}
                                </span>
                                {contribSummaryOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                            {contribSummaryOpen && (
                                <div className={styles.summaryGrid}>
                                    {memberContribSummary.map((s) => (
                                        <div key={s.name} className={styles.summaryRow}>
                                            <div className={styles.summaryInitial}>
                                                {s.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className={styles.summaryInfo}>
                                                <span className={styles.summaryName}>{s.name}</span>
                                                <span className={styles.summaryCount}>
                                                    {t("ui.depositCount", { n: s.count })}
                                                </span>
                                            </div>
                                            <span className={styles.summaryAmount}>
                                                {formatCurrency(s.total)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Contributions list */}
                    <div className={styles.listCard}>
                        <div className={styles.contribList}>
                            {contribLoading ? (
                                Array.from({ length: 4 }, (_, i) => (
                                    <div key={i} className={styles.contribRow}>
                                        <div className={cn(styles.skeleton, styles.skeletonIcon)} />
                                        <div className={styles.contribInfo}>
                                            <div className={cn(styles.skeleton, styles.skeletonText)} />
                                            <div className={cn(styles.skeleton, styles.skeletonTextSm)} />
                                        </div>
                                        <div className={cn(styles.skeleton, styles.skeletonAmt)} />
                                    </div>
                                ))
                            ) : contributions.length === 0 ? (
                                <div className={styles.emptyState}>{t("noContributions")}</div>
                            ) : (
                                contributions.map((c) => (
                                    <div key={c.id} className={cn(styles.contribRow, c.isVoided && styles.contribRowVoided)}>
                                        <div className={cn(styles.contribIcon, c.isVoided && styles.contribIconVoided)}>
                                            {c.isVoided ? <Ban size={14} /> : <TrendingDown size={14} />}
                                        </div>
                                        <div className={styles.contribInfo}>
                                            <span className={cn(styles.contribMember, c.isVoided && styles.voidedText)}>
                                                {c.memberName}
                                            </span>
                                            <span className={styles.contribMeta}>
                                                {fmtDate(c.date)}
                                                {c.note && ` · ${c.note}`}
                                                {c.recordedByName && (
                                                    <span className={styles.contribBy}> · {t("ui.by", { name: c.recordedByName })}</span>
                                                )}
                                                {c.isVoided && c.voidReason && (
                                                    <span className={styles.voidReasonInline}> · {c.voidReason}</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className={styles.contribRight}>
                                            <span className={cn(styles.contribAmount, c.isVoided && styles.voidedAmount)}>
                                                +{formatCurrency(c.amount)}
                                            </span>
                                            {canDelete && !c.isVoided && (
                                                <button className={styles.deleteBtn}
                                                    onClick={() => openVoidModal("contribution", c.id,
                                                        `${c.memberName} · +${formatCurrency(c.amount)}`)}
                                                    aria-label={t("ui.voidDeposit")}>
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {contribPages > 1 && (
                            <div className={styles.pagination}>
                                <button className={styles.pageBtn} disabled={contribPage === 1}
                                    onClick={() => { void loadContributions(contribPage - 1); }}>{t("ui.prev")}</button>
                                <span className={styles.pageInfo}>{contribPage} / {contribPages}</span>
                                <button className={styles.pageBtn} disabled={contribPage === contribPages}
                                    onClick={() => { void loadContributions(contribPage + 1); }}>{t("ui.next")}</button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ══════════════ MAGIC CALCULATOR ══════════════ */}
            {!showSessionForm && !showContribForm && (
            <div className={styles.calcFab}>
                {calcOpen && (
                    <div className={styles.calcPanel}>
                        {/* Mode tabs + close */}
                        <div className={styles.calcModeTabs}>
                            <button
                                className={cn(styles.calcModeTab, calcMode === "smart" && styles.calcModeTabActive)}
                                onClick={() => setCalcMode("smart")}
                            >
                                <Zap size={13} /> {tk("smart")}
                            </button>
                            <button
                                className={cn(styles.calcModeTab, calcMode === "manual" && styles.calcModeTabActive)}
                                onClick={() => setCalcMode("manual")}
                            >
                                <Calculator size={13} /> {tk("manual")}
                            </button>
                            <button className={styles.calcPanelClose} onClick={() => setCalcOpen(false)} aria-label={tc("close")}>
                                <X size={14} />
                            </button>
                        </div>

                        {/* ── Smart mode ── */}
                        {calcMode === "smart" && (
                            <div className={styles.calcSmartBody}>
                                {/* Live stats */}
                                <div className={styles.calcStats}>
                                    <div className={styles.calcStatBox}>
                                        <span className={styles.calcStatBoxLabel}>{tk("mealRate")}</span>
                                        <span className={styles.calcStatBoxValue}>
                                            {mealRate > 0 ? formatCurrency(mealRate) : "—"}
                                        </span>
                                        {mealRate > 0 && (
                                            <span className={styles.calcStatBoxSub}>{tk("perMeal")}</span>
                                        )}
                                    </div>
                                    <div className={styles.calcStatBox}>
                                        <span className={styles.calcStatBoxLabel}>{tk("totalExpense")}</span>
                                        <span className={styles.calcStatBoxValue}>
                                            {totalExpense > 0 ? formatCurrency(totalExpense) : "—"}
                                        </span>
                                        {totalMeals > 0 && (
                                            <span className={styles.calcStatBoxSub}>
                                                {t("ui.mealsN", { n: Math.round(totalMeals) })}
                                            </span>
                                        )}
                                    </div>
                                    <div className={cn(styles.calcStatBox, styles.calcStatBoxGreen)}>
                                        <span className={styles.calcStatBoxLabel}>{tk("totalDeposited")}</span>
                                        <span className={cn(styles.calcStatBoxValue, styles.calcGreenVal)}>
                                            {totalContrib > 0 ? formatCurrency(totalContrib) : "—"}
                                        </span>
                                        {totalContrib > 0 && totalExpense > 0 && (
                                            <span className={styles.calcStatBoxSub}>
                                                {t("ui.covered", { pct: Math.round((totalContrib / totalExpense) * 100) })}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* What-if */}
                                <div className={styles.calcWhatIf}>
                                    <p className={styles.calcSectionLabel}>
                                        <Zap size={12} /> {tk("whatIf")}
                                    </p>
                                    <input
                                        className={styles.calcWhatIfInput}
                                        type="number"
                                        step="1"
                                        min="0"
                                        placeholder={tk("whatIfPlaceholder")}
                                        value={whatIfAmt}
                                        onChange={(e) => setWhatIfAmt(e.target.value)}
                                    />
                                    {whatIfNewRate !== null && (
                                        <div className={styles.calcWhatIfResult}>
                                            <div className={styles.calcWhatIfRow}>
                                                <span>{tk("newRate")}</span>
                                                <strong>{formatCurrency(whatIfNewRate)}{tk("perMeal")}</strong>
                                            </div>
                                            <div className={cn(styles.calcWhatIfRow, styles.calcWhatIfDelta)}>
                                                <span>{tk("rateChange")}</span>
                                                <strong className={whatIfNewRate > mealRate ? styles.calcRed : styles.calcGreenVal}>
                                                    {whatIfNewRate > mealRate ? "+" : ""}
                                                    {formatCurrency(whatIfNewRate - mealRate)}{tk("perMeal")}
                                                </strong>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Member deposit breakdown */}
                                <div className={styles.calcMemberSection}>
                                    <p className={styles.calcSectionLabel}>
                                        <TrendingDown size={12} /> {tk("memberDeposits")}
                                    </p>
                                    {memberContribSummary.length === 0 ? (
                                        <p className={styles.calcEmptyHint}>{tk("noDeposits")}</p>
                                    ) : (
                                        <div className={styles.calcMemberList}>
                                            {memberContribSummary.map((m) => (
                                                <div key={m.name} className={styles.calcMemberRow}>
                                                    <div className={styles.calcMemberDot} />
                                                    <span className={styles.calcMemberName}>{m.name}</span>
                                                    <span className={styles.calcMemberAmt}>
                                                        {formatCurrency(m.total)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Manual calculator ── */}
                        {calcMode === "manual" && (
                            <div className={styles.calcManualBody}>
                                <div className={styles.calcDisplay}>
                                    {calcOp && calcPrev !== null && (
                                        <div className={styles.calcDisplayHint}>
                                            {calcPrev} {calcOp}
                                        </div>
                                    )}
                                    <div className={styles.calcDisplayVal}>{calcDisplay}</div>
                                </div>
                                <div className={styles.calcKeypad}>
                                    {/* Row 1 */}
                                    <button className={cn(styles.calcKey, styles.calcKeySpecial)} onClick={calcClear}>C</button>
                                    <button className={cn(styles.calcKey, styles.calcKeySpecial)}
                                        onClick={() => setCalcDisplay(String(-parseFloat(calcDisplay)))}>±</button>
                                    <button className={cn(styles.calcKey, styles.calcKeySpecial)}
                                        onClick={() => { setCalcDisplay(String(parseFloat(calcDisplay) / 100)); setCalcFresh(true); }}>%</button>
                                    <button className={cn(styles.calcKey, styles.calcKeyOp)}
                                        onClick={() => calcOperator("÷")}>÷</button>
                                    {/* Row 2 */}
                                    {["7","8","9"].map((d) => (
                                        <button key={d} className={styles.calcKey} onClick={() => calcDigit(d)}>{d}</button>
                                    ))}
                                    <button className={cn(styles.calcKey, styles.calcKeyOp)} onClick={() => calcOperator("×")}>×</button>
                                    {/* Row 3 */}
                                    {["4","5","6"].map((d) => (
                                        <button key={d} className={styles.calcKey} onClick={() => calcDigit(d)}>{d}</button>
                                    ))}
                                    <button className={cn(styles.calcKey, styles.calcKeyOp)} onClick={() => calcOperator("−")}>−</button>
                                    {/* Row 4 */}
                                    {["1","2","3"].map((d) => (
                                        <button key={d} className={styles.calcKey} onClick={() => calcDigit(d)}>{d}</button>
                                    ))}
                                    <button className={cn(styles.calcKey, styles.calcKeyOp)} onClick={() => calcOperator("+")}>+</button>
                                    {/* Row 5 */}
                                    <button className={cn(styles.calcKey, styles.calcKeyZero)} onClick={() => calcDigit("0")}>0</button>
                                    <button className={styles.calcKey} onClick={() => calcDigit(".")}>.</button>
                                    <button className={cn(styles.calcKey, styles.calcKeyEquals)} onClick={calcEquals}>=</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* FAB button */}
                <button
                    className={cn(styles.calcFabBtn, calcOpen && styles.calcFabBtnActive)}
                    onClick={() => setCalcOpen(!calcOpen)}
                    aria-label={t("ui.openCalculator")}
                    aria-expanded={calcOpen}
                >
                    <span className={styles.calcFabIcon}>{calcOpen ? <X size={18} /> : <Sparkles size={18} />}</span>
                    <span className={styles.calcFabText}>{t("ui.calculate")}</span>
                </button>
            </div>
            )}

            {/* ══════════════ VOID MODAL ══════════════ */}
            {voidModal && (
                <div className={styles.voidOverlay} onClick={() => { setVoidModal(null); setVoidReason(""); }}>
                    <div className={styles.voidModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.voidModalHeader}>
                            <Ban size={16} className={styles.voidModalIcon} />
                            <span className={styles.voidModalTitle}>
                                {voidModal.type === "session" ? t("ui.voidSessionTitle") : t("ui.voidDepositTitle")}
                            </span>
                        </div>
                        <p className={styles.voidModalLabel}>{voidModal.label}</p>
                        <p className={styles.voidModalWarning}>
                            {t("ui.voidWarning")}
                        </p>
                        <input
                            className={styles.voidReasonInput}
                            type="text"
                            placeholder={t("ui.voidReasonPlaceholder")}
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && voidReason.trim() && void handleVoidConfirm()}
                            autoFocus
                            maxLength={200}
                        />
                        <div className={styles.voidModalActions}>
                            <button className={styles.voidCancelBtn}
                                onClick={() => { setVoidModal(null); setVoidReason(""); }}>
                                {tc("cancel")}
                            </button>
                            <button className={styles.voidConfirmBtn}
                                onClick={() => void handleVoidConfirm()}
                                disabled={!voidReason.trim() || voidSubmitting}>
                                {voidSubmitting ? t("ui.voiding") : t("ui.voidEntry")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
