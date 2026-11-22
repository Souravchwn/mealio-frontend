"use client";

/**
 * Quick setup — a four-step wizard for the mess admin:
 *   1. Mess: name and timezone        2. Meals: which meals are served and when they lock
 *   3. People: add members by name, share the invite link
 *   4. Done: install the app on this phone, go to Overview
 *
 * Opens by itself right after someone creates a mess, and any time from Settings or the
 * app's long-press shortcut. Every step saves when you press Next, so leaving halfway keeps
 * what was done. Nothing here is new behaviour: it uses the same APIs as Settings and Members.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Share2, UserPlus, Sun, CloudSun, Moon } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { TimePicker } from "@/components/ui/TimePicker/TimePicker";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { buildTimezoneOptions } from "@/lib/timezones";
import { canInstall, isInstalled, onInstallPromptChange, promptInstall } from "@/lib/install-prompt";
import styles from "./setup.module.css";

const STEPS = ["mess", "meals", "people", "done"] as const;
type Step = (typeof STEPS)[number];
const SLOTS = ["BREAKFAST", "LUNCH", "DINNER"] as const;
type Slot = (typeof SLOTS)[number];
const SLOT_ICON: Record<Slot, React.ReactNode> = {
    BREAKFAST: <Sun size={18} />,
    LUNCH: <CloudSun size={18} />,
    DINNER: <Moon size={18} />,
};

interface SlotState {
    enabled: boolean;
    cutoff: string;
}

export default function SetupPage() {
    const t = useTranslations("setup");
    const locale = useLocale();
    const router = useRouter();
    const { user, token } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [step, setStep] = useState<Step>("mess");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Step 1
    const [name, setName] = useState("");
    const [savedName, setSavedName] = useState("");
    const [timezone, setTimezone] = useState("Asia/Dhaka");
    const [savedTimezone, setSavedTimezone] = useState("Asia/Dhaka");
    const timezoneOptions = useMemo(() => buildTimezoneOptions(savedTimezone), [savedTimezone]);

    // Step 2
    const [slots, setSlots] = useState<Record<Slot, SlotState> | null>(null);
    const [savedSlots, setSavedSlots] = useState<Record<Slot, SlotState> | null>(null);

    // Step 3
    const [members, setMembers] = useState<string[]>([]);
    const [newName, setNewName] = useState("");
    const [adding, setAdding] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [copied, setCopied] = useState(false);

    // Step 4: the browser's install offer (Chrome, Edge, Samsung Internet)
    const installable = useSyncExternalStore(onInstallPromptChange, canInstall, () => false);
    const installed = useSyncExternalStore(() => () => {}, isInstalled, () => false);

    useEffect(() => {
        if (!token || !user || !isAdmin) {
            setLoading(false);
            return;
        }
        Promise.allSettled([
            api.admin.getSettings(token),
            api.mealConfigs.list(token),
            api.mess.list(token),
            api.members.list(user.messId, token),
        ]).then(([settingsRes, configsRes, messRes, membersRes]) => {
            if (settingsRes.status === "fulfilled") {
                setName(settingsRes.value.name);
                setSavedName(settingsRes.value.name);
                setTimezone(settingsRes.value.timezone);
                setSavedTimezone(settingsRes.value.timezone);
            }
            if (configsRes.status === "fulfilled") {
                const map = {} as Record<Slot, SlotState>;
                for (const slot of SLOTS) {
                    const c = configsRes.value.mealConfigs.find((m) => m.mealType === slot);
                    map[slot] = { enabled: c?.enabled ?? true, cutoff: c?.cutoffTime ?? "" };
                }
                setSlots(map);
                setSavedSlots(map);
            }
            if (messRes.status === "fulfilled") {
                const current = messRes.value.messes.find((m) => m.isCurrent) ?? messRes.value.messes[0];
                setInviteCode(current?.inviteCode ?? "");
            }
            if (membersRes.status === "fulfilled") {
                setMembers(membersRes.value.members.filter((m) => m.isActive).map((m) => m.name));
            }
            setLoading(false);
        });
    }, [token, user, isAdmin]);

    const index = STEPS.indexOf(step);
    const inviteLink =
        typeof window !== "undefined" && inviteCode ? `${window.location.origin}/${locale}/register?code=${inviteCode}` : "";

    /** Save what this step changed. Returns false to stay on the step. */
    const saveStep = useCallback(async (): Promise<boolean> => {
        if (!token) return false;
        if (step === "mess") {
            const trimmed = name.trim();
            if (!trimmed) {
                toast.error(t("mess.nameRequired"));
                return false;
            }
            const data: { name?: string; timezone?: string } = {};
            if (trimmed !== savedName) data.name = trimmed;
            if (timezone !== savedTimezone) data.timezone = timezone;
            if (Object.keys(data).length === 0) return true;
            await api.admin.updateSettings(data, token);
            setSavedName(trimmed);
            setSavedTimezone(timezone);
            return true;
        }
        if (step === "meals" && slots && savedSlots) {
            if (!SLOTS.some((s) => slots[s].enabled)) {
                toast.error(t("meals.atLeastOne"));
                return false;
            }
            for (const slot of SLOTS) {
                const now = slots[slot];
                const before = savedSlots[slot];
                if (now.enabled === before.enabled && now.cutoff === before.cutoff) continue;
                await api.mealConfigs.update(
                    { mealType: slot, enabled: now.enabled, ...(now.cutoff ? { cutoffTime: now.cutoff } : {}) },
                    token,
                );
            }
            setSavedSlots(slots);
            return true;
        }
        return true;
    }, [token, step, name, savedName, timezone, savedTimezone, slots, savedSlots, t]);

    async function next() {
        setSaving(true);
        try {
            if (await saveStep()) setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("saveFailed"));
        } finally {
            setSaving(false);
        }
    }

    async function addMember(e: React.FormEvent) {
        e.preventDefault();
        const n = newName.trim();
        if (!token || !n) return;
        setAdding(true);
        try {
            const res = await api.members.add(n, token);
            setMembers((prev) => [...prev, res.name]);
            setNewName("");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("people.addFailed"));
        } finally {
            setAdding(false);
        }
    }

    async function shareInvite() {
        if (!inviteLink) return;
        const text = t("people.shareText", { mess: savedName || name, link: inviteLink });
        try {
            if (navigator.share) {
                await navigator.share({ title: savedName || name, text });
                return;
            }
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* closed the share sheet */
        }
    }

    async function copyInvite() {
        if (!inviteLink) return;
        await navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    if (!loading && !isAdmin) {
        return (
            <div className={styles.page}>
                <div className={styles.card}>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.lead}>{t("adminOnly")}</p>
                    <Link href={`/${locale}/overview`} className={styles.textLink}>{t("toOverview")}</Link>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <p className={styles.eyebrow}>{t("eyebrow", { n: new Intl.NumberFormat(locale).format(index + 1), total: new Intl.NumberFormat(locale).format(STEPS.length) })}</p>
                <h2 className={styles.title}>{t(`${step}.title`)}</h2>
                <p className={styles.lead}>{t(`${step}.lead`)}</p>
                <ol className={styles.progress} aria-label={t("progress")}>
                    {STEPS.map((s, i) => (
                        <li
                            key={s}
                            className={cn(styles.dot, i < index && styles.dotDone, i === index && styles.dotNow)}
                            aria-current={i === index ? "step" : undefined}
                        >
                            <span className="sr-only">{t(`${s}.title`)}</span>
                        </li>
                    ))}
                </ol>
            </header>

            <section className={styles.card} aria-busy={loading}>
                {loading ? (
                    <div className={styles.skeleton} />
                ) : step === "mess" ? (
                    <div className={styles.fields}>
                        <label className={styles.field}>
                            <span className={styles.label}>{t("mess.name")}</span>
                            <input
                                className={styles.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={80}
                                autoComplete="off"
                            />
                        </label>
                        <div className={styles.field}>
                            <span className={styles.label} id="tz-label">{t("mess.timezone")}</span>
                            <Select value={timezone} onChange={setTimezone} options={timezoneOptions} aria-label={t("mess.timezone")} />
                            <span className={styles.help}>{t("mess.timezoneHelp")}</span>
                        </div>
                    </div>
                ) : step === "meals" && slots ? (
                    <div className={styles.slots}>
                        {SLOTS.map((slot) => (
                            <div key={slot} className={cn(styles.slot, !slots[slot].enabled && styles.slotOff)}>
                                <label className={styles.slotToggle}>
                                    <input
                                        type="checkbox"
                                        checked={slots[slot].enabled}
                                        onChange={(e) => setSlots({ ...slots, [slot]: { ...slots[slot], enabled: e.target.checked } })}
                                    />
                                    <span className={styles.slotIcon} aria-hidden>{SLOT_ICON[slot]}</span>
                                    <span className={styles.slotName}>{t(`meals.slot.${slot}`)}</span>
                                </label>
                                <div className={styles.slotTime}>
                                    <span className={styles.help}>{t("meals.locksAt")}</span>
                                    <TimePicker
                                        value={slots[slot].cutoff}
                                        onChange={(v) => setSlots({ ...slots, [slot]: { ...slots[slot], cutoff: v } })}
                                        disabled={!slots[slot].enabled}
                                        aria-label={t("meals.locksAtFor", { meal: t(`meals.slot.${slot}`) })}
                                    />
                                </div>
                            </div>
                        ))}
                        <p className={styles.help}>{t("meals.help")}</p>
                    </div>
                ) : step === "people" ? (
                    <div className={styles.fields}>
                        <form className={styles.addRow} onSubmit={addMember}>
                            <input
                                className={styles.input}
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder={t("people.namePlaceholder")}
                                aria-label={t("people.name")}
                                maxLength={60}
                                autoComplete="off"
                            />
                            <Button type="submit" disabled={adding || !newName.trim()}>
                                <UserPlus size={16} /> {t("people.add")}
                            </Button>
                        </form>
                        <p className={styles.help}>{t("people.addHelp")}</p>
                        {members.length > 0 && (
                            <ul className={styles.memberList} aria-label={t("people.listLabel")}>
                                {members.map((m, i) => (
                                    <li key={`${m}-${i}`}>{m}</li>
                                ))}
                            </ul>
                        )}

                        {inviteLink && (
                            <div className={styles.invite}>
                                <span className={styles.label}>{t("people.inviteTitle")}</span>
                                <p className={styles.help}>{t("people.inviteHelp")}</p>
                                <code className={styles.inviteLink}>{inviteLink}</code>
                                <div className={styles.inviteActions}>
                                    <Button type="button" onClick={shareInvite}>
                                        <Share2 size={16} /> {t("people.share")}
                                    </Button>
                                    <Button type="button" variant="secondary" onClick={copyInvite}>
                                        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t("people.copied") : t("people.copy")}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={styles.fields}>
                        <ul className={styles.summary}>
                            <li><Check size={16} /> {t("done.mess", { name: savedName })}</li>
                            <li><Check size={16} /> {t("done.timezone", { tz: savedTimezone.replace(/_/g, " ") })}</li>
                            <li><Check size={16} /> {t("done.members", { n: members.length })}</li>
                        </ul>
                        <div className={styles.install}>
                            <span className={styles.label}>{t("done.installTitle")}</span>
                            {installed ? (
                                <p className={styles.help}>{t("done.installed")}</p>
                            ) : installable ? (
                                <>
                                    <p className={styles.help}>{t("done.installHelp")}</p>
                                    <Button type="button" onClick={() => void promptInstall()}>
                                        <Download size={16} /> {t("done.install")}
                                    </Button>
                                </>
                            ) : (
                                <p className={styles.help}>{t("done.installManual")}</p>
                            )}
                        </div>
                    </div>
                )}
            </section>

            <nav className={styles.nav} aria-label={t("progress")}>
                {index > 0 ? (
                    <Button type="button" variant="secondary" onClick={() => setStep(STEPS[index - 1])} disabled={saving}>
                        <ChevronLeft size={16} /> {t("back")}
                    </Button>
                ) : (
                    <Link href={`/${locale}/overview`} className={styles.textLink}>{t("later")}</Link>
                )}
                {step === "done" ? (
                    <Button type="button" onClick={() => router.push(`/${locale}/overview`)}>
                        {t("finish")} <ChevronRight size={16} />
                    </Button>
                ) : (
                    <Button type="button" onClick={next} disabled={saving || loading}>
                        {saving ? t("saving") : step === "people" ? t("next") : t("saveNext")} <ChevronRight size={16} />
                    </Button>
                )}
            </nav>
        </div>
    );
}
