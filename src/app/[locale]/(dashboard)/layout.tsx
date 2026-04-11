"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
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
    BarChart2,
} from "lucide-react";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { cn, getInitials } from "@/lib/utils";
import styles from "./dashboard.module.css";

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
    const router = useRouter();
    const { user, logout, isAuthenticated, isLoading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Redirect to login if not authenticated (wait for localStorage hydration first)
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push(`/${locale}/login`);
        }
    }, [isAuthenticated, isLoading, locale, router]);

    if (isLoading) {
        return (
            <div className={styles.loadingScreen}>
                <div className={styles.loadingLogo}>
                    <Utensils size={22} color="white" />
                </div>
            </div>
        );
    }

    const handleLogout = () => {
        logout();
        router.push(`/${locale}/login`);
    };

    // Use actual user data or fallback to mock
    const currentUser = user || {
        name: "Guest User",
        role: "MEMBER" as const,
        messName: "Demo Mess",
    };

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
        {
            key: "mySummary",
            href: `${basePath}/my-summary`,
            icon: <BarChart2 size={20} />,
            roles: ["MEMBER"],
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

    const userRole = currentUser.role;
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
                            {currentUser.messName}
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
                            {getInitials(currentUser.name)}
                        </div>
                        <div className={styles.userInfo}>
                            <div className={styles.userName}>{currentUser.name}</div>
                            <div className={styles.userRole}>{currentUser.role}</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            aria-label="Logout"
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                opacity: 0.5
                            }}
                        >
                            <LogOut size={16} />
                        </button>
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
                        <ThemeToggle />
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
