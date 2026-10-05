"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
    Sun, CloudSun, Moon, Users, UserPlus, RefreshCw, CheckCircle,
    Clock, ChevronRight, X, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { HeadcountResponse, HeadcountSlot, HeadcountMember } from "@/types";
import { toast } from "sonner";
import styles from "./headcount.module.css";

type SlotKey = "breakfast" | "lunch" | "dinner";

const SLOT_META: Record<SlotKey, { icon: React.ReactNode; colorClass: string; slotUpper: string }> = {
    breakfast: { icon: <Sun size={28} strokeWidth={1.5} />, colorClass: styles.slotBreakfast, slotUpper: "BREAKFAST" },
    lunch:     { icon: <CloudSun size={28} strokeWidth={1.5} />, colorClass: styles.slotLunch, slotUpper: "LUNCH" },
    dinner:    { icon: <Moon size={28} strokeWidth={1.5} />, colorClass: styles.slotDinner, slotUpper: "DINNER" },
};

// ── Detail panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
    slotKey: SlotKey;
    slot: HeadcountSlot;
    date: string;
    onClose: () => void;
    t: ReturnType<typeof useTranslations>;
    token: string;
}

function DetailPanel({ slotKey, slot, date, onClose, t, token }: DetailPanelProps) {
    const meta = SLOT_META[slotKey];
    const slotLabel = t(slotKey);
    const [note, setNote] = useState(slot.cookNote ?? "");
    const [saving, setSaving] = useState(false);

    const having = slot.members.filter((m) => m.count > 0);
    const notHaving = slot.members.filter((m) => m.count === 0);

    async function saveNote() {
        setSaving(true);
        try {
            await api.cook.saveNote({ slot: meta.slotUpper, note, date }, token);
            toast.success(t("noteSaved"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save note");
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            {/* Overlay */}
            <div className={styles.detailOverlay} onClick={onClose} />

            {/* Panel */}
            <div className={styles.detailPanel}>
                {/* Header */}
                <div className={styles.detailHeader}>
                    <div className={cn(styles.detailIcon, meta.colorClass)}>
                        {meta.icon}
                    </div>
                    <div className={styles.detailHeaderText}>
                        <h3>{t("detailTitle", { meal: slotLabel })}</h3>
                        <p>{date}</p>
                    </div>
                    <button className={styles.detailClose} onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                {/* Cook note */}
                <div className={styles.detailSection}>
                    <label className={styles.detailLabel}>{t("cookNote")}</label>
                    <textarea
                        className={styles.cookNoteArea}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("cookNotePlaceholder")}
                        rows={2}
                    />
                    <button
                        className={styles.saveNoteBtn}
                        onClick={saveNote}
                        disabled={saving}
                    >
                        <Save size={14} />
                        {saving ? "Saving..." : t("saveNote")}
                    </button>
                </div>

                {/* Summary */}
                <div className={styles.detailSummary}>
                    <div className={styles.detailStat}>
                        <span className={styles.detailStatNum}>{slot.memberCount}</span>
                        <span className={styles.detailStatLabel}>{t("members")}</span>
                    </div>
                    {slot.guestCount > 0 && (
                        <div className={styles.detailStat}>
                            <span className={styles.detailStatNum}>{slot.guestCount}</span>
                            <span className={styles.detailStatLabel}>{t("guests")}</span>
                        </div>
                    )}
                    <div className={styles.detailStat}>
                        <span className={cn(styles.detailStatNum, styles.detailStatTotal)}>{slot.total}</span>
                        <span className={styles.detailStatLabel}>{t("total")}</span>
                    </div>
                </div>

                {/* Member list */}
                <div className={styles.detailSection}>
                    <label className={styles.detailLabel}>{t("whoIsHaving")}</label>

                    {having.length === 0 ? (
                        <p className={styles.detailEmpty}>{t("noMeals")}</p>
                    ) : (
                        <ul className={styles.memberList}>
                            {having.map((m) => (
                                <MemberRow key={m.id} member={m} eating t={t} />
                            ))}
                        </ul>
                    )}

                    {notHaving.length > 0 && (
                        <>
                            <label className={cn(styles.detailLabel, styles.detailLabelMuted)} style={{ marginTop: "var(--space-4)" }}>
                                {t("notHaving")}
                            </label>
                            <ul className={styles.memberList}>
                                {notHaving.map((m) => (
                                    <MemberRow key={m.id} member={m} eating={false} t={t} />
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function MemberRow({ member, eating, t }: { member: HeadcountMember; eating: boolean; t: ReturnType<typeof useTranslations> }) {
    return (
        <li className={cn(styles.memberRow, eating ? styles.memberRowOn : styles.memberRowOff)}>
            <div className={cn(styles.memberDot, eating ? styles.memberDotOn : styles.memberDotOff)} />
            <span className={styles.memberName}>{member.name}</span>
            {eating && (
                <span className={styles.memberPortions}>
                    {member.count > 1 ? `×${member.count}` : ""}
                    {member.guestCount > 0 && (
                        <span className={styles.memberGuests}>
                            <UserPlus size={12} />
                            {member.guestCount}
                        </span>
                    )}
                </span>
            )}
            {!eating && (
                <span className={styles.memberOffLabel}>{t("mealOff")}</span>
            )}
        </li>
    );
}

// ── Slot card ─────────────────────────────────────────────────────────────────

interface SlotCardProps {
    slotKey: SlotKey;
    slot: HeadcountSlot;
    onDetail: () => void;
    t: ReturnType<typeof useTranslations>;
}

function SlotCard({ slotKey, slot, onDetail, t }: SlotCardProps) {
    const meta = SLOT_META[slotKey];
    return (
        <div
            className={cn(styles.slotCard, slot.cutoffPassed && styles.slotCardCooked)}
            onClick={onDetail}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onDetail()}
            aria-label={`View ${slotKey} detail`}
            style={{ cursor: "pointer" }}
        >
            {/* Header */}
            <div className={styles.slotHeader}>
                <div className={cn(styles.slotIcon, meta.colorClass)}>
                    {meta.icon}
                </div>
                <span className={styles.slotName}>{t(slotKey)}</span>
                {slot.cutoffPassed && (
                    <span className={styles.cookedBadge}>
                        <CheckCircle size={12} />
                        {t("mealCooked")}
                    </span>
                )}
                <ChevronRight size={16} className={styles.slotChevron} />
            </div>

            {/* Big number */}
            <div className={styles.slotTotal}>
                {slot.total}
            </div>
            <div className={styles.slotTotalLabel}>{t("people")}</div>

            {/* Breakdown */}
            <div className={styles.slotBreakdown}>
                <div className={styles.slotBreakdownItem}>
                    <Users size={14} />
                    <span>{slot.memberCount}</span>
                    <span className={styles.slotBreakdownLabel}>{t("members")}</span>
                </div>
                {slot.guestCount > 0 && (
                    <>
                        <div className={styles.slotBreakdownDivider} />
                        <div className={styles.slotBreakdownItem}>
                            <UserPlus size={14} />
                            <span>{slot.guestCount}</span>
                            <span className={styles.slotBreakdownLabel}>{t("guests")}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Cutoff footer */}
            <div className={cn(styles.slotCutoff, slot.cutoffPassed && styles.slotCutoffDone)}>
                {slot.cutoffPassed ? (
                    <>
                        <CheckCircle size={13} />
                        {t("cutoffWas", { time: slot.cutoffTime })}
                    </>
                ) : (
                    <>
                        <Clock size={13} />
                        {t("cutoffAt", { time: slot.cutoffTime })}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HeadcountPage() {
    const t = useTranslations("headcount");
    const { user, token } = useAuth();

    const [data, setData] = useState<HeadcountResponse | null>(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [refreshing, setRefreshing] = useState(false);
    const [timeSinceUpdate, setTimeSinceUpdate] = useState(0);
    const [detailSlot, setDetailSlot] = useState<SlotKey | null>(null);

    const fetchHeadcount = useCallback(async () => {
        if (!user || !token) return;
        try {
            const result = await api.cook.getHeadcount(user.messId, token);
            setData(result);
            setLastUpdated(new Date());
        } catch {
            // silently fail on background refresh
        }
    }, [user, token]);

    useEffect(() => {
        void fetchHeadcount();
    }, [fetchHeadcount]);

    // Tick every second for timeSinceUpdate
    useEffect(() => {
        const ticker = setInterval(() => {
            setTimeSinceUpdate(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
        }, 1000);
        return () => clearInterval(ticker);
    }, [lastUpdated]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchHeadcount, 30_000);
        return () => clearInterval(interval);
    }, [fetchHeadcount]);

    async function handleRefresh() {
        setRefreshing(true);
        await fetchHeadcount();
        setRefreshing(false);
    }

    const isStale = timeSinceUpdate > 60;
    const slots = data?.slots;

    return (
        <div className={styles.page}>
            {/* Page header */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                <button
                    className={cn(styles.refreshBtn, refreshing && styles.refreshing)}
                    onClick={handleRefresh}
                    aria-label="Refresh"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* 3 slot cards */}
            <div className={styles.slotsGrid}>
                {(["breakfast", "lunch", "dinner"] as SlotKey[]).map((key) => (
                    slots ? (
                        <SlotCard
                            key={key}
                            slotKey={key}
                            slot={slots[key]}
                            onDetail={() => setDetailSlot(key)}
                            t={t}
                        />
                    ) : (
                        <div key={key} className={cn(styles.slotCard, styles.slotCardSkeleton)} />
                    )
                ))}
            </div>

            {/* Last updated */}
            <div className={cn(styles.lastUpdated, isStale && styles.lastUpdatedStale)}>
                {t("lastUpdated")}:{" "}
                {lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                {isStale && <span className={styles.staleBadge}>Stale</span>}
            </div>

            {/* Detail panel */}
            {detailSlot && slots && token && (
                <DetailPanel
                    slotKey={detailSlot}
                    slot={slots[detailSlot]}
                    date={data?.date ?? ""}
                    onClose={() => setDetailSlot(null)}
                    t={t}
                    token={token}
                />
            )}
        </div>
    );
}
