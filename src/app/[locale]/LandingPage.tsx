"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import {
    Utensils,
    UtensilsCrossed,
    Receipt,
    ChefHat,
    Grid3X3,
    ShieldCheck,
    Send,
    ArrowRight,
    Sun,
    CloudSun,
    Moon,
    Check,
    Users,
    ShoppingCart,
    Crown,
    Wallet,
    Sparkles,
} from "lucide-react";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

export default function LandingPage() {
    const t = useTranslations("landing");
    const tc = useTranslations("common");
    const locale = useLocale();
    const { isAuthenticated } = useAuth();
    // Signed-in people go straight back into the app from every button on this page
    const appHref = `/${locale}/overview`;
    const ctaHref = isAuthenticated ? appHref : `/${locale}/register`;
    const signInHref = isAuthenticated ? appHref : `/${locale}/login`;
    const signInLabel = isAuthenticated ? t("openApp") : t("nav.signIn");

    const features = [
        { key: "mealToggle", Icon: UtensilsCrossed, tone: styles.toneViolet, wide: true },
        { key: "expense", Icon: Receipt, tone: styles.toneLime },
        { key: "headcount", Icon: ChefHat, tone: styles.tonePink },
        { key: "matrix", Icon: Grid3X3, tone: styles.toneBlue },
        { key: "telegram", Icon: Send, tone: styles.toneSky },
        { key: "finance", Icon: ShieldCheck, tone: styles.toneGreen, wide: true },
    ];

    const roles = [
        { key: "member", Icon: Users },
        { key: "manager", Icon: ShoppingCart },
        { key: "admin", Icon: Crown },
        { key: "cook", Icon: ChefHat },
    ];

    const steps = ["one", "two", "three"] as const;

    return (
        <div className={styles.landing}>
            {/* Nav */}
            <nav className={styles.navbar}>
                <div className={styles.navInner}>
                    <Link href={isAuthenticated ? appHref : `/${locale}`} className={styles.logo}>
                        <span className={styles.logoIcon}>
                            <Utensils size={18} />
                        </span>
                        {tc("appName")}
                    </Link>
                    <div className={styles.navActions}>
                        <span className={styles.navPrefs}>
                            <LocaleSwitcher />
                            <ThemeToggle />
                        </span>
                        <Link href={signInHref} className={styles.navSignIn}>
                            {signInLabel}
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <header className={styles.hero}>
                <div className={styles.heroCopy}>
                    <span className={styles.badge}>
                        <Sparkles size={14} /> {t("hero.badge")}
                    </span>
                    <h1 className={styles.heroTitle}>
                        {t("hero.title")} <span className={styles.heroHighlight}>{t("hero.titleHighlight")}</span>
                    </h1>
                    <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
                    <div className={styles.heroActions}>
                        <Link href={ctaHref} className={cn(styles.btn, styles.btnPrimary)}>
                            {isAuthenticated ? t("openApp") : t("hero.cta")} <ArrowRight size={18} />
                        </Link>
                        <a href="#features" className={cn(styles.btn, styles.btnGhost)}>
                            {t("hero.ctaSecondary")}
                        </a>
                    </div>
                    <ul className={styles.facts}>
                        {(["taps", "auto", "lang"] as const).map((k) => (
                            <li key={k} className={styles.fact}>
                                <span className={styles.factValue}>{t(`facts.${k}.value`)}</span>
                                <span className={styles.factLabel}>{t(`facts.${k}.label`)}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Phone preview, drawn in CSS */}
                <div className={styles.phoneWrap} aria-hidden>
                    <div className={styles.phone}>
                        <div className={styles.phoneNotch} />
                        <div className={styles.phoneScreen}>
                            <div className={styles.mockGreeting}>
                                <small>{t("mock.date")}</small>
                                <b>{t("mock.greeting")}</b>
                            </div>
                            <div className={styles.mockBalance}>
                                <small><Wallet size={12} /> {t("mock.balance")}</small>
                                <b>৳ 1,240</b>
                                <span className={styles.mockChip}>{t("mock.ahead")}</span>
                            </div>
                            {[
                                { Icon: Sun, label: t("mock.breakfast"), on: true, c: styles.mockB },
                                { Icon: CloudSun, label: t("mock.lunch"), on: true, c: styles.mockL },
                                { Icon: Moon, label: t("mock.dinner"), on: false, c: styles.mockD },
                            ].map(({ Icon, label, on, c }) => (
                                <div key={label} className={cn(styles.mockMeal, c, on && styles.mockMealOn)}>
                                    <span className={styles.mockMealIcon}><Icon size={16} /></span>
                                    <span className={styles.mockMealLabel}>{label}</span>
                                    <span className={styles.mockSwitch}><span /></span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={cn(styles.floatCard, styles.floatA)}>
                        <span className={styles.floatIcon}><Check size={14} strokeWidth={3} /></span>
                        {t("mock.float1")}
                    </div>
                    <div className={cn(styles.floatCard, styles.floatB)}>
                        <ChefHat size={16} /> {t("mock.float2")}
                    </div>
                </div>
            </header>

            {/* How it works */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>{t("steps.title")}</h2>
                <ol className={styles.steps}>
                    {steps.map((k, i) => (
                        <li key={k} className={styles.step}>
                            <span className={styles.stepNum}>{i + 1}</span>
                            <h3 className={styles.stepTitle}>{t(`steps.${k}.title`)}</h3>
                            <p className={styles.stepDesc}>{t(`steps.${k}.description`)}</p>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Features bento */}
            <section className={styles.section} id="features">
                <h2 className={styles.sectionTitle}>{t("features.title")}</h2>
                <p className={styles.sectionSubtitle}>{t("features.subtitle")}</p>
                <div className={styles.bento}>
                    {features.map(({ key, Icon, tone, wide }) => (
                        <article key={key} className={cn(styles.feature, tone, wide && styles.featureWide)}>
                            <span className={styles.featureIcon}><Icon size={22} /></span>
                            <h3 className={styles.featureTitle}>{t(`features.${key}.title`)}</h3>
                            <p className={styles.featureDesc}>{t(`features.${key}.description`)}</p>
                        </article>
                    ))}
                </div>
            </section>

            {/* Roles */}
            <section className={styles.section} id="roles">
                <h2 className={styles.sectionTitle}>{t("roles.title")}</h2>
                <div className={styles.roles}>
                    {roles.map(({ key, Icon }) => (
                        <article key={key} className={styles.role}>
                            <span className={styles.roleIcon}><Icon size={20} /></span>
                            <h3 className={styles.roleTitle}>{t(`roles.${key}.title`)}</h3>
                            <p className={styles.roleDesc}>{t(`roles.${key}.description`)}</p>
                        </article>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className={styles.cta}>
                <h2 className={styles.ctaTitle}>{t("cta.title")}</h2>
                <p className={styles.ctaSubtitle}>{t("cta.subtitle")}</p>
                <Link href={ctaHref} className={cn(styles.btn, styles.btnLime)}>
                    {isAuthenticated ? t("openApp") : t("cta.button")} <ArrowRight size={18} />
                </Link>
            </section>

            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <span className={styles.logo}>
                        <span className={styles.logoIcon}><Utensils size={16} /></span>
                        {tc("appName")}
                    </span>
                    <nav className={styles.footerLinks} aria-label={t("footer.nav")}>
                        <a href="#features">{t("footer.features")}</a>
                        <a href="#roles">{t("footer.roles")}</a>
                        <Link href={signInHref}>{signInLabel}</Link>
                        <Link href={ctaHref}>{isAuthenticated ? t("openApp") : t("footer.getStarted")}</Link>
                        <Link href={`/${locale}/support`}>{t("footer.support")}</Link>
                        <Link href={`/${locale}/privacy`}>{t("footer.privacy")}</Link>
                        <Link href={`/${locale}/terms`}>{t("footer.terms")}</Link>
                    </nav>
                    <p className={styles.footerCopy}>{t("footer.copyright")}</p>
                </div>
            </footer>

            {/* Sticky CTA on phones */}
            <div className={styles.stickyCta}>
                <Link href={ctaHref} className={cn(styles.btn, styles.btnPrimary, styles.btnBlock)}>
                    {isAuthenticated ? t("openApp") : t("hero.cta")} <ArrowRight size={18} />
                </Link>
            </div>
        </div>
    );
}
