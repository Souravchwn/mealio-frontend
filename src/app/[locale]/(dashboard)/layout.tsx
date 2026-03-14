"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Utensils,
    LayoutDashboard,
    UtensilsCrossed,
    Receipt,
    ChefHat,
    Grid3X3,
    Users,
    FileText,
    Settings,
    LogOut,
    Menu,
    X,
    Bell,
} from "lucide-react";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { cn, getInitials } from "@/lib/utils";
import styles from "./dashboard.module.css";

// Mock user — replace with auth context later
const MOCK_USER = {
    name: "Sourav",
    role: "ADMIN" as const,
    messName: "Bashundhara Mess",
};

interface NavItem {
    key: string;
    href: string;
    icon: React.ReactNode;
    roles: string[];
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const t = useTranslations("nav");
    const locale = useLocale();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const basePath = `/${locale}`;

    const mainNav: NavItem[] = [
        {
            key: "overview",
            href: `${basePath}/overview`,
            icon: <LayoutDashboard size={20} />,
            roles: ["ADMIN", "MANAGER", "MEMBER"],
        },
        {
            key: "meals",
            href: `${basePath}/meals`,
            icon: <UtensilsCrossed size={20} />,
            roles: ["ADMIN", "MANAGER", "MEMBER"],
        },
        {
            key: "expenses",
            href: `${basePath}/expenses`,
            icon: <Receipt size={20} />,
            roles: ["ADMIN", "MANAGER"],
        },
        {
            key: "headcount",
            href: `${basePath}/headcount`,
            icon: <ChefHat size={20} />,
            roles: ["ADMIN", "MANAGER", "MEMBER"],
        },
    ];

    const adminNav: NavItem[] = [
        {
            key: "matrix",
            href: `${basePath}/matrix`,
            icon: <Grid3X3 size={20} />,
            roles: ["ADMIN"],
        },
        {
            key: "members",
            href: `${basePath}/members`,
            icon: <Users size={20} />,
            roles: ["ADMIN"],
        },
        {
            key: "audit",
            href: `${basePath}/audit`,
            icon: <FileText size={20} />,
            roles: ["ADMIN"],
        },
        {
            key: "settings",
            href: `${basePath}/settings`,
            icon: <Settings size={20} />,
            roles: ["ADMIN"],
        },
    ];

    const userRole = MOCK_USER.role;
    const filteredMain = mainNav.filter((item) =>
        item.roles.includes(userRole)
    );
    const filteredAdmin = adminNav.filter((item) =>
        item.roles.includes(userRole)
    );

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

    // Get current page title
    const currentNavItem = [...mainNav, ...adminNav].find((item) =>
        isActive(item.href)
    );
    const pageTitle = currentNavItem ? t(currentNavItem.key) : t("overview");

    // Bottom nav items (max 5 for mobile)
    const bottomNavItems = filteredMain.slice(0, 4);

    return (
        <div className={styles.layout}>
            {/* Sidebar Overlay (mobile) */}
            <div
                className={cn(styles.overlay, sidebarOpen && styles.overlayVisible)}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <aside
                className={cn(styles.sidebar, sidebarOpen && styles.sidebarOpen)}
            >
                <div className={styles.sidebarHeader}>
                    <div className={styles.sidebarLogo}>
                        <Utensils size={20} color="white" />
                    </div>
                    <div className={styles.sidebarBrand}>
                        <span className={styles.sidebarTitle}>Mealio</span>
                        <span className={styles.sidebarMessName}>
                            {MOCK_USER.messName}
                        </span>
                    </div>
                </div>

                <nav className={styles.sidebarNav}>
                    <span className={styles.navLabel}>Menu</span>
                    {filteredMain.map((item) => (
                        <Link
                            key={item.key}
                            href={item.href}
                            className={cn(
                                styles.navItem,
                                isActive(item.href) && styles.navItemActive
                            )}
                            onClick={() => setSidebarOpen(false)}
                        >
                            <span className={styles.navItemIcon}>{item.icon}</span>
                            {t(item.key)}
                        </Link>
                    ))}

                    {filteredAdmin.length > 0 && (
                        <>
                            <span className={styles.navLabel}>Admin</span>
                            {filteredAdmin.map((item) => (
                                <Link
                                    key={item.key}
                                    href={item.href}
                                    className={cn(
                                        styles.navItem,
                                        isActive(item.href) && styles.navItemActive
                                    )}
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <span className={styles.navItemIcon}>{item.icon}</span>
                                    {t(item.key)}
                                </Link>
                            ))}
                        </>
                    )}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.userCard}>
                        <div className={styles.userAvatar}>
                            {getInitials(MOCK_USER.name)}
                        </div>
                        <div className={styles.userInfo}>
                            <div className={styles.userName}>{MOCK_USER.name}</div>
                            <div className={styles.userRole}>{MOCK_USER.role}</div>
                        </div>
                        <LogOut size={16} style={{ opacity: 0.5, cursor: "pointer" }} />
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div className={styles.main}>
                {/* Topbar */}
                <header className={styles.topbar}>
                    <div className={styles.topbarLeft}>
                        <button
                            className={styles.menuButton}
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Toggle menu"
                        >
                            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                        <h1 className={styles.pageTitle}>{pageTitle}</h1>
                    </div>

                    <div className={styles.topbarRight}>
                        <LocaleSwitcher />
                        <button
                            className={styles.menuButton}
                            style={{ display: "flex" }}
                            aria-label="Notifications"
                        >
                            <Bell size={20} />
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className={styles.content}>{children}</main>
            </div>

            {/* Mobile Bottom Nav */}
            <nav className={styles.bottomNav}>
                <div className={styles.bottomNavInner}>
                    {bottomNavItems.map((item) => (
                        <Link
                            key={item.key}
                            href={item.href}
                            className={cn(
                                styles.bottomNavItem,
                                isActive(item.href) && styles.bottomNavItemActive
                            )}
                        >
                            {item.icon}
                            <span>{t(item.key)}</span>
                        </Link>
                    ))}
                </div>
            </nav>
        </div>
    );
}
