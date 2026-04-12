"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Save, AlertTriangle, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import styles from "./settings.module.css";

export default function SettingsPage() {
    const t = useTranslations("settings");
    const { user, token } = useAuth();

    const [name, setName] = useState("");
    const [cutOffTime, setCutOffTime] = useState("21:00");
    const [budget, setBudget] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!user || !token) return;
        api.mess.list(token).then((data) => {
            const current = data.messes.find((m) => m.isCurrent);
            if (current) {
                setName(current.name);
                setCutOffTime(current.cutOffTime);
                setInviteCode(current.inviteCode);
            }
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

    return (
        <div className={styles.page}>
            <div>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle")}</p>
            </div>

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

                    <div className={styles.field}>
                        <label className={styles.label}>{t("inviteCode")}</label>
                        <div className={styles.codeRow}>
                            <input
                                className={styles.input}
                                type="text"
                                value={inviteCode}
                                readOnly
                            />
                            <Button variant="secondary" size="small" type="button" onClick={handleCopyInvite}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        <Button type="submit" disabled={saving}>
                            <Save size={16} />
                            {saving ? "Saving…" : t("saveChanges")}
                        </Button>
                    </div>
                </form>
            </Card>

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
        </div>
    );
}
