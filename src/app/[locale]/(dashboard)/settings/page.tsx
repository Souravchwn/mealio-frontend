"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Save, AlertTriangle, Copy, Check, Link } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import styles from "./settings.module.css";

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const DAY_TYPES = ["WEEKDAY", "WEEKEND"] as const;
type MealType = (typeof MEAL_TYPES)[number];
type DayType = (typeof DAY_TYPES)[number];

type PrefKey = `${MealType}_${DayType}`;
type PrefMap = Record<PrefKey, boolean>;

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

    // ── Mess config ─────────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [cutOffTime, setCutOffTime] = useState("21:00");
    const [budget, setBudget] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // ── Telegram group ───────────────────────────────────────────────────────
    const [linkedGroup, setLinkedGroup] = useState<{ chatId: string; chatName: string } | null>(null);
    const [tgChatId, setTgChatId] = useState("");
    const [tgChatName, setTgChatName] = useState("");
    const [tgTimezone, setTgTimezone] = useState("Asia/Dhaka");
    const [linkingTg, setLinkingTg] = useState(false);

    // ── Meal preferences ─────────────────────────────────────────────────────
    const [prefs, setPrefs] = useState<PrefMap>(defaultPrefs());
    const [updatingPref, setUpdatingPref] = useState<PrefKey | null>(null);

    const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";
    const isOwner = user?.role === "ADMIN";

    useEffect(() => {
        if (!user || !token) return;
        // Load mess settings
        api.mess.list(token).then((data) => {
            const current = data.messes.find((m) => m.isCurrent);
            if (current) {
                setName(current.name);
                setCutOffTime(current.cutOffTime);
                setInviteCode(current.inviteCode);
            }
        }).catch(() => {});

        // Load current Telegram group (ADMIN only)
        if (user?.role === "ADMIN") {
            fetch("/api/admin/telegram-group", {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => r.ok ? r.json() : null)
                .then((data) => {
                    if (data?.group) setLinkedGroup(data.group);
                })
                .catch(() => {});
        }

        // Load personal meal preferences
        api.mealPreferences.getAll(token).then((data) => {
            const map = defaultPrefs();
            for (const p of data.preferences) {
                const key = `${p.mealType}_${p.dayType}` as PrefKey;
                map[key] = p.enabled;
            }
            setPrefs(map);
        }).catch(() => {});
    }, [user, token]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!token) return;
        setSaving(true);
        try {
            await api.admin.updateSettings({ name, cutOffTime }, token);
            toast.success("Settings saved");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save settings");
        } finally {
            setSaving(false);
        }
    }

    async function handleCopyInvite() {
        await navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

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
            setTgChatId("");
            setTgChatName("");
            toast.success(t("telegramGroup.linked"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to link group");
        } finally {
            setLinkingTg(false);
        }
    }

    const togglePref = useCallback(async (meal: MealType, day: DayType) => {
        if (!token) return;
        const key: PrefKey = `${meal}_${day}`;
        const newVal = !prefs[key];
        setUpdatingPref(key);
        setPrefs((prev) => ({ ...prev, [key]: newVal }));
        try {
            await api.mealPreferences.update({ mealType: meal, dayType: day, enabled: newVal }, token);
            toast.success(t("mealPreferences.saved"));
        } catch {
            // Revert on error
            setPrefs((prev) => ({ ...prev, [key]: !newVal }));
            toast.error("Failed to update preference");
        } finally {
            setUpdatingPref(null);
        }
    }, [prefs, token, t]);

    return (
        <div className={styles.page}>
            <div>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle")}</p>
            </div>

            {/* ── Personal Meal Preferences (all users) ── */}
            <Card>
                <div className={styles.prefHeader}>
                    <h3 className={styles.sectionTitle}>{t("mealPreferences.title")}</h3>
                    <p className={styles.helpText}>{t("mealPreferences.subtitle")}</p>
                </div>

                <div className={styles.prefGrid}>
                    {DAY_TYPES.map((day) => (
                        <div key={day} className={styles.prefDayGroup}>
                            <p className={styles.prefDayLabel}>
                                {day === "WEEKDAY" ? t("mealPreferences.weekday") : t("mealPreferences.weekend")}
                            </p>
                            <div className={styles.prefMealRow}>
                                {MEAL_TYPES.map((meal) => {
                                    const key: PrefKey = `${meal}_${day}`;
                                    const enabled = prefs[key];
                                    return (
                                        <button
                                            key={meal}
                                            type="button"
                                            onClick={() => togglePref(meal, day)}
                                            disabled={updatingPref === key}
                                            className={`${styles.prefToggle} ${enabled ? styles.prefOn : styles.prefOff}`}
                                            aria-label={`${t(`mealPreferences.${meal}`)} ${day} ${enabled ? "ON" : "OFF"}`}
                                        >
                                            <span className={styles.prefEmoji}>
                                                {meal === "breakfast" ? "🍳" : meal === "lunch" ? "🍱" : "🌙"}
                                            </span>
                                            <span className={styles.prefMealName}>
                                                {t(`mealPreferences.${meal}`)}
                                            </span>
                                            <span className={styles.prefStatus}>
                                                {enabled ? "ON" : "OFF"}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* ── Mess Settings (admin / manager only) ── */}
            {isAdmin && (
                <Card>
                    <form className={styles.form} onSubmit={handleSave}>
                        <div className={styles.field}>
                            <label className={styles.label}>{t("messName")}</label>
                            <input
                                className={styles.input}
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>{t("cutoffTime")}</label>
                            <input
                                className={styles.input}
                                type="time"
                                value={cutOffTime}
                                onChange={(e) => setCutOffTime(e.target.value)}
                            />
                            <span className={styles.helpText}>{t("cutoffHelp")}</span>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Estimated Monthly Budget (৳)</label>
                            <input
                                className={styles.input}
                                type="number"
                                min="0"
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                placeholder="Optional"
                            />
                        </div>

                        <div className={styles.formActions}>
                            <Button type="submit" disabled={saving}>
                                <Save size={16} />
                                {saving ? "Saving…" : t("saveChanges")}
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* ── Invite Code Card (ADMIN only) ── */}
            {isOwner && inviteCode && (
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

            {/* ── Telegram Group (ADMIN only) ── */}
            {isOwner && (
                <Card>
                    <div className={styles.prefHeader}>
                        <h3 className={styles.sectionTitle}>{t("telegramGroup.title")}</h3>
                        <p className={styles.helpText}>{t("telegramGroup.description")}</p>
                    </div>

                    {linkedGroup && (
                        <div className={styles.telegramLinkedBadge}>
                            <Link size={14} />
                            {t("telegramGroup.linked")}: {linkedGroup.chatName || linkedGroup.chatId}
                        </div>
                    )}

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
                        {t("deleteMess")} (contact support)
                    </Button>
                </Card>
            )}
        </div>
    );
}
