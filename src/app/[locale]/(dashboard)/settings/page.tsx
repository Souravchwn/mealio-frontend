"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { TimePicker } from "@/components/ui/TimePicker/TimePicker";
import { Select } from "@/components/ui/Select/Select";
import { Sun, CloudSun, Moon, Save, Copy, Check, Calendar, Users, RefreshCw, Globe, Megaphone, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ANNOUNCEMENT_MAX_LENGTH, ANNOUNCEMENT_VISIBLE_DAYS } from "@/lib/constants";
import type { Announcement, GuestMealPolicy } from "@/types";
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

// Zones people look for first (South Asia, the Gulf, and where members often work abroad)
const COMMON_TIMEZONES = [
    "Asia/Dhaka", "Asia/Kolkata", "Asia/Karachi", "Asia/Kathmandu", "Asia/Colombo", "Asia/Thimphu",
    "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kuwait", "Asia/Muscat", "Asia/Bahrain",
    "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Bangkok", "Asia/Jakarta", "Asia/Tokyo", "Asia/Seoul", "Asia/Hong_Kong",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
    "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto",
    "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland", "Africa/Cairo", "Africa/Johannesburg",
];
// Old names some browsers still list, and the current name for each
const LEGACY_TIMEZONES: Record<string, string> = {
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Dacca": "Asia/Dhaka",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Asia/Rangoon": "Asia/Yangon",
};

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

    // ── Timezone (decides when "today" starts and when cutoffs fall) ───────────
    const [timezone, setTimezone] = useState("Asia/Dhaka");
    const [savedTimezone, setSavedTimezone] = useState("Asia/Dhaka");
    const [savingTz, setSavingTz] = useState(false);

    // ── Broadcast ────────────────────────────────────────────────────────────────
    const [broadcastText, setBroadcastText] = useState("");
    const [sendingBroadcast, setSendingBroadcast] = useState(false);
    const [broadcasts, setBroadcasts] = useState<Announcement[]>([]);
    const [removingBroadcast, setRemovingBroadcast] = useState<string | null>(null);

    // ── Billing rules (served from Redis via /api/mess/settings) ───────────────
    const [guestPolicy, setGuestPolicy] = useState<GuestMealPolicy>("HOST");
    const [bazaarCredit, setBazaarCredit] = useState(false);
    const [carryForward, setCarryForward] = useState(true);
    const [weekendDays, setWeekendDays] = useState<number[]>([0, 6]);
    const [savingWeekend, setSavingWeekend] = useState(false);
    const [savingBilling, setSavingBilling] = useState(false);

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
            setTimezone(data.timezone);
            setSavedTimezone(data.timezone);
        }).catch(() => {});

        // Broadcasts still on show
        api.announcements.list(token).then((data) => setBroadcasts(data.announcements)).catch(() => {});

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

    // ── Timezone ───────────────────────────────────────────────────────────────
    async function saveTimezone() {
        if (!token) return;
        setSavingTz(true);
        try {
            await api.admin.updateSettings({ timezone }, token);
            setSavedTimezone(timezone);
            toast.success(t("timezone.saved"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("errors.save"));
        } finally {
            setSavingTz(false);
        }
    }

    // Every zone the browser knows, with its current offset, e.g. "Asia/Dhaka · UTC+6".
    // Browsers list some zones under their old names (Chrome says Asia/Calcutta, not Asia/Kolkata), so
    // the names people actually search for are added, and the old alias is hidden when the new one exists.
    const timezoneOptions = useMemo(() => {
        const isZone = (z: string) => {
            try {
                new Intl.DateTimeFormat("en", { timeZone: z });
                return true;
            } catch {
                return false;
            }
        };
        let known: string[] = [];
        try {
            known = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
        } catch {
            known = [];
        }
        const zones = new Set<string>([...known, ...COMMON_TIMEZONES.filter(isZone)]);
        for (const [legacy, modern] of Object.entries(LEGACY_TIMEZONES)) {
            if (zones.has(modern)) zones.delete(legacy);
        }
        zones.add(savedTimezone); // whatever is saved must always be selectable
        const now = new Date();
        return [...zones].sort().map((zone) => {
            let hint = "";
            try {
                hint = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
                    .formatToParts(now)
                    .find((p) => p.type === "timeZoneName")?.value.replace("GMT", "UTC") ?? "";
            } catch {
                hint = "";
            }
            return { value: zone, label: zone.replace(/_/g, " "), hint };
        });
    }, [savedTimezone]);

    // ── Broadcast ──────────────────────────────────────────────────────────────
    async function sendBroadcast() {
        const message = broadcastText.trim();
        if (!token || !message) return;
        setSendingBroadcast(true);
        try {
            const res = await api.announcements.create(message, token);
            setBroadcasts((prev) => [res.announcement, ...prev]);
            setBroadcastText("");
            toast.success(t("broadcast.sent"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("broadcast.failed"));
        } finally {
            setSendingBroadcast(false);
        }
    }

    async function removeBroadcast(id: string) {
        if (!token || !window.confirm(t("broadcast.removeConfirm"))) return;
        setRemovingBroadcast(id);
        try {
            await api.announcements.remove(id, token);
            setBroadcasts((prev) => prev.filter((b) => b.id !== id));
            toast.success(t("broadcast.removed"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("broadcast.failed"));
        } finally {
            setRemovingBroadcast(null);
        }
    }

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

                    <AccountSection />
                </>
            )}

            {/* ── Mess Settings Tab ─────────────────────────────────────────── */}
            {activeTab === "mess" && isAdminOrManager && (
                <>
                    {/* Broadcast */}
                    <Card>
                        <h3 className={styles.sectionTitle}>
                            <Megaphone size={18} />
                            {t("broadcast.title")}
                        </h3>
                        <p className={styles.helpText}>{t("broadcast.description", { days: ANNOUNCEMENT_VISIBLE_DAYS })}</p>
                        <div className={styles.field}>
                            <textarea
                                className={styles.textarea}
                                value={broadcastText}
                                onChange={(e) => setBroadcastText(e.target.value)}
                                maxLength={ANNOUNCEMENT_MAX_LENGTH}
                                rows={3}
                                placeholder={t("broadcast.placeholder")}
                                aria-label={t("broadcast.title")}
                            />
                            <div className={styles.broadcastFoot}>
                                <span className={styles.helpText}>{broadcastText.length}/{ANNOUNCEMENT_MAX_LENGTH}</span>
                                <Button onClick={sendBroadcast} disabled={sendingBroadcast || !broadcastText.trim()}>
                                    <Megaphone size={16} />
                                    {sendingBroadcast ? t("broadcast.sending") : t("broadcast.send")}
                                </Button>
                            </div>
                        </div>

                        <h4 className={styles.subTitle}>{t("broadcast.recent")}</h4>
                        {broadcasts.length === 0 ? (
                            <p className={styles.helpText}>{t("broadcast.none", { days: ANNOUNCEMENT_VISIBLE_DAYS })}</p>
                        ) : (
                            <ul className={styles.broadcastList}>
                                {broadcasts.map((b) => (
                                    <li key={b.id} className={styles.broadcastItem}>
                                        <div className={styles.broadcastBody}>
                                            <p className={styles.broadcastText}>{b.message}</p>
                                            <span className={styles.helpText}>
                                                {t("broadcast.by", { name: b.authorName })} ·{" "}
                                                {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(b.createdAt))}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.iconAction}
                                            onClick={() => void removeBroadcast(b.id)}
                                            disabled={removingBroadcast === b.id}
                                            aria-label={t("broadcast.remove")}
                                            title={t("broadcast.remove")}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

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

                    {/* Timezone */}
                    <Card>
                        <h3 className={styles.sectionTitle}>
                            <Globe size={18} />
                            {t("timezone.title")}
                        </h3>
                        <p className={styles.helpText}>{t("timezone.help")}</p>
                        <div className={styles.field}>
                            <div className={styles.inputRow}>
                                <Select
                                    value={timezone}
                                    onChange={setTimezone}
                                    options={timezoneOptions}
                                    disabled={!isAdmin}
                                    aria-label={t("timezone.title")}
                                />
                                {isAdmin && (
                                    <Button onClick={saveTimezone} disabled={savingTz || timezone === savedTimezone}>
                                        <Save size={16} />
                                        {savingTz ? t("saving") : t("saveChanges")}
                                    </Button>
                                )}
                            </div>
                        </div>
                        {!isAdmin && <p className={styles.helpText}>{t("timezone.adminOnly")}</p>}
                    </Card>

                    {/* Danger zone (Admin only) */}
                    {isAdmin && savedName && <DeleteMessCard messName={savedName} />}
                </>
            )}
        </div>
    );
}
