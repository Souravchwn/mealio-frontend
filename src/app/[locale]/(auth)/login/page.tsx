"use client";

import { Suspense, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell, PasswordInput } from "../AuthShell";
import styles from "../auth.module.css";

/** Account states the server reports with a code. They get a calm explanation instead of a red toast. */
const NOTICE_CODES = ["PENDING_APPROVAL", "JOIN_REJECTED", "ACCOUNT_INACTIVE", "NO_MESS", "MESS_DELETED", "MESS_SUSPENDED"] as const;
type NoticeCode = (typeof NOTICE_CODES)[number];

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}

function LoginForm() {
    const t = useTranslations("auth.login");
    const tc = useTranslations("common");
    const locale = useLocale();
    const router = useRouter();
    const { login, isAuthenticated } = useAuth();
    const searchParams = useSearchParams();

    // Only follow ?next= when it stays inside this site and this language
    const rawNext = searchParams.get("next") ?? "";
    const target = rawNext.startsWith(`/${locale}/`) && !rawNext.startsWith("//") ? rawNext : `/${locale}/overview`;

    // Already signed in: there is nothing to do here
    useEffect(() => {
        if (isAuthenticated) router.replace(target);
    }, [isAuthenticated, target, router]);

    const [expired] = useState(() => {
        try {
            const flag = sessionStorage.getItem("mealio.sessionExpired") === "1";
            sessionStorage.removeItem("mealio.sessionExpired");
            return flag;
        } catch {
            return false;
        }
    });

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [notice, setNotice] = useState<NoticeCode | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setNotice(null);
        try {
            const response = await api.auth.login({ email, password });
            login(response.user, response.accessToken);
            toast.success(t("success"));
            router.replace(target);
        } catch (error) {
            if (error instanceof ApiError && NOTICE_CODES.includes(error.code as NoticeCode)) {
                setNotice(error.code as NoticeCode);
            } else {
                toast.error(error instanceof Error ? error.message : t("error"));
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell
            title={t("title")}
            subtitle={t("subtitle")}
            footer={
                <>
                    {t("noAccount")}{" "}
                    <Link href={`/${locale}/register`} className={styles.switchLink}>
                        {t("register")}
                    </Link>
                </>
            }
        >
            <form className={styles.form} onSubmit={handleLogin}>
                {expired && !notice && (
                    <div className={styles.notice} role="status">
                        <Info size={18} />
                        <div>
                            <b>{t("sessionExpired.title")}</b>
                            <p>{t("sessionExpired.body")}</p>
                        </div>
                    </div>
                )}

                {notice && (
                    <div className={styles.notice} role="status">
                        <Info size={18} />
                        <div>
                            <b>{t(`notice.${notice}.title`)}</b>
                            <p>{t(`notice.${notice}.body`)}</p>
                            {notice !== "PENDING_APPROVAL" && (
                                <Link href={`/${locale}/support`} className={styles.switchLink}>
                                    {t("contactSupport")}
                                </Link>
                            )}
                        </div>
                    </div>
                )}

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="email">{t("email")}</label>
                    <input
                        className={styles.input}
                        id="email"
                        type="email"
                        inputMode="email"
                        placeholder="name@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>

                <div className={styles.field}>
                    <div className={styles.labelRow}>
                        <label className={styles.label} htmlFor="password">{t("password")}</label>
                        <Link href={`/${locale}/forgot-password`} className={styles.smallLink}>
                            {t("forgotPassword")}
                        </Link>
                    </div>
                    <PasswordInput
                        id="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>

                <Button type="submit" size="large" fullWidth loading={isLoading} className={styles.submitBtn}>
                    {isLoading ? tc("loading") : t("submit")}
                    {!isLoading && <ArrowRight size={18} />}
                </Button>

                <p className={styles.legal}>
                    {t("troubleSigningIn")}{" "}
                    <Link href={`/${locale}/support`}>{t("contactSupport")}</Link>
                </p>
            </form>
        </AuthShell>
    );
}
