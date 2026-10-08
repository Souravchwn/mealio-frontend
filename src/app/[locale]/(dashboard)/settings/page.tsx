"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { TimePicker } from "@/components/ui/TimePicker/TimePicker";
import { Sun, CloudSun, Moon, Save, Copy, Check, Link, Calendar, Users, Send, Unlink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { GuestMealPolicy } from "@/types";
import { AccountSection, DeleteMessCard } from "./AccountSection";
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
    const locale = useLocale();
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
    const [savedName, setSavedName] = useState("");
    const [requireApproval, setRequireApproval] = useState(true);
    const [savingApproval, setSavingApproval] = useState(false);
    const [rotating, setRotating] = useState(false);

    // ── Per-slot cutoff times ────────────────────────────────────────────────────
    const [cutoffInputs, setCutoffInputs] = useState<Record<string, string>>({
        BREAKFAST: "08:30",
        LUNCH: "13:00",
        DINNER: "21:00",
    });
    const [savingCutoffs, setSavingCutoffs] = useState(false);
    // Is each meal served by the mess at all? A meal switched off counts as 0 for everyone.
    const [mealServed, setMealServed] = useState<Record<string, boolean>>({ BREAKFAST: true, LUNCH: true, DINNER: true });

    // ── Month start day ──────────────────────────────────────────────────────────
    const [monthStartDay, setMonthStartDay] = useState(1);
    const [savingStartDay, setSavingStartDay] = useState(false);

    // ── Telegram group ───────────────────────────────────────────────────────────
    const [linkedGroup, setLinkedGroup] = useState<{ chatId: string; chatName: string } | null>(null);
    const [tgChatId, setTgChatId] = useState("");
    const [tgChatName, setTgChatName] = useState("");
    const [tgTimezone, setTgTimezone] = useState("");
    const [linkingTg, setLinkingTg] = useState(false);

    // ── Billing rules (served from Redis via /api/mess/settings) ───────────────
    const [guestPolicy, setGuestPolicy] = useState<GuestMealPolicy>("HOST");
    const [bazaarCredit, setBazaarCredit] = useState(false);
    const [carryForward, setCarryForward] = useState(true);
    const [weekendDays, setWeekendDays] = useState<number[]>([0, 6]);
    const [savingWeekend, setSavingWeekend] = useState(false);
    const [savingBilling, setSavingBilling] = useState(false);

    // ── My Telegram account ────────────────────────────────────────────────────
    const [tgAccountLinked, setTgAccountLinked] = useState(false);
    const [tgBotUsername, setTgBotUsername] = useState<string | null>(null);
    const [tgLinkCode, setTgLinkCode] = useState<{ code: string; expiresAt: string } | null>(null);
    const [tgCodeLoading, setTgCodeLoading] = useState(false);

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

        // My Telegram link status (all users)
        api.telegramLink.status(token).then((data) => {
            setTgAccountLinked(data.linked);
            setTgBotUsername(data.botUsername);
        }).catch(() => {});

        if (!isAdminOrManager) return;

        // Mess info
        api.mess.list(token).then((data) => {
            const current = data.messes.find((m) => m.isCurrent);
            if (current) {
                setName(current.name);
                setSavedName(current.name);
                setInviteCode(current.inviteCode ?? "");
            }
        }).catch(() => {});

        // Mess settings — month start day + billing rules
        api.admin.getSettings(token).then((data) => {
            if (data.monthStartDay) setMonthStartDay(data.monthStartDay);
            setGuestPolicy(data.guestMealPolicy);
            setBazaarCredit(data.bazaarCountsAsDeposit);
            setCarryForward(data.carryForwardBalance);
            setRequireApproval(data.requireJoinApproval ?? true);
            if (data.weekendDays) setWeekendDays(data.weekendDays);
            setTgTimezone(data.timezone);
        }).catch(() => {});

        // Per-slot cutoff configs
        api.mealConfigs.list(token).then((data) => {
            const inputs: Record<string, string> = { ...cutoffInputs };
            const served: Record<string, boolean> = { BREAKFAST: true, LUNCH: true, DINNER: true };
            for (const cfg of data.mealConfigs) {
                inputs[cfg.mealType] = cfg.cutoffTime;
                served[cfg.mealType] = cfg.enabled;
            }
            setCutoffInputs(inputs);
            setMealServed(served);
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
                        if (data.group.timezone) setTgTimezone(data.group.timezone);
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
            toast.error(t("errors.preference"));
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
            toast.error(err instanceof Error ? err.message : t("errors.save"));
        } finally {
            setSavingName(false);
        }
    }

    // ── Switch a meal on or off for the whole mess (applies from now on, never to past days) ──
    async function toggleServed(mealType: string, next: boolean) {
        if (!token) return;
        setMealServed((p) => ({ ...p, [mealType]: next }));
        try {
            await api.mealConfigs.update({ mealType, enabled: next }, token);
            toast.success(next ? t("served.on") : t("served.off"));
        } catch (err) {
            setMealServed((p) => ({ ...p, [mealType]: !next }));
            toast.error(err instanceof Error ? err.message : t("errors.save"));
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
            toast.error(err instanceof Error ? err.message : t("errors.cutoffs"));
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
            toast.success(t("monthStart.saved"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("errors.save"));
        } finally {
            setSavingStartDay(false);
        }
    }

    // ── Save billing rules ─────────────────────────────────────────────────────
    async function saveBillingRules() {
        if (!token) return;
        setSavingBilling(true);
        try {
            await api.admin.updateSettings({ guestMealPolicy: guestPolicy, bazaarCountsAsDeposit: bazaarCredit, carryForwardBalance: carryForward }, token);
            toast.success(t("billing.saved"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("billing.saveFailed"));
        } finally {
            setSavingBilling(false);
        }
    }

    // ── Weekend days ───────────────────────────────────────────────────────────
    function toggleWeekendDay(day: number) {
        setWeekendDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
        );
    }

    async function saveWeekendDays() {
        if (!token) return;
        setSavingWeekend(true);
        try {
            await api.admin.updateSettings({ weekendDays }, token);
            toast.success(t("weekend.saved"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("weekend.saveFailed"));
        } finally {
            setSavingWeekend(false);
        }
    }

    // Localised short weekday names, Sunday (0) … Saturday (6). 2023-01-01 was a Sunday.
    const weekdayNames = Array.from({ length: 7 }, (_, d) =>
        new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + d)))
    );

    // ── My Telegram account ────────────────────────────────────────────────────
    async function getTelegramCode() {
        if (!token) return;
        setTgCodeLoading(true);
        try {
            const data = await api.telegramLink.createCode(token);
            setTgLinkCode({ code: data.code, expiresAt: data.expiresAt });
            if (data.botUsername) setTgBotUsername(data.botUsername);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("telegramAccount.codeFailed"));
        } finally {
            setTgCodeLoading(false);
        }
    }

    async function unlinkTelegram() {
        if (!token) return;
        setTgCodeLoading(true);
        try {
            await api.telegramLink.unlink(token);
            setTgAccountLinked(false);
            setTgLinkCode(null);
            toast.success(t("telegramAccount.unlinked"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("telegramAccount.unlinkFailed"));
        } finally {
            setTgCodeLoading(false);
        }
    }

    // ── Copy invite ────────────────────────────────────────────────────────────
    async function toggleApproval(next: boolean) {
        if (!token) return;
        setSavingApproval(true);
        setRequireApproval(next);
        try {
            await api.admin.updateSettings({ requireJoinApproval: next }, token);
            toast.success(next ? t("inviteCard.approvalOn") : t("inviteCard.approvalOff"));
        } catch (err) {
            setRequireApproval(!next);
            toast.error(err instanceof Error ? err.message : t("errors.save"));
        } finally {
            setSavingApproval(false);
        }
    }

    async function rotateInvite() {
        if (!token || !window.confirm(t("inviteCard.rotateConfirm"))) return;
        setRotating(true);
        try {
            const res = await api.mess.rotateInvite(token);
            setInviteCode(res.inviteCode);
            toast.success(t("inviteCard.rotated"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("errors.save"));
        } finally {
            setRotating(false);
        }
    }

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
                throw new Error(err.detail || t("errors.linkGroup"));
            }
            const data = await res.json();
            setLinkedGroup(data.group);
            toast.success(t("telegramGroup.linked"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("errors.linkGroup"));
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

                    {/* My Telegram account */}
                    <Card>
                        <div className={styles.prefHeader}>
                            <div className={styles.sectionTitleRow}>
                                <h3 className={styles.sectionTitle}>
                                    <Send size={18} />
                                    {t("telegramAccount.title")}
                                </h3>
                                {tgAccountLinked && (
                                    <span className={styles.telegramLinkedBadge}>
                                        <Check size={12} />
                                        {t("telegramAccount.linked")}
                                    </span>
                                )}
                            </div>
                            <p className={styles.helpText}>{t("telegramAccount.description")}</p>
                        </div>

                        {tgLinkCode && (
                            <div className={styles.linkCodeBox}>
                                <span className={styles.inviteCodeText}>/link {tgLinkCode.code}</span>
                                <p className={styles.helpText}>
                                    {t("telegramAccount.instructions", {
                                        bot: tgBotUsername ? `@${tgBotUsername}` : t("telegramAccount.theBot"),
                                        time: new Date(tgLinkCode.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                                    })}
                                </p>
                            </div>
                        )}

                        <div className={styles.formActions}>
                            <Button onClick={getTelegramCode} disabled={tgCodeLoading}>
                                <Link size={16} />
                                {tgAccountLinked ? t("telegramAccount.relink") : t("telegramAccount.getCode")}
                            </Button>
                            {tgAccountLinked && (
                                <Button variant="secondary" onClick={unlinkTelegram} disabled={tgCodeLoading}>
                                    <Unlink size={16} />
                                    {t("telegramAccount.unlink")}
                                </Button>
                            )}
                        </div>
                    </Card>
                    <AccountSection />
                </>
            )}

            {/* ── Mess Settings Tab ─────────────────────────────────────────── */}
            {activeTab === "mess" && isAdminOrManager && (
                <>
                    {/* Billing rules */}
                    <Card>
                        <h3 className={styles.sectionTitle}>
                            <Users size={18} />
                            {t("billing.title")}
                        </h3>
                        <p className={styles.helpText}>
                            {t("billing.guestHelp")}
                        </p>

                        <div className={styles.optionList} role="radiogroup" aria-label={t("billing.guestTitle")}>
                            {(["HOST", "SHARED"] as const).map((policy) => (
                                <button
                                    key={policy}
                                    type="button"
                                    role="radio"
                                    aria-checked={guestPolicy === policy}
                                    disabled={!isAdmin}
                                    onClick={() => setGuestPolicy(policy)}
                                    className={cn(styles.option, guestPolicy === policy && styles.optionActive)}
                                >
                                    <span className={styles.optionTitle}>{t(`billing.policy.${policy}.title`)}</span>
                                    <span className={styles.optionDesc}>{t(`billing.policy.${policy}.description`)}</span>
                                </button>
                            ))}
                        </div>

                        <label className={styles.switchRow}>
                            <input
                                type="checkbox"
                                checked={bazaarCredit}
                                disabled={!isAdmin}
                                onChange={(e) => setBazaarCredit(e.target.checked)}
                            />
                            <span>
                                <span className={styles.optionTitle}>{t("billing.bazaarCredit.title")}</span>
                                <span className={styles.optionDesc}>{t("billing.bazaarCredit.description")}</span>
                            </span>
                        </label>

                        <label className={styles.switchRow}>
                            <input
                                type="checkbox"
                                checked={carryForward}
                                disabled={!isAdmin}
                                onChange={(e) => setCarryForward(e.target.checked)}
                            />
                            <span>
                                <span className={styles.optionTitle}>{t("billing.carryForward.title")}</span>
                                <span className={styles.optionDesc}>{t("billing.carryForward.description")}</span>
                            </span>
                        </label>

                        {isAdmin ? (
                            <div className={styles.formActions}>
                                <Button onClick={saveBillingRules} disabled={savingBilling}>
                                    <Save size={16} />
                                    {savingBilling ? t("saving") : t("saveChanges")}
                                </Button>
                            </div>
                        ) : (
                            <p className={styles.helpText}>{t("billing.adminOnly")}</p>
                        )}
                    </Card>

                    {/* Per-slot cutoff times */}
                    <Card>
                        <h3 className={styles.sectionTitle}>{t("cutoffTimes")}</h3>
                        <p className={styles.helpText}>
                            {t("cutoffTimesHelp")}
                        </p>

                        <div className={styles.cutoffList}>
                            {SLOT_UPPER.map((slot) => (
                                <div key={slot} className={styles.cutoffRow}>
                                    <label className={styles.cutoffLabel}>
                                        {CUTOFF_LABELS[slot] ?? slot}
                                    </label>
                                    <label className={styles.servedSwitch}>
                                        <input
                                            type="checkbox"
                                            checked={mealServed[slot] ?? true}
                                            onChange={(e) => void toggleServed(slot, e.target.checked)}
                                        />
                                        <span>{t("served.label")}</span>
                                    </label>
                                    <TimePicker
                                        value={cutoffInputs[slot] ?? ""}
                                        onChange={(v) => setCutoffInputs((prev) => ({ ...prev, [slot]: v }))}
                                        aria-label={CUTOFF_LABELS[slot] ?? slot}
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

                    {/* Weekend days */}
                    <Card>
                        <h3 className={styles.sectionTitle}>{t("weekend.title")}</h3>
                        <p className={styles.helpText}>
                            {t("weekend.help")}
                        </p>
                        <div className={styles.dayChips} role="group" aria-label={t("weekend.title")}>
                            {weekdayNames.map((label, day) => (
                                <button
                                    key={day}
                                    type="button"
                                    aria-pressed={weekendDays.includes(day)}
                                    disabled={!isAdmin}
                                    onClick={() => toggleWeekendDay(day)}
                                    className={cn(styles.dayChip, weekendDays.includes(day) && styles.dayChipActive)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {isAdmin && (
                            <div className={styles.formActions}>
                                <Button onClick={saveWeekendDays} disabled={savingWeekend || weekendDays.length > 6}>
                                    <Save size={16} />
                                    {savingWeekend ? t("saving") : t("saveChanges")}
                                </Button>
                            </div>
                        )}
                    </Card>

                    {/* Month Start Day */}
                    <Card>
                        <h3 className={styles.sectionTitle}>
                            <Calendar size={18} />
                            {t("monthStart.title")}
                        </h3>
                        <p className={styles.helpText}>
                            {t("monthStart.help")}
                        </p>
                        <div className={styles.field}>
                            <div className={styles.inputRow}>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    className={`${styles.input} ${styles.inputNarrow}`}
                                    min={1}
                                    max={28}
                                    value={monthStartDay}
                                    onChange={(e) => setMonthStartDay(Math.max(1, Math.min(28, Number(e.target.value))))}
                                />
                                <span className={styles.helpText}>
                                    {monthStartDay === 1
                                        ? t("monthStart.calendar")
                                        : t("monthStart.range", { start: monthStartDay, end: monthStartDay - 1 })}
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
                        <div className={styles.field}>
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
                            <button type="button" className={styles.textAction} onClick={() => void rotateInvite()} disabled={rotating}>
                                <RefreshCw size={16} /> {t("inviteCard.rotate")}
                            </button>
                            <label className={styles.switchRow}>
                                <input
                                    type="checkbox"
                                    checked={requireApproval}
                                    disabled={savingApproval}
                                    onChange={(e) => void toggleApproval(e.target.checked)}
                                />
                                <span>
                                    <span className={styles.optionTitle}>{t("inviteCard.approvalTitle")}</span>
                                    <span className={styles.optionDesc}>{t("inviteCard.approvalDesc")}</span>
                                </span>
                            </label>
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
                                        placeholder={t("telegramGroup.chatNamePlaceholder")}
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
                    {isAdmin && savedName && <DeleteMessCard messName={savedName} />}
                </>
            )}
        </div>
    );
}
