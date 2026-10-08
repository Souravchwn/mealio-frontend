"use client";

import { Suspense, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Hourglass, Sparkles, Ticket, Utensils } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell, PasswordInput } from "../AuthShell";
import styles from "../auth.module.css";

type Mode = "create" | "join";

export default function RegisterPage() {
    return (
        <Suspense>
            <RegisterForm />
        </Suspense>
    );
}

function RegisterForm() {
    const t = useTranslations("auth.register");
    const tc = useTranslations("common");
    const locale = useLocale();
    const router = useRouter();
    const { login, isAuthenticated } = useAuth();
    // Invite links look like /register?code=MESS-XXXXXXXX and open on the join tab
    const searchParams = useSearchParams();
    const linkCode = (searchParams.get("code") ?? "").toUpperCase();

    // Signed in already: go to the app, unless this is someone else's invite link
    useEffect(() => {
        if (isAuthenticated && !linkCode) router.replace(`/${locale}/overview`);
    }, [isAuthenticated, linkCode, router, locale]);

    const [mode, setMode] = useState<Mode>(linkCode ? "join" : "create");
    const [messName, setMessName] = useState("");
    const [messInviteCode, setMessInviteCode] = useState(linkCode);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [pendingMess, setPendingMess] = useState<string | null>(null);

    const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error(t("passwordMismatch"));
            return;
        }
        setIsLoading(true);
        try {
            const response = await api.auth.register({
                mode,
                name,
                email,
                phone,
                password,
                locale,
                ...(mode === "create" ? { messName } : { messInviteCode }),
            });
            if (response.pending) {
                setPendingMess(response.messName);
                return;
            }
            login(response.user, response.accessToken);
            toast.success(mode === "create" ? t("createdMess") : t("success"));
            router.push(`/${locale}/overview`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error"));
        } finally {
            setIsLoading(false);
        }
    };

    if (pendingMess) {
        return (
            <AuthShell
                title={t("pendingTitle")}
                subtitle={t("pendingSubtitle", { mess: pendingMess })}
                footer={
                    <Link href={`/${locale}/login`} className={styles.switchLink}>
                        {t("login")}
                    </Link>
                }
            >
                <div className={styles.stateCard}>
                    <span className={styles.stateIcon}><Hourglass size={26} /></span>
                    <p>{t("pendingBody")}</p>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title={mode === "create" ? t("titleCreate") : t("title")}
            subtitle={mode === "create" ? t("subtitleCreate") : t("subtitle")}
            footer={
                <>
                    {t("hasAccount")}{" "}
                    <Link href={`/${locale}/login`} className={styles.switchLink}>
                        {t("login")}
                    </Link>
                </>
            }
        >
            <div className={styles.modeTabs} role="tablist" aria-label={t("modeLabel")}>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "create"}
                    className={styles.modeTab}
                    onClick={() => setMode("create")}
                >
                    <Sparkles size={16} /> {t("modeCreate")}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "join"}
                    className={styles.modeTab}
                    onClick={() => setMode("join")}
                >
                    <Ticket size={16} /> {t("modeJoin")}
                </button>
            </div>

            <form className={styles.form} onSubmit={handleRegister}>
                {mode === "create" ? (
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="mess-name">{t("messName")}</label>
                        <span className={styles.codeWrap}>
                            <Utensils size={18} className={styles.codeIcon} />
                            <input
                                className={`${styles.input} ${styles.iconInput}`}
                                id="mess-name"
                                type="text"
                                placeholder={t("messNamePlaceholder")}
                                autoComplete="off"
                                maxLength={80}
                                value={messName}
                                onChange={(e) => setMessName(e.target.value)}
                                required
                            />
                        </span>
                        <span className={styles.help}>{t("messNameHelp")}</span>
                    </div>
                ) : (
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="mess-code">{t("messCode")}</label>
                        <span className={styles.codeWrap}>
                            <Ticket size={18} className={styles.codeIcon} />
                            <input
                                className={`${styles.input} ${styles.codeInput}`}
                                id="mess-code"
                                type="text"
                                placeholder="MESS-XXXXXXXX"
                                autoCapitalize="characters"
                                autoComplete="off"
                                value={messInviteCode}
                                onChange={(e) => setMessInviteCode(e.target.value.toUpperCase())}
                                required
                            />
                        </span>
                        <span className={styles.help}>{t("messCodeHelp")}</span>
                    </div>
                )}

                <div className={styles.row}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="name">{t("name")}</label>
                        <input
                            className={styles.input}
                            id="name"
                            type="text"
                            autoComplete="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="phone">{t("phone")}</label>
                        <input
                            className={styles.input}
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            placeholder="+880 1XXX XXXXXX"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>
                </div>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="reg-email">{t("email")}</label>
                    <input
                        className={styles.input}
                        id="reg-email"
                        type="email"
                        inputMode="email"
                        placeholder="name@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>

                <div className={styles.row}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="reg-password">{t("password")}</label>
                        <PasswordInput
                            id="reg-password"
                            placeholder="••••••••"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                        />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="confirm-password">{t("confirmPassword")}</label>
                        <PasswordInput
                            id="confirm-password"
                            placeholder="••••••••"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            aria-invalid={mismatch}
                            aria-describedby={mismatch ? "pw-mismatch" : undefined}
                        />
                        {mismatch && (
                            <span id="pw-mismatch" className={styles.error} role="alert">
                                {t("passwordMismatch")}
                            </span>
                        )}
                    </div>
                </div>

                <Button type="submit" size="large" fullWidth loading={isLoading} className={styles.submitBtn}>
                    {isLoading ? tc("loading") : mode === "create" ? t("submitCreate") : t("submit")}
                    {!isLoading && <ArrowRight size={18} />}
                </Button>

                <p className={styles.legal}>
                    {t.rich("legal", {
                        terms: (chunks) => <Link href={`/${locale}/terms`}>{chunks}</Link>,
                        privacy: (chunks) => <Link href={`/${locale}/privacy`}>{chunks}</Link>,
                    })}
                </p>
            </form>
        </AuthShell>
    );
}
