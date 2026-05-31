"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Copy, Check, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import styles from "./create.module.css";

export default function CreateMessPage() {
    const t = useTranslations("createMess");
    const { token, user, login } = useAuth();
    const router = useRouter();
    const locale = useLocale();

    const [name, setName] = useState("");
    const [budget, setBudget] = useState("");
    const [cutOffTime, setCutOffTime] = useState("21:00");
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState<{ inviteCode: string; name: string } | null>(null);
    const [copied, setCopied] = useState(false);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!token || !user) return;
        setCreating(true);
        try {
            const res = await api.mess.create(
                {
                    name: name.trim(),
                    estimatedMonthlyBudget: budget ? parseFloat(budget) : undefined,
                    cutOffTime,
                },
                token
            );
            setCreated({ inviteCode: res.inviteCode, name: res.name });
            toast.success(t("inviteReady"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create mess");
        } finally {
            setCreating(false);
        }
    }

    async function handleCopy() {
        if (!created) return;
        await navigator.clipboard.writeText(created.inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function handleGoToDashboard() {
        // Reload to pick up the new mess from the server
        window.location.href = `/${locale}/overview`;
    }

    if (created) {
        return (
            <div className={styles.page}>
                <Card className={styles.card}>
                    <div className={styles.successIcon}>
                        <Plus size={28} color="white" />
                    </div>
                    <h2 className={styles.title}>{t("inviteReady")}</h2>
                    <p className={styles.subtitle}>{created.name}</p>
                    <p className={styles.inviteLabel}>{t("inviteLabel")}</p>
                    <div className={styles.codeBox}>
                        <span className={styles.codeText}>{created.inviteCode}</span>
                        <Button variant="secondary" size="small" type="button" onClick={handleCopy}>
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? "Copied!" : "Copy"}
                        </Button>
                    </div>
                    <div className={styles.actions}>
                        <Button onClick={handleGoToDashboard}>{t("goToDashboard")}</Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle")}</p>
            </div>

            <Card className={styles.card}>
                <form className={styles.form} onSubmit={handleCreate}>
                    <div className={styles.field}>
                        <label className={styles.label}>{t("name")}</label>
                        <input
                            className={styles.input}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t("namePlaceholder")}
                            required
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>{t("budget")}</label>
                        <input
                            className={styles.input}
                            type="number"
                            min="0"
                            value={budget}
                            onChange={(e) => setBudget(e.target.value)}
                            placeholder={t("budgetPlaceholder")}
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
                    </div>

                    <div className={styles.actions}>
                        <Button type="submit" disabled={creating || !name.trim()}>
                            <Plus size={16} />
                            {creating ? t("creating") : t("create")}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
