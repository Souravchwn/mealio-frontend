"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import styles from "../auth.module.css";

export default function RegisterPage() {
    const t = useTranslations("auth.register");
    const tc = useTranslations("common");
    const locale = useLocale();

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
                <div className={styles.switcherWrap}>
                    <LocaleSwitcher />
                </div>

                <div className={styles.formContainer}>
                    <Link href={`/${locale}`} className={styles.backLink}>
                        <ArrowLeft size={16} />
                        {tc("back")}
                    </Link>

                    <h1 className={styles.title}>{t("title")}</h1>
                    <p className={styles.subtitle}>{t("subtitle")}</p>

                    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
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
                            <Button type="submit" size="large" fullWidth>
                                {t("submit")}
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
