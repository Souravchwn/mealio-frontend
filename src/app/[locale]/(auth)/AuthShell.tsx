"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Eye, EyeOff, Utensils } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import styles from "./auth.module.css";

/** Split auth layout: ink brand panel with one page of the khata + form side. */
export function AuthShell({ title, subtitle, children, footer }: {
    title: string;
    subtitle: string;
    children: ReactNode;
    footer: ReactNode;
}) {
    const locale = useLocale();
    const tc = useTranslations("common");
    const ta = useTranslations("auth.shell");
    const { isAuthenticated } = useAuth();

    return (
        <div className={styles.page}>
            {/* Brand panel — a band on phones, a full side panel on desktop */}
            <aside className={styles.visual}>
                <div className={styles.visualTop}>
                    <Link href={`/${locale}${isAuthenticated ? "/overview" : ""}`} className={styles.backLink} aria-label={tc("back")}>
                        <ArrowLeft size={18} />
                    </Link>
                    <div className={styles.prefs}>
                        <LocaleSwitcher />
                        <ThemeToggle />
                    </div>
                </div>

                <div className={styles.brandBlock}>
                    <span className={styles.brandMark}>
                        <Utensils size={26} />
                    </span>
                    <h2 className={styles.brandName}>{tc("appName")}</h2>
                    <p className={styles.brandTagline}>{ta("tagline")}</p>
                </div>

                {/* One page of the month's khata: what Mealtill works out for the mess */}
                <div className={styles.ledger} aria-hidden>
                    <p className={styles.ledgerTitle}>{ta("ledgerTitle")}</p>
                    <div className={styles.ledgerRows}>
                        <p className={styles.ledgerRow}><span>{ta("ledgerBazaar")}</span><span>৳ 18,420</span></p>
                        <p className={styles.ledgerRow}><span>{ta("ledgerMeals")}</span><span>432</span></p>
                    </div>
                    <p className={styles.ledgerRate}><span>{ta("ledgerRate")}</span><span>৳ 42.64</span></p>
                    <p className={styles.ledgerNote}>{ta("ledgerNote")}</p>
                </div>
            </aside>

            {/* Form */}
            <main className={styles.formSide}>
                <div className={styles.formContainer}>
                    <h1 className={styles.title}>{title}</h1>
                    <p className={styles.subtitle}>{subtitle}</p>
                    {children}
                    <p className={styles.switchAuth}>{footer}</p>
                </div>
            </main>
        </div>
    );
}

/** Password input with a show / hide toggle. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
    const ta = useTranslations("auth.shell");
    const [visible, setVisible] = useState(false);
    return (
        <span className={styles.passwordWrap}>
            <input {...props} type={visible ? "text" : "password"} className={styles.input} />
            <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? ta("hidePassword") : ta("showPassword")}
            >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
        </span>
    );
}
