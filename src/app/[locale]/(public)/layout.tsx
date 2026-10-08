"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Utensils } from "lucide-react";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./public.module.css";

/** Light shell for pages anyone can open: support, privacy, terms. */
export default function PublicLayout({ children }: { children: ReactNode }) {
    const locale = useLocale();
    const tc = useTranslations("common");
    const tp = useTranslations("public");
    const { isAuthenticated } = useAuth();

    return (
        <div className={styles.shell}>
            <header className={styles.topbar}>
                <Link href={`/${locale}${isAuthenticated ? "/overview" : ""}`} className={styles.brand}>
                    <span className={styles.brandMark}><Utensils size={18} /></span>
                    {tc("appName")}
                </Link>
                <div className={styles.topActions}>
                    <LocaleSwitcher />
                    <ThemeToggle />
                    <Link href={`/${locale}/${isAuthenticated ? "overview" : "login"}`} className={styles.topCta}>
                        {isAuthenticated ? tp("openApp") : tp("signIn")}
                    </Link>
                </div>
            </header>
            <main className={styles.main}>{children}</main>
            <footer className={styles.footer}>
                <Link href={`/${locale}/support`}>{tp("support")}</Link>
                <Link href={`/${locale}/privacy`}>{tp("privacy")}</Link>
                <Link href={`/${locale}/terms`}>{tp("terms")}</Link>
                <span>© {new Date().getFullYear()} {tc("appName")}</span>
            </footer>
        </div>
    );
}
