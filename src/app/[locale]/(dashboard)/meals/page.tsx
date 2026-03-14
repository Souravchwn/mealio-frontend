"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sun, CloudSun, Moon, Clock, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { cn } from "@/lib/utils";
import styles from "./meals.module.css";

export default function MealsPage() {
    const t = useTranslations("meals");

    const [meals, setMeals] = useState({
        breakfast: true,
        lunch: true,
        dinner: false,
    });

    const [guestCount, setGuestCount] = useState(0);
    const cutoffPassed = false; // Replace with real cut-off logic

    function toggleMeal(slot: "breakfast" | "lunch" | "dinner") {
        if (cutoffPassed) return;
        setMeals((prev) => ({ ...prev, [slot]: !prev[slot] }));
        // TODO: API call with optimistic update
    }

    const mealSlots = [
        {
            key: "breakfast" as const,
            icon: <Sun size={48} strokeWidth={1.5} />,
            label: t("breakfast"),
        },
        {
            key: "lunch" as const,
            icon: <CloudSun size={48} strokeWidth={1.5} />,
            label: t("lunch"),
        },
        {
            key: "dinner" as const,
            icon: <Moon size={48} strokeWidth={1.5} />,
            label: t("dinner"),
        },
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
                        : t("cutoffIn", { time: "3h 25m" })}
                </div>
            </div>

            {/* Bulk Actions */}
            <div className={styles.bulkActions}>
                <Button
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        setMeals({ breakfast: true, lunch: true, dinner: true })
                    }
                    disabled={cutoffPassed}
                >
                    {t("allOn")}
                </Button>
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() =>
                        setMeals({ breakfast: false, lunch: false, dinner: false })
                    }
                    disabled={cutoffPassed}
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
                        <h3 className={styles.mealName}>{slot.label}</h3>

                        <div className={styles.toggleWrap}>
                            <span className={cn(styles.toggleLabel, styles.toggleOff)}>
                                {t("off")}
                            </span>
                            <button
                                className={cn(
                                    styles.toggle,
                                    meals[slot.key] && styles.toggleActive,
                                    cutoffPassed && styles.toggleDisabled
                                )}
                                onClick={() => toggleMeal(slot.key)}
                                disabled={cutoffPassed}
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
                ))}
            </div>

            {/* Guest Section */}
            <div className={styles.guestSection}>
                <div className={styles.guestHeader}>
                    <h3 className={styles.guestTitle}>{t("guestCount")}</h3>
                </div>

                <div className={styles.guestControls}>
                    <button
                        className={styles.guestBtn}
                        onClick={() => setGuestCount((c) => Math.max(0, c - 1))}
                        disabled={guestCount === 0 || cutoffPassed}
                        aria-label={t("removeGuest")}
                    >
                        <Minus size={20} />
                    </button>
                    <span className={styles.guestCount}>{guestCount}</span>
                    <button
                        className={styles.guestBtn}
                        onClick={() => setGuestCount((c) => c + 1)}
                        disabled={cutoffPassed}
                        aria-label={t("addGuest")}
                    >
                        <Plus size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
