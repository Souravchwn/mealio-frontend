"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import styles from "../auth.module.css";

export default function LoginPage() {
    const t = useTranslations("auth.login");
    const tc = useTranslations("common");
    const locale = useLocale();
    const router = useRouter();
    const { login } = useAuth();

    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await api.auth.login({ email, password });

            // Use auth context to store user and token
            login(response.user, response.accessToken);

            toast.success(t("success") || "Logged in successfully!");
            // Redirect to dashboard
            router.push(`/${locale}/overview`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error") || "Login failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            {/* Left visual panel */}
            <div className={styles.visual}>
                <div className={styles.visualContent}>
                    <div className={styles.visualLogo}>🍽</div>
                    <h2 className={styles.visualTitle}>
                        {tc("appName")}
                    </h2>
                    <p className={styles.visualDesc}>
                        {tc("tagline")}
                    </p>
                </div>
            </div>

            {/* Right form panel */}
            <div className={styles.formSide}>
                <div className={styles.switcherWrap} style={{ display: 'flex', gap: '0.5rem' }}>
                    <ThemeToggle />
                    <LocaleSwitcher />
                </div>

                <div className={styles.formContainer}>
                    {/* Brand logo — visible only on mobile when visual panel is hidden */}
                    <div className={styles.mobileBrand}>
                        <div className={styles.mobileLogo}>🍽</div>
                        <span className={styles.mobileBrandName}>{tc("appName")}</span>
                    </div>

                    <Link href={`/${locale}`} className={styles.backLink}>
                        <ArrowLeft size={16} />
                        {tc("back")}
                    </Link>

                    <h1 className={styles.title}>{t("title")}</h1>
                    <p className={styles.subtitle}>{t("subtitle")}</p>

                    <form className={styles.form} onSubmit={handleLogin}>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="email">
                                {t("email")}
                            </label>
                            <input
                                className={styles.input}
                                id="email"
                                type="email"
                                placeholder="name@example.com"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="password">
                                {t("password")}
                            </label>
                            <input
                                className={styles.input}
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <Link href="#" className={styles.forgotLink}>
                                {t("forgotPassword")}
                            </Link>
                        </div>

                        <div className={styles.submitBtn}>
                            <Button type="submit" size="large" fullWidth disabled={isLoading}>
                                {isLoading ? tc("loading") || "Submitting..." : t("submit")}
                            </Button>
                        </div>
                    </form>

                    <p className={styles.switchAuth}>
                        {t("noAccount")}
                        <Link href={`/${locale}/register`} className={styles.switchLink}>
                            {t("register")}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
