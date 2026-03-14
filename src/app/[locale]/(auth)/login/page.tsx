"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { ArrowLeft, Utensils } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import styles from "../auth.module.css";

export default function LoginPage() {
    const t = useTranslations("auth.login");
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
                            />
                            <Link href="#" className={styles.forgotLink}>
                                {t("forgotPassword")}
                            </Link>
                        </div>

                        <div className={styles.submitBtn}>
                            <Button type="submit" size="large" fullWidth>
                                {t("submit")}
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
