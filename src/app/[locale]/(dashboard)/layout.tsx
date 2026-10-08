"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    Utensils,
    Home,
    UtensilsCrossed,
    Receipt,
    ChefHat,
    Grid3X3,
    Users,
    ScrollText,
    Settings,
    LogOut,
    LayoutGrid,
    X,
    Wallet,
    ChevronRight,
    LifeBuoy,
    Archive,
} from "lucide-react";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { MessSwitcher } from "@/components/composed/MessSwitcher/MessSwitcher";
import { PeriodNotice } from "@/components/composed/PeriodNotice/PeriodNotice";
import { PeriodProvider } from "@/contexts/PeriodContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn, getInitials } from "@/lib/utils";
import styles from "./dashboard.module.css";

interface NavItem {
    key: string;
    href: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    roles: string[];
}

const ALL = ["ADMIN", "MANAGER", "MEMBER", "GUEST"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations("nav");
    const locale = useLocale();
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout, isAuthenticated, isLoading } = useAuth();
    const [sheetOpen, setSheetOpen] = useState(false);

    // Redirect to login if not authenticated (after hydration)
    useEffect(() => {
        if (!isLoading && !isAuthenticated) router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
    }, [isAuthenticated, isLoading, locale, router, pathname]);

    // Close the "More" sheet with Escape
    useEffect(() => {
        if (!sheetOpen) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [sheetOpen]);

    if (isLoading || !user) {
        return (
            <div className={styles.loadingScreen}>
                <div className={styles.loadingLogo}>
                    <Utensils size={24} />
                </div>
            </div>
        );
    }

    const base = `/${locale}`;
    const nav: Record<string, NavItem> = {
        overview: { key: "overview", href: `${base}/overview`, icon: Home, roles: ALL },
        meals: { key: "meals", href: `${base}/meals`, icon: UtensilsCrossed, roles: ALL },
        expenses: { key: "expenses", href: `${base}/expenses`, icon: Receipt, roles: ALL },
        mySummary: { key: "mySummary", href: `${base}/my-summary`, icon: Wallet, roles: ALL },
        headcount: { key: "headcount", href: `${base}/headcount`, icon: ChefHat, roles: ALL },
        settings: { key: "settings", href: `${base}/settings`, icon: Settings, roles: ALL },
        matrix: { key: "matrix", href: `${base}/matrix`, icon: Grid3X3, roles: ["ADMIN", "MANAGER"] },
        members: { key: "members", href: `${base}/members`, icon: Users, roles: ["ADMIN"] },
        audit: { key: "audit", href: `${base}/audit`, icon: ScrollText, roles: ["ADMIN"] },
        support: { key: "support", href: `${base}/support`, icon: LifeBuoy, roles: ALL },
        archive: { key: "archive", href: `${base}/archive`, icon: Archive, roles: ALL },
    };

    const can = (item: NavItem) => item.roles.includes(user.role);
    const mainItems = [nav.overview, nav.meals, nav.expenses, nav.mySummary, nav.headcount, nav.archive, nav.settings, nav.support].filter(can);
    const adminItems = [nav.matrix, nav.members, nav.audit].filter(can);
    // "More" sheet: everything that is not a bottom tab
    const moreItems = [nav.headcount, nav.matrix, nav.members, nav.audit, nav.archive, nav.settings, nav.support].filter(can);

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
    const current = Object.values(nav).find((item) => isActive(item.href));
    const pageTitle = current ? t(current.key) : t("overview");
    const moreActive = moreItems.some((item) => isActive(item.href));

    const handleLogout = () => {
        logout();
        router.push(`/${locale}/login`);
    };

    const renderNavLink = (item: NavItem) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
            <Link
                key={item.key}
                href={item.href}
                className={cn(styles.navItem, active && styles.navItemActive)}
                aria-current={active ? "page" : undefined}
            >
                <span className={styles.navItemIcon}>
                    <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={styles.navItemLabel}>{t(item.key)}</span>
            </Link>
        );
    };

    const renderTab = (item: NavItem, label: string) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
            <Link
                href={item.href}
                className={cn(styles.tab, active && styles.tabActive)}
                aria-current={active ? "page" : undefined}
            >
                <span className={styles.tabIcon}>
                    <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={styles.tabLabel}>{label}</span>
            </Link>
        );
    };

    const mealsActive = isActive(nav.meals.href);

    return (
        <div className={styles.layout}>
            {/* ── Desktop sidebar ─────────────────────────────────────────── */}
            <aside className={styles.sidebar} aria-label={t("menu")}>
                <Link href={nav.overview.href} className={styles.brand}>
                    <span className={styles.brandMark}>
                        <Utensils size={18} />
                    </span>
                    <span className={styles.brandText}>Mealio</span>
                </Link>

                <nav className={styles.sidebarNav}>
                    {mainItems.map(renderNavLink)}
                    {adminItems.length > 0 && (
                        <>
                            <span className={styles.navLabel}>{t("admin")}</span>
                            {adminItems.map(renderNavLink)}
                        </>
                    )}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.sidebarPrefs}>
                        <LocaleSwitcher />
                        <ThemeToggle />
                    </div>
                    <div className={styles.userCard}>
                        <span className={styles.avatar}>{getInitials(user.name)}</span>
                        <span className={styles.userInfo}>
                            <span className={styles.userName}>{user.name}</span>
                            <span className={styles.userRole}>{user.role.toLowerCase()}</span>
                        </span>
                        <button onClick={handleLogout} aria-label={t("logout")} className={styles.logoutBtn}>
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main column ─────────────────────────────────────────────── */}
            <div className={styles.main}>
                <header className={styles.topbar}>
                    <Link href={nav.overview.href} className={styles.topbarBrand} aria-label="Mealio">
                        <span className={styles.brandMark}>
                            <Utensils size={16} />
                        </span>
                    </Link>
                    <h1 className={styles.pageTitle}>{pageTitle}</h1>
                    <div className={styles.topbarRight}>
                        <MessSwitcher />
                        <span className={styles.topbarTheme}>
                            <ThemeToggle />
                        </span>
                        <button
                            className={styles.avatarBtn}
                            onClick={() => setSheetOpen(true)}
                            aria-label={t("more")}
                        >
                            {getInitials(user.name)}
                        </button>
                    </div>
                </header>

                <main className={styles.content} id="main">
                    <PeriodProvider>
                        <PeriodNotice />
                        {children}
                    </PeriodProvider>
                </main>
            </div>

            {/* ── Mobile bottom tab bar ───────────────────────────────────── */}
            <nav className={styles.tabBar} aria-label={t("menu")}>
                {renderTab(nav.overview, t("home"))}
                {renderTab(nav.expenses, t("bazaar"))}
                <Link
                    href={nav.meals.href}
                    className={cn(styles.tabCenter, mealsActive && styles.tabCenterActive)}
                    aria-current={mealsActive ? "page" : undefined}
                    aria-label={t("meals")}
                >
                    <span className={styles.tabCenterBubble}>
                        <UtensilsCrossed size={24} strokeWidth={2.4} />
                    </span>
                    <span className={styles.tabLabel}>{t("mealsShort")}</span>
                </Link>
                {renderTab(nav.mySummary, t("me"))}
                <button
                    className={cn(styles.tab, moreActive && styles.tabActive)}
                    onClick={() => setSheetOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={sheetOpen}
                >
                    <span className={styles.tabIcon}>
                        <LayoutGrid size={22} strokeWidth={moreActive ? 2.4 : 2} />
                    </span>
                    <span className={styles.tabLabel}>{t("more")}</span>
                </button>
            </nav>

            {/* ── "More" bottom sheet ─────────────────────────────────────── */}
            {sheetOpen && (
                <div className={styles.sheetLayer} role="dialog" aria-modal="true" aria-label={t("more")}>
                    <button className={styles.scrim} onClick={() => setSheetOpen(false)} aria-label={t("close")} />
                    <div className={styles.sheet}>
                        <span className={styles.sheetHandle} aria-hidden />
                        <div className={styles.sheetHeader}>
                            <span className={styles.avatarLg}>{getInitials(user.name)}</span>
                            <span className={styles.userInfo}>
                                <span className={styles.sheetName}>{user.name}</span>
                                <span className={styles.userRole}>
                                    {user.messName} · {user.role.toLowerCase()}
                                </span>
                            </span>
                            <button className={styles.sheetClose} onClick={() => setSheetOpen(false)} aria-label={t("close")}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.sheetGrid}>
                            {moreItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.key}
                                        href={item.href}
                                        className={cn(styles.sheetTile, isActive(item.href) && styles.sheetTileActive)}
                                        onClick={() => setSheetOpen(false)}
                                    >
                                        <span className={styles.sheetTileIcon}>
                                            <Icon size={22} />
                                        </span>
                                        <span className={styles.sheetTileLabel}>{t(item.key)}</span>
                                        <ChevronRight size={16} className={styles.sheetTileChevron} />
                                    </Link>
                                );
                            })}
                        </div>

                        <div className={styles.sheetPrefs}>
                            <span className={styles.sheetPrefLabel}>{t("language")}</span>
                            <LocaleSwitcher />
                        </div>
                        <div className={styles.sheetPrefs}>
                            <span className={styles.sheetPrefLabel}>{t("theme")}</span>
                            <ThemeToggle />
                        </div>

                        <button className={styles.sheetLogout} onClick={handleLogout}>
                            <LogOut size={18} />
                            {t("logout")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
