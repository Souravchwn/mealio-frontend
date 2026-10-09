"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, KeyRound, LifeBuoy, ShieldCheck, Trash2, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordInput } from "../../(auth)/AuthShell";
import styles from "./settings.module.css";

/** Everyone's own account: password, data export, account deletion, help. */
export function AccountSection() {
    const t = useTranslations("settings.account");
    const locale = useLocale();
    const router = useRouter();
    const { user, token, login, logout } = useAuth();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [changing, setChanging] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleting, setDeleting] = useState(false);

    async function changePassword(e: React.FormEvent) {
        e.preventDefault();
        if (!token || !user) return;
        setChanging(true);
        try {
            const res = await api.me.changePassword({ currentPassword, newPassword }, token);
            // Older sessions stop working; keep this one alive with the fresh token
            login(user, res.accessToken);
            setCurrentPassword("");
            setNewPassword("");
            toast.success(t("passwordChanged"));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("failed"));
        } finally {
            setChanging(false);
        }
    }

    async function exportData() {
        if (!token) return;
        setExporting(true);
        try {
            const blob = await api.me.exportData(token);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `mealtill-my-data-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("failed"));
        } finally {
            setExporting(false);
        }
    }

    async function deleteAccount(e: React.FormEvent) {
        e.preventDefault();
        if (!token) return;
        setDeleting(true);
        try {
            await api.me.deleteAccount(deletePassword, token);
            toast.success(t("deleted"));
            logout();
            router.replace(`/${locale}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("failed"));
            setDeleting(false);
        }
    }

    return (
        <>
            <Card>
                <h3 className={styles.sectionTitle}>
                    <KeyRound size={18} />
                    {t("passwordTitle")}
                </h3>
                <form className={styles.form} onSubmit={changePassword}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="cur-pw">{t("currentPassword")}</label>
                        <PasswordInput
                            id="cur-pw"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="new-pw">{t("newPassword")}</label>
                        <PasswordInput
                            id="new-pw"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={8}
                        />
                        <span className={styles.helpText}>{t("passwordHelp")}</span>
                    </div>
                    <div className={styles.formActions}>
                        <Button type="submit" loading={changing} disabled={!currentPassword || newPassword.length < 8}>
                            {t("changePassword")}
                        </Button>
                    </div>
                </form>
            </Card>

            <Card>
                <h3 className={styles.sectionTitle}>
                    <ShieldCheck size={18} />
                    {t("privacyTitle")}
                </h3>
                <p className={styles.helpText}>{t("privacyHelp")}</p>
                <div className={styles.linkList}>
                    <button type="button" className={styles.linkRow} onClick={() => void exportData()} disabled={exporting}>
                        <Download size={18} />
                        <span>
                            <span className={styles.optionTitle}>{t("export")}</span>
                            <span className={styles.optionDesc}>{t("exportHelp")}</span>
                        </span>
                        <ChevronRight size={18} />
                    </button>
                    <Link href={`/${locale}/support`} className={styles.linkRow}>
                        <LifeBuoy size={18} />
                        <span>
                            <span className={styles.optionTitle}>{t("support")}</span>
                            <span className={styles.optionDesc}>{t("supportHelp")}</span>
                        </span>
                        <ChevronRight size={18} />
                    </Link>
                    <Link href={`/${locale}/privacy`} className={styles.linkRow}>
                        <ShieldCheck size={18} />
                        <span>
                            <span className={styles.optionTitle}>{t("privacyPolicy")}</span>
                        </span>
                        <ChevronRight size={18} />
                    </Link>
                </div>
            </Card>

            <Card className={styles.dangerCard}>
                <div className={styles.dangerHeader}>
                    <AlertTriangle size={20} />
                    <h3>{t("deleteTitle")}</h3>
                </div>
                <p className={styles.dangerDesc}>{t("deleteHelp")}</p>
                {deleteOpen ? (
                    <form className={styles.form} onSubmit={deleteAccount}>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="del-pw">{t("confirmWithPassword")}</label>
                            <PasswordInput
                                id="del-pw"
                                autoComplete="current-password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className={styles.formActions}>
                            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
                                {t("cancel")}
                            </Button>
                            <Button type="submit" variant="danger" loading={deleting} disabled={!deletePassword}>
                                <Trash2 size={16} /> {t("deleteForever")}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <Button variant="danger" size="small" onClick={() => setDeleteOpen(true)}>
                        <Trash2 size={16} /> {t("deleteButton")}
                    </Button>
                )}
            </Card>
        </>
    );
}

/** Admin only: soft-delete the whole mess after typing its name and the password. */
export function DeleteMessCard({ messName }: { messName: string }) {
    const t = useTranslations("settings.deleteMess");
    const locale = useLocale();
    const router = useRouter();
    const { token, logout } = useAuth();

    const [open, setOpen] = useState(false);
    const [confirmName, setConfirmName] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!token) return;
        setBusy(true);
        try {
            await api.mess.deleteMess({ confirmName, password }, token);
            toast.success(t("done"));
            logout();
            router.replace(`/${locale}/login`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("failed"));
            setBusy(false);
        }
    }

    return (
        <Card className={styles.dangerCard}>
            <div className={styles.dangerHeader}>
                <AlertTriangle size={20} />
                <h3>{t("title")}</h3>
            </div>
            <p className={styles.dangerDesc}>{t("description")}</p>
            {open ? (
                <form className={styles.form} onSubmit={submit}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="del-mess-name">
                            {t.rich("typeName", { name: messName, b: (c) => <b>{c}</b> })}
                        </label>
                        <input
                            id="del-mess-name"
                            className={styles.input}
                            value={confirmName}
                            onChange={(e) => setConfirmName(e.target.value)}
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="del-mess-pw">{t("password")}</label>
                        <PasswordInput
                            id="del-mess-pw"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className={styles.formActions}>
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                            {t("cancel")}
                        </Button>
                        <Button
                            type="submit"
                            variant="danger"
                            loading={busy}
                            disabled={confirmName.trim() !== messName.trim() || !password}
                        >
                            <Trash2 size={16} /> {t("confirm")}
                        </Button>
                    </div>
                </form>
            ) : (
                <Button variant="danger" size="small" onClick={() => setOpen(true)}>
                    <Trash2 size={16} /> {t("button")}
                </Button>
            )}
        </Card>
    );
}
