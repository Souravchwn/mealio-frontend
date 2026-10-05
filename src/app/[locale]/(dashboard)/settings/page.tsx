"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Sun, CloudSun, Moon, Save, AlertTriangle, Copy, Check, Link, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import styles from "./settings.module.css";

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const DAY_TYPES = ["WEEKDAY", "WEEKEND"] as const;
type MealType = (typeof MEAL_TYPES)[number];
type DayType = (typeof DAY_TYPES)[number];
type Tab = "general" | "mess";

type PrefKey = `${MealType}_${DayType}`;
type PrefMap = Record<PrefKey, boolean>;

const MEAL_ICONS: Record<MealType, React.ReactNode> = {
    breakfast: <Sun size={16} />,
    lunch:     <CloudSun size={16} />,
    dinner:    <Moon size={16} />,
};

const SLOT_UPPER = ["BREAKFAST", "LUNCH", "DINNER"] as const;

function defaultPrefs(): PrefMap {
    const map = {} as PrefMap;
    for (const meal of MEAL_TYPES) {
        for (const day of DAY_TYPES) {
            map[`${meal}_${day}`] = true;
        }
    }
    return map;
}

export default function SettingsPage() {
    const t = useTranslations("settings");
    const { user, token } = useAuth();

    const [activeTab, setActiveTab] = useState<Tab>("general");

    // ── Meal preferences ────────────────────────────────────────────────────────
    const [prefs, setPrefs] = useState<PrefMap>(defaultPrefs());
    const [updatingPref, setUpdatingPref] = useState<PrefKey | null>(null);

    // ── Mess config (name) ──────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [savingName, setSavingName] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [copied, setCopied] = useState(false);

    // ── Per-slot cutoff times ────────────────────────────────────────────────────
    const [cutoffInputs, setCutoffInputs] = useState<Record<string, string>>({
        BREAKFAST: "08:30",
        LUNCH: "13:00",
        DINNER: "21:00",
    });
    const [savingCutoffs, setSavingCutoffs] = useState(false);

    // ── Month start day ──────────────────────────────────────────────────────────
    const [monthStartDay, setMonthStartDay] = useState(1);
    const [savingStartDay, setSavingStartDay] = useState(false);

    // ── Telegram group ───────────────────────────────────────────────────────────
    const [linkedGroup, setLinkedGroup] = useState<{ chatId: string; chatName: string } | null>(null);
    const [tgChatId, setTgChatId] = useState("");
    const [tgChatName, setTgChatName] = useState("");
    const [tgTimezone, setTgTimezone] = useState("Asia/Dhaka");
    const [linkingTg, setLinkingTg] = useState(false);

    const isAdminOrManager = user?.role === "ADMIN" || user?.role === "MANAGER";
    const isAdmin = user?.role === "ADMIN";

    // ── Load all data ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user || !token) return;

        // Meal preferences (all users)
        api.mealPreferences.getAll(token).then((data) => {
            const map = defaultPrefs();
            for (const p of data.preferences) {
                const key = `${p.mealType.toLowerCase()}_${p.dayType}` as PrefKey;
                map[key] = p.enabled;
            }
            setPrefs(map);
        }).catch(() => {});

        if (!isAdminOrManager) return;

        // Mess info
        api.mess.list(token).then((data) => {
            const current = data.messes.find((m) => m.isCurrent);
            if (current) {
                setName(current.name);
                setInviteCode(current.inviteCode);
            }
        }).catch(() => {});

        // Month start day — from mess settings
        fetch("/api/mess/settings", {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data?.month_start_day) setMonthStartDay(data.month_start_day);
            })
            .catch(() => {});

        // Per-slot cutoff configs
        api.mealConfigs.list(token).then((data) => {
            const inputs: Record<string, string> = { ...cutoffInputs };
            for (const cfg of data.mealConfigs) {
                inputs[cfg.mealType] = cfg.cutoffTime;
            }
            setCutoffInputs(inputs);
        }).catch(() => {});

        // Telegram group (Admin only)
        if (isAdmin) {
            fetch("/api/admin/telegram-group", {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => r.ok ? r.json() : null)
                .then((data) => {
                    if (data?.group) {
                        setLinkedGroup(data.group);
                        setTgChatId(data.group.chatId ?? "");
                        setTgChatName(data.group.chatName ?? "");
                        setTgTimezone(data.group.timezone ?? "Asia/Dhaka");
                    }
                })
                .catch(() => {});
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, token]);

    // ── Preference toggle ─────────────────────────────────────────────────────
    const togglePref = useCallback(async (meal: MealType, day: DayType) => {
        if (!token) return;
        const key: PrefKey = `${meal}_${day}`;
        const newVal = !prefs[key];
        setUpdatingPref(key);
        setPrefs((prev) => ({ ...prev, [key]: newVal }));
        try {
            await api.mealPreferences.update({ mealType: meal.toUpperCase(), dayType: day, enabled: newVal }, token);
            toast.success(t("mealPreferences.saved"));
        } catch {
            setPrefs((prev) => ({ ...prev, [key]: !newVal }));
            toast.error("Failed to update preference");
        } finally {
            setUpdatingPref(null);
        }
    }, [prefs, token, t]);

    // ── Save mess name ─────────────────────────────────────────────────────────
    async function saveMessName() {
        if (!token || !name.trim()) return;
        setSavingName(true);
        try {
            await api.admin.updateSettings({ name: name.trim() }, token);
            toast.success(t("messSaved"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setSavingName(false);
        }
    }

    // ── Save per-slot cutoff times ─────────────────────────────────────────────
    async function saveCutoffs() {
        if (!token) return;
        setSavingCutoffs(true);
        try {
            await Promise.all(
                Object.entries(cutoffInputs).map(([mealType, cutoffTime]) =>
                    api.mealConfigs.update({ mealType, cutoffTime }, token)
                )
            );
            toast.success(t("cutoffsSaved"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save cutoff times");
        } finally {
            setSavingCutoffs(false);
        }
    }

    // ── Save month start day ───────────────────────────────────────────────────
    async function saveMonthStartDay() {
        if (!token) return;
        setSavingStartDay(true);
        try {
            await api.admin.updateSettings({ monthStartDay }, token);
            toast.success("Month start day saved");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setSavingStartDay(false);
        }
    }

    // ── Copy invite ────────────────────────────────────────────────────────────
    async function handleCopyInvite() {
        await navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // ── Link Telegram group ───────────────────────────────────────────────────
    async function handleLinkTelegram(e: React.FormEvent) {
        e.preventDefault();
        if (!token || !tgChatId.trim()) return;
        setLinkingTg(true);
        try {
            const res = await fetch("/api/admin/telegram-group", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ chat_id: tgChatId.trim(), chat_name: tgChatName.trim(), timezone: tgTimezone }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Failed to link group");
            }
            const data = await res.json();
            setLinkedGroup(data.group);
            toast.success(t("telegramGroup.linked"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to link group");
        } finally {
            setLinkingTg(false);
        }
    }

    // ── Cutoff label map ──────────────────────────────────────────────────────
    const CUTOFF_LABELS: Record<string, string> = {
        BREAKFAST: t("breakfastCutoff"),
        LUNCH:     t("lunchCutoff"),
        DINNER:    t("dinnerCutoff"),
    };

    return (
        <div className={styles.page}>
            <div>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle")}</p>
            </div>

            {/* Tab bar */}
            <div className={styles.tabBar}>
                <button
                    className={cn(styles.tab, activeTab === "general" && styles.tabActive)}
                    onClick={() => setActiveTab("general")}
                >
                    {t("tabs.general")}
                </button>
                {isAdminOrManager && (
                    <button
                        className={cn(styles.tab, activeTab === "mess" && styles.tabActive)}
                        onClick={() => setActiveTab("mess")}
                    >
                        {t("tabs.mess")}
                    </button>
                )}
            </div>

            {/* ── General Tab ───────────────────────────────────────────────── */}
            {activeTab === "general" && (
                <>
                    <Card>
                        <div className={styles.prefHeader}>
                            <h3 className={styles.sectionTitle}>{t("mealPreferences.title")}</h3>
                            <p className={styles.helpText}>{t("mealPreferences.subtitle")}</p>
                        </div>

                        <div className={styles.prefTable}>
                            {/* Header row */}
                            <div className={styles.prefTableHeader}>
                                <div className={styles.prefTableCell} />
                                {DAY_TYPES.map((day) => (
                                    <div key={day} className={cn(styles.prefTableCell, styles.prefDayHeader)}>
                                        {day === "WEEKDAY" ? t("mealPreferences.weekday") : t("mealPreferences.weekend")}
                                    </div>
                                ))}
                            </div>

                            {/* Meal rows */}
                            {MEAL_TYPES.map((meal) => (
                                <div key={meal} className={styles.prefTableRow}>
                                    <div className={cn(styles.prefTableCell, styles.prefMealLabel)}>
                                        <span className={styles.prefMealIcon}>{MEAL_ICONS[meal]}</span>
                                        {t(`mealPreferences.${meal}`)}
                                    </div>
                                    {DAY_TYPES.map((day) => {
                                        const key: PrefKey = `${meal}_${day}`;
                                        const enabled = prefs[key];
                                        return (
                                            <div key={day} className={cn(styles.prefTableCell, styles.prefToggleCell)}>
                                                <button
                                                    type="button"
                                                    onClick={() => togglePref(meal, day)}
                                                    disabled={updatingPref === key}
                                                    className={cn(
                                                        styles.prefToggle,
                                                        enabled ? styles.prefOn : styles.prefOff,
                                                        updatingPref === key && styles.prefSaving
                                                    )}
                                                    role="switch"
                                                    aria-checked={enabled}
                                                    aria-label={`${t(`mealPreferences.${meal}`)} ${day}`}
                                                >
                                                    <span className={styles.prefToggleKnob} />
                                                </button>
                                                <span className={cn(
                                                    styles.prefStatusLabel,
                                                    enabled ? styles.prefStatusOn : styles.prefStatusOff
                                                )}>
                                                    {enabled ? t("mealPreferences.on") : t("mealPreferences.off")}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            )}

            {/* ── Mess Settings Tab ─────────────────────────────────────────── */}
            {activeTab === "mess" && isAdminOrManager && (
                <>
                    {/* Per-slot cutoff times */}
                    <Card>
                        <h3 className={styles.sectionTitle}>{t("cutoffTimes")}</h3>
                        <p className={styles.helpText} style={{ marginBottom: "var(--space-5)" }}>
                            {t("cutoffTimesHelp")}
                        </p>

                        <div className={styles.cutoffList}>
                            {SLOT_UPPER.map((slot) => (
                                <div key={slot} className={styles.cutoffRow}>
                                    <label className={styles.cutoffLabel}>
                                        {CUTOFF_LABELS[slot] ?? slot}
                                    </label>
                                    <input
                                        type="time"
                                        className={styles.input}
                                        style={{ width: "auto" }}
                                        value={cutoffInputs[slot] ?? ""}
                                        onChange={(e) =>
                                            setCutoffInputs((prev) => ({ ...prev, [slot]: e.target.value }))
                                        }
                                    />
                                </div>
                            ))}
                        </div>

                        <div className={styles.formActions}>
                            <Button onClick={saveCutoffs} disabled={savingCutoffs}>
                                <Save size={16} />
                                {savingCutoffs ? t("saving") : t("saveCutoffs")}
                            </Button>
                        </div>
                    </Card>

                    {/* Month Start Day */}
                    <Card>
                        <h3 className={styles.sectionTitle}>
                            <Calendar size={18} />
                            Billing Period Start Day
                        </h3>
                        <p className={styles.helpText} style={{ marginBottom: "var(--space-4)" }}>
                            Set which day of the month your billing cycle begins. For example, setting this to 10 means
                            each period runs from the 10th to the 9th of the next month.
                        </p>
                        <div className={styles.field}>
                            <div className={styles.inputRow}>
                                <input
                                    type="number"
                                    className={styles.input}
                                    style={{ width: "100px" }}
                                    min={1}
                                    max={28}
                                    value={monthStartDay}
                                    onChange={(e) => setMonthStartDay(Math.max(1, Math.min(28, Number(e.target.value))))}
                                />
                                <span className={styles.helpText}>
                                    {monthStartDay === 1
                                        ? "Calendar month (1st → last day)"
                                        : `${monthStartDay}th → ${monthStartDay - 1}${monthStartDay - 1 === 1 ? "st" : monthStartDay - 1 === 2 ? "nd" : monthStartDay - 1 === 3 ? "rd" : "th"} of next month`}
                                </span>
                                <Button onClick={saveMonthStartDay} disabled={savingStartDay}>
                                    <Save size={16} />
                                    {savingStartDay ? t("saving") : t("saveChanges")}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Mess name */}
                    <Card>
                        <h3 className={styles.sectionTitle}>{t("messName")}</h3>
                        <div className={styles.field} style={{ marginTop: "var(--space-4)" }}>
                            <div className={styles.inputRow}>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t("messName")}
                                />
                                <Button onClick={saveMessName} disabled={savingName || !name.trim()}>
                                    <Save size={16} />
                                    {savingName ? t("saving") : t("saveChanges")}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Invite Code (Admin only) */}
                    {isAdmin && inviteCode && (
                        <Card>
                            <div className={styles.inviteCardHeader}>
                                <h3 className={styles.sectionTitle}>{t("inviteCard.title")}</h3>
                                <p className={styles.inviteCardDesc}>{t("inviteCard.description")}</p>
                            </div>
                            <div className={styles.inviteCodeDisplay}>
                                <span className={styles.inviteCodeText}>{inviteCode}</span>
                                <Button variant="secondary" size="small" type="button" onClick={handleCopyInvite}>
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                    {copied ? t("inviteCard.copied") : t("inviteCard.copy")}
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Telegram group (Admin only) */}
                    {isAdmin && (
                        <Card>
                            <div className={styles.prefHeader}>
                                <div className={styles.sectionTitleRow}>
                                    <h3 className={styles.sectionTitle}>{t("telegramGroup.title")}</h3>
                                    {linkedGroup && (
                                        <span className={styles.telegramLinkedBadge}>
                                            <Check size={12} />
                                            {t("telegramGroup.linked")}
                                        </span>
                                    )}
                                </div>
                                <p className={styles.helpText}>{t("telegramGroup.description")}</p>
                            </div>

                            <form className={styles.form} onSubmit={handleLinkTelegram}>
                                <div className={styles.field}>
                                    <label className={styles.label}>{t("telegramGroup.chatId")}</label>
                                    <input
                                        className={styles.input}
                                        type="text"
                                        value={tgChatId}
                                        onChange={(e) => setTgChatId(e.target.value)}
                                        placeholder="-100123456789"
                                        required
                                    />
                                    <span className={styles.helpText}>{t("telegramGroup.chatIdHelp")}</span>
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>{t("telegramGroup.chatName")}</label>
                                    <input
                                        className={styles.input}
                                        type="text"
                                        value={tgChatName}
                                        onChange={(e) => setTgChatName(e.target.value)}
                                        placeholder="e.g. Bashundhara Mess Group"
                                    />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>{t("telegramGroup.timezone")}</label>
                                    <input
                                        className={styles.input}
                                        type="text"
                                        value={tgTimezone}
                                        onChange={(e) => setTgTimezone(e.target.value)}
                                        placeholder="Asia/Dhaka"
                                    />
                                </div>
                                <div className={styles.formActions}>
                                    <Button type="submit" disabled={linkingTg || !tgChatId.trim()}>
                                        <Link size={16} />
                                        {linkingTg ? t("telegramGroup.linking") : t("telegramGroup.link")}
                                    </Button>
                                </div>
                            </form>
                        </Card>
                    )}

                    {/* Danger zone (Admin only) */}
                    {isAdmin && (
                        <Card className={styles.dangerCard}>
                            <div className={styles.dangerHeader}>
                                <AlertTriangle size={20} />
                                <h3>{t("dangerZone")}</h3>
                            </div>
                            <p className={styles.dangerDesc}>
                                Permanently deletes the mess and all associated data. This cannot be undone.
                            </p>
                            <Button variant="danger" size="small" disabled>
                                {t("deleteMess")} ({t("contactSupport")})
                            </Button>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
