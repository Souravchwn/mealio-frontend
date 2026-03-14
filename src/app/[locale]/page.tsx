"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Utensils,
    ToggleRight,
    Receipt,
    ChefHat,
    Grid3X3,
    Shield,
    Sparkles,
    ArrowRight,
    Play,
} from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import styles from "./landing.module.css";
import { cn } from "@/lib/utils";

export default function LandingPage() {
    const t = useTranslations("landing");
    const tc = useTranslations("common");
    const locale = useLocale();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        function handleScroll() {
            setScrolled(window.scrollY > 20);
        }
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const features = [
        {
            key: "mealToggle",
            icon: <ToggleRight size={24} />,
            iconClass: styles.featureIconPrimary,
        },
        {
            key: "expense",
            icon: <Receipt size={24} />,
            iconClass: styles.featureIconAccent,
        },
        {
            key: "headcount",
            icon: <ChefHat size={24} />,
            iconClass: styles.featureIconSuccess,
        },
        {
            key: "matrix",
            icon: <Grid3X3 size={24} />,
            iconClass: styles.featureIconInfo,
        },
        {
            key: "finance",
            icon: <Shield size={24} />,
            iconClass: styles.featureIconDanger,
        },
        {
            key: "ai",
            icon: <Sparkles size={24} />,
            iconClass: styles.featureIconPurple,
            comingSoon: true,
        },
    ];

    const roles = [
        { key: "member", emoji: "👤" },
        { key: "manager", emoji: "🛒" },
        { key: "admin", emoji: "👑" },
        { key: "cook", emoji: "👨‍🍳" },
    ];

    return (
        <>
            {/* Navbar */}
            <nav
                className={cn(styles.navbar, scrolled && styles.navbarScrolled)}
            >
                <div className={styles.navInner}>
                    <div className={styles.logo}>
                        <span className={styles.logoIcon}>
                            <Utensils size={20} />
                        </span>
                        {tc("appName")}
                    </div>

                    <div className={styles.navActions}>
                        <LocaleSwitcher />
                        <Link href={`/${locale}/login`}>
                            <Button variant="ghost" size="small">
                                {t("hero.cta") === "Get Started Free" ? "Sign In" : "সাইন ইন"}
                            </Button>
                        </Link>
                        <Link href={`/${locale}/register`}>
                            <Button size="small">
                                {t("hero.cta")}
                            </Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className={styles.hero}>
                <div className={styles.heroBg} />
                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>
                        {t("hero.title")}
                        <br />
                        <span className={styles.heroHighlight}>
                            {t("hero.titleHighlight")}
                        </span>
                    </h1>
                    <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
                    <div className={styles.heroActions}>
                        <Link href={`/${locale}/register`}>
                            <Button size="large">
                                {t("hero.cta")}
                                <ArrowRight size={20} />
                            </Button>
                        </Link>
                        <Button variant="secondary" size="large">
                            <Play size={18} />
                            {t("hero.ctaSecondary")}
                        </Button>
                    </div>

                    {/* Stats */}
                    <div className={styles.statsBar}>
                        <div className={styles.statItem}>
                            <div className={styles.statNumber}>50+</div>
                            <div className={styles.statLabel}>{t("stats.messes")}</div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={styles.statNumber}>12K+</div>
                            <div className={styles.statLabel}>{t("stats.meals")}</div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={styles.statNumber}>200+</div>
                            <div className={styles.statLabel}>{t("stats.saved")}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className={styles.section} id="features">
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>{t("features.title")}</h2>
                    <p className={styles.sectionSubtitle}>
                        {t("features.subtitle")}
                    </p>
                </div>

                <div className={styles.featuresGrid}>
                    {features.map((feature, index) => (
                        <div
                            key={feature.key}
                            className={styles.featureCard}
                            style={{ animationDelay: `${index * 0.1}s` }}
                        >
                            <div
                                className={cn(styles.featureIconWrap, feature.iconClass)}
                            >
                                {feature.icon}
                            </div>
                            <h3 className={styles.featureTitle}>
                                {t(`features.${feature.key}.title`)}
                                {feature.comingSoon && (
                                    <span className={styles.comingSoon}>Soon</span>
                                )}
                            </h3>
                            <p className={styles.featureDesc}>
                                {t(`features.${feature.key}.description`)}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Roles */}
            <section className={styles.rolesBg} id="roles">
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>{t("roles.title")}</h2>
                </div>

                <div className={styles.rolesGrid}>
                    {roles.map((role) => (
                        <div key={role.key} className={styles.roleCard}>
                            <span className={styles.roleEmoji}>{role.emoji}</span>
                            <h3 className={styles.roleTitle}>
                                {t(`roles.${role.key}.title`)}
                            </h3>
                            <p className={styles.roleDesc}>
                                {t(`roles.${role.key}.description`)}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className={styles.ctaSection}>
                <div className={styles.ctaBg} />
                <div className={styles.ctaContent}>
                    <h2 className={styles.ctaTitle}>{t("cta.title")}</h2>
                    <p className={styles.ctaSubtitle}>{t("cta.subtitle")}</p>
                    <Link href={`/${locale}/register`}>
                        <Button size="large">
                            {t("cta.button")}
                            <ArrowRight size={20} />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <p>
                        {t("footer.madeWith")}{" "}
                        <span className={styles.footerFlags}>
                            🇧🇩 {t("footer.bangladesh")} {t("footer.and")} 🇮🇳{" "}
                            {t("footer.india")}
                        </span>
                    </p>
                    <p>{t("footer.copyright")}</p>
                </div>
            </footer>
        </>
    );
}
