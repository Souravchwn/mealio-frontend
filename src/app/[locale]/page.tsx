"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import styles from "./landing.module.css";
import { cn } from "@/lib/utils";

const FOOD_PARTICLES = [
    { emoji: "🍜", className: styles.particle1 },
    { emoji: "🥘", className: styles.particle2 },
    { emoji: "🍚", className: styles.particle3 },
    { emoji: "🧑‍🍳", className: styles.particle4 },
    { emoji: "🥗", className: styles.particle5 },
    { emoji: "🫕", className: styles.particle6 },
    { emoji: "🥩", className: styles.particle7 },
    { emoji: "🧅", className: styles.particle8 },
];

export default function LandingPage() {
    const t = useTranslations("landing");
    const tc = useTranslations("common");
    const locale = useLocale();
    const [scrolled, setScrolled] = useState(false);
    const featuresRef = useRef<HTMLElement>(null);

    useEffect(() => {
        function handleScroll() {
            setScrolled(window.scrollY > 50);
        }
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Scroll-triggered reveal animations
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
        );
        document
            .querySelectorAll("[data-landing-animate]")
            .forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    function scrollToFeatures() {
        featuresRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    const features = [
        { key: "mealToggle", icon: <ToggleRight size={24} />, iconClass: styles.featureIconPrimary },
        { key: "expense",    icon: <Receipt size={24} />,     iconClass: styles.featureIconAccent },
        { key: "headcount",  icon: <ChefHat size={24} />,     iconClass: styles.featureIconSuccess },
        { key: "matrix",     icon: <Grid3X3 size={24} />,     iconClass: styles.featureIconInfo },
        { key: "finance",    icon: <Shield size={24} />,      iconClass: styles.featureIconDanger },
        { key: "ai",         icon: <Sparkles size={24} />,    iconClass: styles.featureIconPurple, comingSoon: true },
    ];

    const roles = [
        { key: "member",  emoji: "👤" },
        { key: "manager", emoji: "🛒" },
        { key: "admin",   emoji: "👑" },
        { key: "cook",    emoji: "👨‍🍳" },
    ];

    return (
        <>
            {/* Navbar */}
            <nav className={cn(styles.navbar, scrolled && styles.navbarScrolled)}>
                <div className={styles.navInner}>
                    <div className={styles.logo}>
                        <span className={styles.logoIcon}>
                            <Utensils size={20} />
                        </span>
                        {tc("appName")}
                    </div>
                    <div className={styles.navActions}>
                        <ThemeToggle />
                        <Link href={`/${locale}/login`} className={styles.navSignIn}>
                            <Button variant="ghost" size="small">
                                {t("nav.signIn")}
                            </Button>
                        </Link>
                        <Link href={`/${locale}/register`}>
                            <Button size="small">{t("hero.cta")}</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className={styles.hero}>
                <div className={styles.heroBg} aria-hidden="true">
                    <div className={styles.heroDotGrid} />
                    {FOOD_PARTICLES.map((p, i) => (
                        <span key={i} className={cn(styles.particle, p.className)}>
                            {p.emoji}
                        </span>
                    ))}
                </div>

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
                        <div className={styles.ctaGlowWrap}>
                            <Link href={`/${locale}/register`}>
                                <Button size="large">
                                    {t("hero.cta")}
                                    <ArrowRight size={20} />
                                </Button>
                            </Link>
                        </div>
                        <Button variant="secondary" size="large" onClick={scrollToFeatures}>
                            {t("hero.ctaSecondary")}
                        </Button>
                    </div>

                    <div className={styles.statsBar}>
                        <div className={styles.statItem}>
                            <div className={styles.statNumber}>50+</div>
                            <div className={styles.statLabel}>{t("stats.messes")}</div>
                        </div>
                        <div className={styles.statDivider} />
                        <div className={styles.statItem}>
                            <div className={styles.statNumber}>12K+</div>
                            <div className={styles.statLabel}>{t("stats.meals")}</div>
                        </div>
                        <div className={styles.statDivider} />
                        <div className={styles.statItem}>
                            <div className={styles.statNumber}>200+</div>
                            <div className={styles.statLabel}>{t("stats.saved")}</div>
                        </div>
                    </div>
                </div>

                {/* Scroll indicator — fades out once user scrolls */}
                <div
                    className={cn(styles.scrollHint, scrolled && styles.scrollHintHidden)}
                    aria-hidden="true"
                >
                    <div className={styles.scrollLine}>
                        <div className={styles.scrollDot} />
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className={styles.section} id="features" ref={featuresRef}>
                <div className={styles.sectionHeader} data-landing-animate>
                    <h2 className={styles.sectionTitle}>{t("features.title")}</h2>
                    <p className={styles.sectionSubtitle}>{t("features.subtitle")}</p>
                </div>

                <div className={styles.featuresGrid}>
                    {features.map((feature, index) => (
                        <div
                            key={feature.key}
                            className={styles.featureCard}
                            data-landing-animate
                            style={{ transitionDelay: `${index * 0.08}s` }}
                        >
                            <div className={cn(styles.featureIconWrap, feature.iconClass)}>
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
                <div className={styles.sectionHeader} data-landing-animate>
                    <h2 className={styles.sectionTitle}>{t("roles.title")}</h2>
                </div>
                <div className={styles.rolesGrid}>
                    {roles.map((role, index) => (
                        <div
                            key={role.key}
                            className={styles.roleCard}
                            data-landing-animate
                            style={{ transitionDelay: `${index * 0.1}s` }}
                        >
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
                <div className={styles.ctaOrb1} aria-hidden="true" />
                <div className={styles.ctaOrb2} aria-hidden="true" />
                <div className={styles.ctaContent} data-landing-animate>
                    <div className={styles.ctaIcon} aria-hidden="true">🍽️</div>
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
                    <div className={styles.footerBrand}>
                        <div className={styles.footerLogo}>
                            <span className={styles.footerLogoIcon}>
                                <Utensils size={16} />
                            </span>
                            {tc("appName")}
                        </div>
                        <p className={styles.footerTagline}>{tc("tagline")}</p>
                    </div>

                    <nav className={styles.footerLinks} aria-label="Footer navigation">
                        <a href="#features" className={styles.footerLink}>{t("footer.features")}</a>
                        <a href="#roles"    className={styles.footerLink}>{t("footer.roles")}</a>
                        <Link href={`/${locale}/login`}    className={styles.footerLink}>{t("nav.signIn")}</Link>
                        <Link href={`/${locale}/register`} className={styles.footerLink}>{t("footer.getStarted")}</Link>
                    </nav>

                    <p className={styles.footerCopy}>{t("footer.copyright")}</p>
                </div>
            </footer>
        </>
    );
}
