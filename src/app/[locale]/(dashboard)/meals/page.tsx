"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Sun, CloudSun, Moon, Clock, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { MealSlot } from "@/types";
import { toast } from "sonner";
import styles from "./meals.module.css";

type MealSlotKey = "breakfast" | "lunch" | "dinner";

const SLOT_MAP: Record<MealSlotKey, MealSlot> = {
    breakfast: MealSlot.BREAKFAST,
    lunch: MealSlot.LUNCH,
    dinner: MealSlot.DINNER,
};

interface MealPreference {
    mealType: string;
    dayType: string;
    enabled: boolean;
    defaultCount: number;
}

export default function MealsPage() {
    const t = useTranslations("meals");
    const { user, token } = useAuth();

    // Server-computed "today" in the mess timezone (Asia/Dhaka).
    // Do NOT compute this client-side — client UTC date can differ from mess-timezone date.
    const [serverDate, setServerDate] = useState<string>("");

    const [meals, setMeals] = useState<Record<MealSlotKey, boolean>>({
        breakfast: false,
        lunch: false,
        dinner: false,
    });
    const [guestCount, setGuestCount] = useState(0);
    // Per-slot cutoff: each slot locks independently once its cutoff passes
    const [slotCutoffs, setSlotCutoffs] = useState<Record<MealSlotKey, boolean>>({
        breakfast: false,
        lunch: false,
        dinner: false,
    });
    // Header badge: next upcoming cutoff time + whether all slots are passed
    const [cutoffPassed, setCutoffPassed] = useState(false);
    const [cutoffTime, setCutoffTime] = useState("");
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<MealSlotKey | null>(null);
    const [updatingGuest, setUpdatingGuest] = useState(false);
    const [preferences, setPreferences] = useState<MealPreference[]>([]);

    const loadToday = useCallback(async () => {
        if (!user || !token) return;
        try {
            // Load meal log and preferences in parallel
            const [log, prefResult] = await Promise.all([
                api.meals.getToday(user.id, token),
                api.mealPreferences.getAll(token),
            ]);
            setServerDate(log.date);
            setMeals({
                breakfast: log.breakfastCount > 0,
                lunch: log.lunchCount > 0,
                dinner: log.dinnerCount > 0,
            });
            setGuestCount(log.guestCount);
            setCutoffPassed(log.cutOffPassed);
            setCutoffTime(log.cutOffTime);
            // Per-slot cutoff — falls back gracefully if server doesn't return it yet
            if (log.slotCutoffs) {
                setSlotCutoffs({
                    breakfast: log.slotCutoffs.breakfast?.cutoffPassed ?? false,
                    lunch:     log.slotCutoffs.lunch?.cutoffPassed ?? false,
                    dinner:    log.slotCutoffs.dinner?.cutoffPassed ?? false,
                });
            }
            setPreferences(prefResult.preferences);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to load today's meals");
        } finally {
            setLoading(false);
        }
    }, [user, token]);

    useEffect(() => {
        loadToday();
    }, [loadToday]);

    // Determine today's day type client-side (for preference cross-reference display only)
    // Note: slight inaccuracy possible around midnight vs mess timezone — acceptable for display.
    const todayDayType = useMemo(() => {
        const dow = new Date().getDay(); // 0=Sun, 6=Sat
        return dow === 0 || dow === 6 ? "WEEKEND" : "WEEKDAY";
    }, []);

    // Get the preference for a slot + today's day type
    const getPref = useCallback(
        (slot: MealSlotKey): MealPreference | undefined =>
            preferences.find(
                (p) => p.mealType === slot.toUpperCase() && p.dayType === todayDayType
            ),
        [preferences, todayDayType]
    );

    /**
     * Derive the slot's display status by comparing its current state against
     * the member's preference for today's day type.
     *
     * - "default-off"  → preference says OFF and slot is OFF (system default)
     * - "override-on"  → preference says OFF but slot is ON (member overrode it)
     * - "override-off" → preference says ON  but slot is OFF (member manually turned off)
     * - null           → preference says ON and slot is ON (normal state, no badge)
     */
    const getSlotStatus = useCallback(
        (slot: MealSlotKey): "default-off" | "override-on" | "override-off" | null => {
            const pref = getPref(slot);
            if (!pref) return null;
            const isOn = meals[slot];
            if (!pref.enabled && !isOn) return "default-off";
            if (!pref.enabled && isOn) return "override-on";
            if (pref.enabled && !isOn) return "override-off";
            return null;
        },
        [meals, getPref]
    );

    async function toggleMeal(slot: MealSlotKey) {
        if (slotCutoffs[slot] || toggling !== null || !user || !token || !serverDate) return;
        const newStatus = !meals[slot];
        setMeals((prev) => ({ ...prev, [slot]: newStatus }));
        setToggling(slot);
        try {
            await api.meals.toggleMeal(
                { memberId: user.id, date: serverDate, slot: SLOT_MAP[slot], status: newStatus },
                token
            );
        } catch (err) {
            setMeals((prev) => ({ ...prev, [slot]: !newStatus }));
            toast.error(err instanceof Error ? err.message : "Failed to toggle meal");
        } finally {
            setToggling(null);
        }
    }

    async function setAllMeals(status: boolean) {
        if (!user || !token || !serverDate) return;
        // Only act on slots that haven't passed their cutoff yet
        const openSlots = (["breakfast", "lunch", "dinner"] as MealSlotKey[]).filter(
            (s) => !slotCutoffs[s]
        );
        if (openSlots.length === 0) return;
        setMeals((prev) => {
            const next = { ...prev };
            for (const s of openSlots) next[s] = status;
            return next;
        });
        try {
            await Promise.all(
                openSlots.map((slot) =>
                    api.meals.toggleMeal(
                        { memberId: user.id, date: serverDate, slot: SLOT_MAP[slot], status },
                        token
                    )
                )
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update meals");
            loadToday();
        }
    }

    async function changeGuest(delta: number) {
        // Block guest changes only after dinner cutoff (last meal of day)
        if (slotCutoffs.dinner || updatingGuest || !user || !token || !serverDate) return;
        const newCount = Math.max(0, guestCount + delta);
        setGuestCount(newCount);
        setUpdatingGuest(true);
        try {
            await api.meals.updateGuest({ memberId: user.id, date: serverDate, guestCount: newCount }, token);
        } catch (err) {
            setGuestCount(guestCount);
            toast.error(err instanceof Error ? err.message : "Failed to update guest count");
        } finally {
            setUpdatingGuest(false);
        }
    }

    const cutoffRemaining = (() => {
        if (!cutoffTime || cutoffPassed) return "";
        const [h, m] = cutoffTime.split(":").map(Number);
        const cutoff = new Date();
        cutoff.setHours(h, m, 0, 0);
        const diff = cutoff.getTime() - Date.now();
        if (diff <= 0) return "";
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    })();

    const mealSlots: { key: MealSlotKey; icon: React.ReactNode; label: string }[] = [
        { key: "breakfast", icon: <Sun size={48} strokeWidth={1.5} />, label: t("breakfast") },
        { key: "lunch", icon: <CloudSun size={48} strokeWidth={1.5} />, label: t("lunch") },
        { key: "dinner", icon: <Moon size={48} strokeWidth={1.5} />, label: t("dinner") },
    ];

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerText}>
                    <h2>{t("title")}</h2>
                    <p>{t("subtitle")}</p>
                </div>

                <div
                    className={cn(
                        styles.cutoffBadge,
                        cutoffPassed ? styles.cutoffExpired : styles.cutoffActive
                    )}
                >
                    <Clock size={16} />
                    {cutoffPassed
                        ? t("cutoffPassed")
                        : cutoffRemaining
                        ? t("cutoffIn", { time: cutoffRemaining })
                        : cutoffTime
                        ? `Cutoff: ${cutoffTime}`
                        : "—"}
                </div>
            </div>

            {/* Bulk Actions */}
            <div className={styles.bulkActions}>
                <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setAllMeals(true)}
                    disabled={loading || (slotCutoffs.breakfast && slotCutoffs.lunch && slotCutoffs.dinner)}
                >
                    {t("allOn")}
                </Button>
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => setAllMeals(false)}
                    disabled={loading || (slotCutoffs.breakfast && slotCutoffs.lunch && slotCutoffs.dinner)}
                >
                    {t("allOff")}
                </Button>
            </div>

            {/* Meal Cards */}
            <div className={styles.mealCards}>
                {mealSlots.map((slot) => {
                    const locked = slotCutoffs[slot.key];
                    const status = getSlotStatus(slot.key);
                    return (
                    <div
                        key={slot.key}
                        className={cn(
                            styles.mealCard,
                            meals[slot.key] && styles.mealCardActive,
                            locked && styles.mealCardLocked
                        )}
                        onClick={() => !locked && !loading && toggleMeal(slot.key)}
                    >
                        <span className={styles.mealIcon}>{slot.icon}</span>
                        <div className={styles.mealCardContent}>
                            <h3 className={styles.mealName}>{slot.label}</h3>

                            {/* Preference status chip */}
                            {status === "default-off" && (
                                <span className={cn(styles.statusChip, styles.chipDefaultOff)}>
                                    {t("defaultOff")}
                                </span>
                            )}
                            {status === "override-on" && (
                                <span className={cn(styles.statusChip, styles.chipOverride)}>
                                    {t("overrideOn")}
                                </span>
                            )}
                            {status === "override-off" && (
                                <span className={cn(styles.statusChip, styles.chipOverride)}>
                                    {t("overrideOff")}
                                </span>
                            )}

                            <div className={styles.toggleWrap}>
                                <span className={cn(styles.toggleLabel, styles.toggleOff)}>
                                    {t("off")}
                                </span>
                                <button
                                    className={cn(
                                        styles.toggle,
                                        meals[slot.key] && styles.toggleActive,
                                        (locked || toggling === slot.key) && styles.toggleDisabled
                                    )}
                                    onClick={(e) => { e.stopPropagation(); toggleMeal(slot.key); }}
                                    disabled={locked || toggling !== null || loading}
                                    role="switch"
                                    aria-checked={meals[slot.key]}
                                    aria-label={`Toggle ${slot.label}`}
                                >
                                    <span className={styles.toggleKnob} />
                                </button>
                                <span className={cn(styles.toggleLabel, styles.toggleOn)}>
                                    {t("on")}
                                </span>
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>

            {/* Guest Section */}
            <div className={styles.guestSection}>
                <div className={styles.guestHeader}>
                    <h3 className={styles.guestTitle}>{t("guestCount")}</h3>
                    {guestCount > 0 && (
                        <span className={styles.guestNote}>
                            {t("guestPortions", { n: guestCount })}
                        </span>
                    )}
                </div>

                <div className={styles.guestControls}>
                    <button
                        className={styles.guestBtn}
                        onClick={() => changeGuest(-1)}
                        disabled={guestCount === 0 || cutoffPassed || updatingGuest}
                        aria-label={t("removeGuest")}
                    >
                        <Minus size={20} />
                    </button>
                    <span className={styles.guestCount}>{guestCount}</span>
                    <button
                        className={styles.guestBtn}
                        onClick={() => changeGuest(1)}
                        disabled={cutoffPassed || updatingGuest}
                        aria-label={t("addGuest")}
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
