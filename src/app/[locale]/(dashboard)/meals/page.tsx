"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Sun, CloudSun, Moon, Clock, Minus, Plus, UserPlus } from "lucide-react";
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

type SlotRecord<T> = Record<MealSlotKey, T>;

export default function MealsPage() {
    const t = useTranslations("meals");
    const { user, token } = useAuth();

    const today = new Date().toISOString().slice(0, 10);

    const [meals, setMeals] = useState<SlotRecord<boolean>>({
        breakfast: false,
        lunch: false,
        dinner: false,
    });
    const [guests, setGuests] = useState<SlotRecord<number>>({
        breakfast: 0,
        lunch: 0,
        dinner: 0,
    });
    const [cutoffPassed, setCutoffPassed] = useState(false);
    const [cutoffTime, setCutoffTime] = useState("");
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<MealSlotKey | null>(null);
    const [updatingGuest, setUpdatingGuest] = useState<MealSlotKey | null>(null);

    const loadToday = useCallback(async () => {
        if (!user || !token) return;
        try {
            const log = await api.meals.getToday(user.id, token, today);
            // count > 0 = meal is active
            setMeals({
                breakfast: log.breakfastCount > 0,
                lunch: log.lunchCount > 0,
                dinner: log.dinnerCount > 0,
            });
            setGuests({
                breakfast: log.guestBreakfastCount,
                lunch: log.guestLunchCount,
                dinner: log.guestDinnerCount,
            });
            setCutoffPassed(log.cutOffPassed);
            setCutoffTime(log.cutOffTime);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to load today's meals");
        } finally {
            setLoading(false);
        }
    }, [user, token, today]);

    useEffect(() => {
        loadToday();
    }, [loadToday]);

    async function toggleMeal(slot: MealSlotKey) {
        if (cutoffPassed || toggling !== null || !user || !token) return;
        const newStatus = !meals[slot];
        setMeals((prev) => ({ ...prev, [slot]: newStatus }));
        setToggling(slot);
        try {
            await api.meals.toggleMeal(
                { memberId: user.id, date: today, slot: SLOT_MAP[slot], status: newStatus },
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
        if (cutoffPassed || !user || !token) return;
        const slots: MealSlotKey[] = ["breakfast", "lunch", "dinner"];
        setMeals({ breakfast: status, lunch: status, dinner: status });
        try {
            await Promise.all(
                slots.map((slot) =>
                    api.meals.toggleMeal(
                        { memberId: user.id, date: today, slot: SLOT_MAP[slot], status },
                        token
                    )
                )
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update meals");
            loadToday();
        }
    }

    async function changeGuest(slot: MealSlotKey, delta: number) {
        if (cutoffPassed || updatingGuest || !user || !token) return;
        const prev = guests[slot];
        const newCount = Math.max(0, prev + delta);
        if (newCount === prev) return;
        setGuests((g) => ({ ...g, [slot]: newCount }));
        setUpdatingGuest(slot);
        try {
            await api.meals.updateGuest(
                { memberId: user.id, date: today, slot: SLOT_MAP[slot], guestCount: newCount },
                token
            );
        } catch (err) {
            setGuests((g) => ({ ...g, [slot]: prev }));
            toast.error(err instanceof Error ? err.message : "Failed to update guest count");
        } finally {
            setUpdatingGuest(null);
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
                    disabled={cutoffPassed || loading}
                >
                    {t("allOn")}
                </Button>
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => setAllMeals(false)}
                    disabled={cutoffPassed || loading}
                >
                    {t("allOff")}
                </Button>
            </div>

            {/* Meal Cards */}
            <div className={styles.mealCards}>
                {mealSlots.map((slot) => (
                    <div
                        key={slot.key}
                        className={cn(
                            styles.mealCard,
                            meals[slot.key] && styles.mealCardActive
                        )}
                    >
                        <span className={styles.mealIcon}>{slot.icon}</span>
                        <div className={styles.mealCardContent}>
                            <h3 className={styles.mealName}>{slot.label}</h3>

                            <div className={styles.toggleWrap}>
                                <span className={cn(styles.toggleLabel, styles.toggleOff)}>
                                    {t("off")}
                                </span>
                                <button
                                    className={cn(
                                        styles.toggle,
                                        meals[slot.key] && styles.toggleActive,
                                        (cutoffPassed || toggling === slot.key) && styles.toggleDisabled
                                    )}
                                    onClick={() => toggleMeal(slot.key)}
                                    disabled={cutoffPassed || toggling !== null || loading}
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

                            {/* Per-slot guest stepper */}
                            <div className={styles.guestRow}>
                                <span className={styles.guestRowLabel}>
                                    <UserPlus size={14} />
                                    {t("guests")}
                                </span>
                                <div className={styles.guestStepper}>
                                    <button
                                        className={styles.guestBtn}
                                        onClick={() => changeGuest(slot.key, -1)}
                                        disabled={guests[slot.key] === 0 || cutoffPassed || updatingGuest !== null}
                                        aria-label={`${t("removeGuest")} — ${slot.label}`}
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <span className={styles.guestCount}>{guests[slot.key]}</span>
                                    <button
                                        className={styles.guestBtn}
                                        onClick={() => changeGuest(slot.key, 1)}
                                        disabled={cutoffPassed || updatingGuest !== null}
                                        aria-label={`${t("addGuest")} — ${slot.label}`}
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <p className={styles.guestHint}>{t("guestHint")}</p>
        </div>
    );
}
