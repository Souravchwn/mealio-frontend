"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Info, KeyRound, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api } from "@/lib/api";
import { AuthShell } from "../AuthShell";
import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
    const t = useTranslations("auth.forgot");
    const tc = useTranslations("common");
    const locale = useLocale();

    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    // null = form; true = a link was emailed; false = email is not set up, use an admin code
    const [emailSent, setEmailSent] = useState<boolean | null>(null);

    const resetHref = `/${locale}/reset-password?email=${encodeURIComponent(email.trim())}`;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await api.auth.forgot(email.trim(), locale);
            setEmailSent(res.emailEnabled);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : tc("error"));
        } finally {
            setIsLoading(false);
        }
    };

    const footer = (
        <Link href={`/${locale}/login`} className={styles.switchLink}>
            {t("backToLogin")}
        </Link>
    );

    if (emailSent !== null) {
        return (
            <AuthShell title={emailSent ? t("sentTitle") : t("codeTitle")} subtitle={emailSent ? t("sentSubtitle") : t("codeSubtitle")} footer={footer}>
                <div className={styles.stateCard}>
                    <span className={styles.stateIcon}>{emailSent ? <MailCheck size={26} /> : <KeyRound size={26} />}</span>
                    <p>{emailSent ? t("sentBody", { email: email.trim() }) : t("codeBody")}</p>
                </div>
                {emailSent && (
                    <div className={styles.notice} role="note">
                        <Info size={18} />
                        <div>
                            <b>{t("spamTitle")}</b>
                            <p>{t("spamBody")}</p>
                        </div>
                    </div>
                )}
                <Link href={resetHref} className={styles.secondaryAction}>
                    {t("haveCode")} <ArrowRight size={16} />
                </Link>
            </AuthShell>
        );
    }

    return (
        <AuthShell title={t("title")} subtitle={t("subtitle")} footer={footer}>
            <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="forgot-email">{t("email")}</label>
                    <input
                        className={styles.input}
                        id="forgot-email"
                        type="email"
                        inputMode="email"
                        placeholder="name@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <Button type="submit" size="large" fullWidth loading={isLoading} className={styles.submitBtn}>
                    {isLoading ? tc("loading") : t("submit")}
                    {!isLoading && <ArrowRight size={18} />}
                </Button>
                <Link href={resetHref} className={styles.secondaryAction}>
                    {t("haveCode")} <ArrowRight size={16} />
                </Link>
            </form>
        </AuthShell>
    );
}
