"use client";

import { Suspense, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api } from "@/lib/api";
import { AuthShell, PasswordInput } from "../AuthShell";
import styles from "../auth.module.css";

export default function ResetPasswordPage() {
    return (
        <Suspense>
            <ResetForm />
        </Suspense>
    );
}

/**
 * Two ways in: a link from the reset email (?token=...), or the email address
 * plus an 8-character code that a mess admin or Mealtill support gave out.
 */
function ResetForm() {
    const t = useTranslations("auth.reset");
    const tr = useTranslations("auth.register");
    const tc = useTranslations("common");
    const locale = useLocale();
    const router = useRouter();
    const searchParams = useSearchParams();
    const linkToken = searchParams.get("token") ?? "";

    const [email, setEmail] = useState(searchParams.get("email") ?? "");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error(tr("passwordMismatch"));
            return;
        }
        setIsLoading(true);
        try {
            await api.auth.reset(linkToken ? { token: linkToken, password } : { email: email.trim(), code: code.trim(), password });
            toast.success(t("success"));
            router.push(`/${locale}/login`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : tc("error"));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell
            title={t("title")}
            subtitle={linkToken ? t("subtitleLink") : t("subtitleCode")}
            footer={
                <Link href={`/${locale}/login`} className={styles.switchLink}>
                    {t("backToLogin")}
                </Link>
            }
        >
            <form className={styles.form} onSubmit={handleSubmit}>
                {!linkToken && (
                    <>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="reset-email">{t("email")}</label>
                            <input
                                className={styles.input}
                                id="reset-email"
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="reset-code">{t("code")}</label>
                            <span className={styles.codeWrap}>
                                <KeyRound size={18} className={styles.codeIcon} />
                                <input
                                    className={`${styles.input} ${styles.codeInput}`}
                                    id="reset-code"
                                    type="text"
                                    placeholder="XXXXXXXX"
                                    autoCapitalize="characters"
                                    autoComplete="one-time-code"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                                    required
                                />
                            </span>
                            <span className={styles.help}>{t("codeHelp")}</span>
                        </div>
                    </>
                )}

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="new-password">{t("newPassword")}</label>
                    <PasswordInput
                        id="new-password"
                        placeholder="••••••••"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="new-password-2">{tr("confirmPassword")}</label>
                    <PasswordInput
                        id="new-password-2"
                        placeholder="••••••••"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        aria-invalid={mismatch}
                    />
                    {mismatch && <span className={styles.error} role="alert">{tr("passwordMismatch")}</span>}
                </div>

                <Button type="submit" size="large" fullWidth loading={isLoading} className={styles.submitBtn}>
                    {isLoading ? tc("loading") : t("submit")}
                    {!isLoading && <ArrowRight size={18} />}
                </Button>
                <p className={styles.legal}>{t("signedOutNote")}</p>
            </form>
        </AuthShell>
    );
}
