"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../auth.module.css";

export default function RegisterPage() {
    const t = useTranslations("auth.register");
    const tc = useTranslations("common");
    const locale = useLocale();
    const router = useRouter();
    const { login } = useAuth();

    // Form state
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [messInviteCode, setMessInviteCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error(t("passwordMismatch") || "Passwords do not match");
            return;
        }

        setIsLoading(true);

        try {
            const response = await api.auth.register({
                name,
                email,
                phone,
                password,
                messInviteCode
            });

            login(response.user, response.accessToken);

            toast.success(t("success") || "Account created successfully!");
            router.push(`/${locale}/overview`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error") || "Registration failed");
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

                    <form className={styles.form} onSubmit={handleRegister}>
                        <div className={styles.row}>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="name">
                                    {t("name")}
                                </label>
                                <input
                                    className={styles.input}
                                    id="name"
                                    type="text"
                                    placeholder="John Doe"
                                    autoComplete="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="phone">
                                    {t("phone")}
                                </label>
                                <input
                                    className={styles.input}
                                    id="phone"
                                    type="tel"
                                    placeholder="+880 1XXX XXXXXX"
                                    autoComplete="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="reg-email">
                                {t("email")}
                            </label>
                            <input
                                className={styles.input}
                                id="reg-email"
                                type="email"
                                placeholder="name@example.com"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.row}>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="reg-password">
                                    {t("password")}
                                </label>
                                <input
                                    className={styles.input}
                                    id="reg-password"
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="confirm-password">
                                    {t("confirmPassword")}
                                </label>
                                <input
                                    className={styles.input}
                                    id="confirm-password"
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={8}
                                />
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="mess-code">
                                {t("messCode")}
                            </label>
                            <input
                                className={styles.input}
                                id="mess-code"
                                type="text"
                                placeholder="MESS-XXXX"
                                value={messInviteCode}
                                onChange={(e) => setMessInviteCode(e.target.value)}
                                required
                            />
                            <span
                                style={{
                                    fontSize: "var(--text-xs)",
                                    color: "var(--color-text-muted)",
                                }}
                            >
                                {t("messCodeHelp")}
                            </span>
                        </div>

                        <div className={styles.submitBtn}>
                            <Button type="submit" size="large" fullWidth disabled={isLoading}>
                                {isLoading ? tc("loading") || "Submitting..." : t("submit")}
                            </Button>
                        </div>
                    </form>

                    <p className={styles.switchAuth}>
                        {t("hasAccount")}
                        <Link href={`/${locale}/login`} className={styles.switchLink}>
                            {t("login")}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
