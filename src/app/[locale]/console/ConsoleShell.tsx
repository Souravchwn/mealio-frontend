"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Building2, Gauge, LifeBuoy, LogOut, ScrollText, ShieldAlert, Users, Utensils } from "lucide-react";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { cn } from "@/lib/utils";
import { useConsoleAuth, useConsoleGuard } from "./ConsoleAuth";
import styles from "./console.module.css";

const NAV = [
    { href: "", label: "Dashboard", icon: Gauge },
    { href: "/messes", label: "Messes", icon: Building2 },
    { href: "/users", label: "Users", icon: Users },
    { href: "/support", label: "Support", icon: LifeBuoy },
    { href: "/security", label: "Security", icon: ShieldAlert },
    { href: "/audit", label: "Audit", icon: ScrollText },
];

/** Console chrome: sidebar on desktop, scrollable tab strip on phones. Staff only, English only. */
export function ConsoleShell({ children }: { children: ReactNode }) {
    const locale = useLocale();
    const pathname = usePathname();
    const router = useRouter();
    const { admin, signOut } = useConsoleAuth();
    const { onLogin, allowed } = useConsoleGuard();
    const base = `/${locale}/console`;

    if (!allowed) return <div className={styles.blank} />;
    if (onLogin) return <>{children}</>;

    const isActive = (href: string) =>
        href === "" ? pathname === base : pathname === base + href || pathname.startsWith(base + href + "/");

    const handleSignOut = () => {
        signOut();
        router.replace(`${base}/login`);
    };

    return (
        <div className={styles.shell}>
            <aside className={styles.sidebar}>
                <Link href={base} className={styles.brand}>
                    <span className={styles.brandMark}><Utensils size={18} /></span>
                    <span>
                        Mealio
                        <small>Console</small>
                    </span>
                </Link>
                <nav className={styles.nav} aria-label="Console">
                    {NAV.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={label}
                            href={base + href}
                            className={cn(styles.navItem, isActive(href) && styles.navItemActive)}
                            aria-current={isActive(href) ? "page" : undefined}
                        >
                            <Icon size={18} />
                            {label}
                        </Link>
                    ))}
                </nav>
                <div className={styles.sidebarFoot}>
                    <span className={styles.adminName}>{admin?.name}</span>
                    <span className={styles.adminEmail}>{admin?.email}</span>
                </div>
            </aside>

            <div className={styles.body}>
                <header className={styles.topbar}>
                    <Link href={base} className={cn(styles.brand, styles.brandCompact)}>
                        <span className={styles.brandMark}><Utensils size={16} /></span>
                        <span>Console</span>
                    </Link>
                    <span className={styles.staffBadge}>Staff only</span>
                    <div className={styles.topActions}>
                        <ThemeToggle />
                        <button type="button" className={styles.iconBtn} onClick={handleSignOut} aria-label="Sign out" title="Sign out">
                            <LogOut size={18} />
                        </button>
                    </div>
                </header>
                <nav className={styles.tabStrip} aria-label="Console sections">
                    {NAV.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={label}
                            href={base + href}
                            className={cn(styles.stripItem, isActive(href) && styles.stripItemActive)}
                        >
                            <Icon size={16} />
                            {label}
                        </Link>
                    ))}
                </nav>
                <main className={styles.main}>{children}</main>
            </div>
        </div>
    );
}
