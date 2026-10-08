"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sun, CloudSun, Moon, Clock, Minus, Plus, Lock, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { MealSlot } from "@/types";
import { toast } from "sonner";
import styles from "./meals.module.css";

type MealSlotKey = "breakfast" | "lunch" | "dinner";
const SLOTS: MealSlotKey[] = ["breakfast", "lunch", "dinner"];

const SLOT_MAP: Record<MealSlotKey, MealSlot> = {
    breakfast: MealSlot.BREAKFAST,
    lunch: MealSlot.LUNCH,
    dinner: MealSlot.DINNER,
};

const SLOT_ICON: Record<MealSlotKey, typeof Sun> = { breakfast: Sun, lunch: CloudSun, dinner: Moon };

interface MealPreference {
    mealType: string;
    dayType: string;
    enabled: boolean;
    defaultCount: number;
}

export default function MealsPage() {
    const t = useTranslations("meals");
    const locale = useLocale();
    const { user, token } = useAuth();

    // Server-computed "today" in the mess timezone — never compute it client-side
    const [serverDate, setServerDate] = useState<string>("");
    const [meals, setMeals] = useState<Record<MealSlotKey, boolean>>({ breakfast: false, lunch: false, dinner: false });
    const [guestCount, setGuestCount] = useState(0);
    const [guestPolicy, setGuestPolicy] = useState<"HOST" | "SHARED">("HOST");
    const [slotLocked, setSlotLocked] = useState<Record<MealSlotKey, boolean>>({ breakfast: false, lunch: false, dinner: false });
    const [slotTimes, setSlotTimes] = useState<Record<MealSlotKey, string>>({ breakfast: "", lunch: "", dinner: "" });
    const [cutoffPassed, setCutoffPassed] = useState(false);
    const [cutoffTime, setCutoffTime] = useState("");
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<MealSlotKey | null>(null);
    const [updatingGuest, setUpdatingGuest] = useState(false);
    const [preferences, setPreferences] = useState<MealPreference[]>([]);
    const [todayDayType, setTodayDayType] = useState<"WEEKDAY" | "WEEKEND">("WEEKDAY");

    const loadToday = useCallback(async () => {
        if (!user || !token) return;
        try {
            const [log, prefResult] = await Promise.all([
                api.meals.getToday(user.id, token),
                api.mealPreferences.getAll(token),
            ]);
            setServerDate(log.date);
            setMeals({ breakfast: log.breakfastCount > 0, lunch: log.lunchCount > 0, dinner: log.dinnerCount > 0 });
            setGuestCount(log.guestCount);
            if (log.guestMealPolicy) setGuestPolicy(log.guestMealPolicy);
            if (log.dayType) setTodayDayType(log.dayType);
            setCutoffPassed(log.cutOffPassed);
            setCutoffTime(log.cutOffTime);
            if (log.slotCutoffs) {
                setSlotLocked({
                    breakfast: log.slotCutoffs.breakfast?.cutoffPassed ?? false,
                    lunch: log.slotCutoffs.lunch?.cutoffPassed ?? false,
                    dinner: log.slotCutoffs.dinner?.cutoffPassed ?? false,
                });
                setSlotTimes({
                    breakfast: log.slotCutoffs.breakfast?.cutoffTime ?? "",
                    lunch: log.slotCutoffs.lunch?.cutoffTime ?? "",
                    dinner: log.slotCutoffs.dinner?.cutoffTime ?? "",
                });
            }
            setPreferences(prefResult.preferences);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [user, token, t]);

    useEffect(() => {
        loadToday();
    }, [loadToday]);

    const getSlotStatus = useCallback(
        (slot: MealSlotKey): "default-off" | "override-on" | "override-off" | null => {
            const pref = preferences.find((p) => p.mealType === slot.toUpperCase() && p.dayType === todayDayType);
            if (!pref) return null;
            const isOn = meals[slot];
            if (!pref.enabled && !isOn) return "default-off";
            if (!pref.enabled && isOn) return "override-on";
            if (pref.enabled && !isOn) return "override-off";
            return null;
        },
        [meals, preferences, todayDayType],
    );

    async function toggleMeal(slot: MealSlotKey) {
        if (slotLocked[slot] || toggling !== null || !user || !token || !serverDate) return;
        const newStatus = !meals[slot];
        setMeals((prev) => ({ ...prev, [slot]: newStatus }));
        setToggling(slot);
        try {
            await api.meals.toggleMeal({ memberId: user.id, date: serverDate, slot: SLOT_MAP[slot], status: newStatus }, token);
        } catch (err) {
            setMeals((prev) => ({ ...prev, [slot]: !newStatus }));
            toast.error(err instanceof Error ? err.message : t("toggleFailed"));
        } finally {
            setToggling(null);
        }
    }

    async function setAllMeals(status: boolean) {
        if (!user || !token || !serverDate) return;
        const openSlots = SLOTS.filter((s) => !slotLocked[s] && meals[s] !== status);
        if (openSlots.length === 0) return;
        setMeals((prev) => {
            const next = { ...prev };
            for (const s of openSlots) next[s] = status;
            return next;
        });
        try {
            await Promise.all(
                openSlots.map((slot) =>
                    api.meals.toggleMeal({ memberId: user.id, date: serverDate, slot: SLOT_MAP[slot], status }, token),
                ),
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("toggleFailed"));
            loadToday();
        }
    }

    async function changeGuest(delta: number) {
        if (cutoffPassed || updatingGuest || !user || !token || !serverDate) return;
        const newCount = Math.max(0, guestCount + delta);
        setGuestCount(newCount);
        setUpdatingGuest(true);
        try {
            await api.meals.updateGuest({ memberId: user.id, date: serverDate, guestCount: newCount }, token);
        } catch (err) {
            setGuestCount(guestCount);
            toast.error(err instanceof Error ? err.message : t("guestFailed"));
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

    const fmtTime = (hhmm: string) => {
        if (!hhmm) return "";
        const [h, m] = hhmm.split(":").map(Number);
        return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1, h, m)));
    };
    const dateLabel = serverDate
        ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${serverDate}T00:00:00Z`))
        : "";

    const allLocked = SLOTS.every((s) => slotLocked[s]);
    const onCount = SLOTS.filter((s) => meals[s]).length;

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div>
                    <p className={styles.date}>{dateLabel || " "}</p>
                    <h2 className={styles.title}>
                        {t("title")} <span className={styles.titleCount}>{onCount}/3</span>
                    </h2>
                </div>
                <span className={cn(styles.cutoffPill, cutoffPassed ? styles.cutoffPillDone : styles.cutoffPillLive)}>
                    {cutoffPassed ? <Lock size={14} /> : <Clock size={14} />}
                    {cutoffPassed
                        ? t("cutoffPassed")
                        : cutoffRemaining
                            ? t("cutoffIn", { time: cutoffRemaining })
                            : cutoffTime
                                ? t("cutoffAt", { time: fmtTime(cutoffTime) })
                                : "—"}
                </span>
            </header>

            {/* All on / all off */}
            <div className={styles.segment} role="group" aria-label={t("subtitle")}>
                <button
                    type="button"
                    className={cn(styles.segmentBtn, onCount === 3 && styles.segmentBtnActive)}
                    onClick={() => setAllMeals(true)}
                    disabled={loading || allLocked}
                >
                    {t("allOn")}
                </button>
                <button
                    type="button"
                    className={cn(styles.segmentBtn, onCount === 0 && styles.segmentBtnActive)}
                    onClick={() => setAllMeals(false)}
                    disabled={loading || allLocked}
                >
                    {t("allOff")}
                </button>
            </div>

            {/* Meal cards — each card is one big switch */}
            <div className={styles.mealCards}>
                {SLOTS.map((slot) => {
                    const Icon = SLOT_ICON[slot];
                    const locked = slotLocked[slot];
                    const on = meals[slot];
                    const status = getSlotStatus(slot);
                    return (
                        <button
                            key={slot}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={t(slot)}
                            disabled={locked || loading || toggling !== null}
                            onClick={() => toggleMeal(slot)}
                            className={cn(
                                styles.mealCard,
                                styles[`slot_${slot}`],
                                on && styles.mealCardOn,
                                locked && styles.mealCardLocked,
                                toggling === slot && styles.mealCardBusy,
                            )}
                        >
                            <span className={styles.mealIcon}>
                                <Icon size={28} strokeWidth={2} />
                            </span>
                            <span className={styles.mealBody}>
                                <span className={styles.mealName}>{t(slot)}</span>
                                <span className={styles.mealMeta}>
                                    {locked ? (
                                        <>
                                            <Lock size={12} /> {t("locked")}
                                        </>
                                    ) : slotTimes[slot] ? (
                                        <>
                                            <Clock size={12} /> {t("locksAt", { time: fmtTime(slotTimes[slot]) })}
                                        </>
                                    ) : null}
                                </span>
                                {status && (
                                    <span className={cn(styles.chip, status === "default-off" ? styles.chipMuted : styles.chipHot)}>
                                        {status === "default-off" ? t("defaultOff") : status === "override-on" ? t("overrideOn") : t("overrideOff")}
                                    </span>
                                )}
                            </span>
                            <span className={styles.switch} aria-hidden>
                                <span className={styles.switchKnob}>{on && <Check size={14} strokeWidth={3} />}</span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Guests */}
            <section className={styles.guestCard}>
                <div className={styles.guestTop}>
                    <span className={styles.guestIcon}>
                        <UserPlus size={22} />
                    </span>
                    <div className={styles.guestText}>
                        <h3 className={styles.guestTitle}>{t("guestCount")}</h3>
                        <p className={styles.guestNote}>{guestPolicy === "SHARED" ? t("guestShared") : t("guestHostPays")}</p>
                    </div>
                </div>

                <div className={styles.stepper}>
                    <button
                        type="button"
                        className={styles.stepBtn}
                        onClick={() => changeGuest(-1)}
                        disabled={guestCount === 0 || cutoffPassed || updatingGuest}
                        aria-label={t("removeGuest")}
                    >
                        <Minus size={22} />
                    </button>
                    <span className={styles.stepValue} aria-live="polite">
                        <span className="num">{guestCount}</span>
                        {guestCount > 0 && onCount > 0 && (
                            <span className={styles.stepHint}>{t("guestMealsToday", { n: guestCount * onCount })}</span>
                        )}
                    </span>
                    <button
                        type="button"
                        className={cn(styles.stepBtn, styles.stepBtnPlus)}
                        onClick={() => changeGuest(1)}
                        disabled={cutoffPassed || updatingGuest}
                        aria-label={t("addGuest")}
                    >
                        <Plus size={22} />
                    </button>
                </div>
            </section>
        </div>
    );
}
