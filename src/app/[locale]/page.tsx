"use client";

import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ArrowDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

const grotesk = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-grotesk" });
// The public page: Bricolage Grotesque for all English. Bangla: Aborton for display (locale layout),
// Hind Siliguri for text (globals.css).

/** The brand mark: a plate seen from above, with one meal on it. */
function Mark({ size = 28 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={styles.mark}>
            <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
            <circle cx="19.5" cy="12.5" r="4" className={styles.markDot} />
        </svg>
    );
}

// A sample month for the hero ledger: October 2026 starts on a Thursday, "today" is the 9th.
type Day = { day: number; meals: ("on" | "off" | "guest")[] } | null;
const TODAY = 9;
const SKIPS: Record<number, number[]> = { 2: [1], 5: [0], 7: [1, 2] };
const GUESTS: Record<number, number> = { 4: 2 };
const MONTH: Day[] = [
    ...Array<Day>(3).fill(null),
    ...Array.from({ length: 31 }, (_, i) => {
        const day = i + 1;
        if (day > TODAY) return { day, meals: [] };
        const meals = [0, 1, 2].map((slot) =>
            SKIPS[day]?.includes(slot) ? "off" : GUESTS[day] === slot ? "guest" : "on",
        ) as ("on" | "off" | "guest")[];
        return { day, meals };
    }),
    null,
];
const MEALS_SO_FAR = MONTH.reduce((n, d) => n + (d ? d.meals.filter((m) => m !== "off").length : 0), 0);

export default function LandingPage() {
    const t = useTranslations("landing");
    const locale = useLocale();
    const { isAuthenticated } = useAuth();
    // Signed-in people go straight back into the app from every button on this page
    const appHref = `/${locale}/overview`;
    const ctaHref = isAuthenticated ? appHref : `/${locale}/register`;
    const signInHref = isAuthenticated ? appHref : `/${locale}/login`;
    const signInLabel = isAuthenticated ? t("openApp") : t("nav.signIn");
    const ctaLabel = isAuthenticated ? t("openApp") : t("hero.cta");

    const intlLocale = locale === "bn" ? "bn-BD" : "en-GB";
    const monthName = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }).format(new Date(2026, 9, 1));
    // 5 Oct 2026 is a Monday
    const weekdays = Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(intlLocale, { weekday: "narrow" }).format(new Date(2026, 9, 5 + i)),
    );
    const num = (n: number, decimals = 0) =>
        n.toLocaleString(intlLocale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    const ticker = t.raw("ticker") as string[];
    const dayItems = ["morning", "skip", "cook", "bazaar", "close"] as const;
    // Every function, in the order a mess meets them
    const features = [
        "rules", "cutoffs", "preferences", "mealToggle", "guests", "names",
        "expense", "headcount", "matrix", "telegram", "archive", "finance",
    ] as const;
    const roles = [
        { key: "member", figure: `+৳${num(1240)}`, tone: styles.roleLime },
        { key: "manager", figure: `৳${num(62.4, 2)}`, tone: styles.rolePaper },
        { key: "admin", figure: `${num(8)} × ${num(31)}`, tone: styles.roleInk },
        { key: "cook", figure: num(14), tone: styles.roleViolet },
    ] as const;

    return (
        <div className={cn(styles.landing, grotesk.variable)}>
            <nav className={styles.navbar}>
                <div className={styles.navInner}>
                    <Link href={isAuthenticated ? appHref : `/${locale}`} className={styles.logo}>
                        <Mark />
                        <span className={styles.wordmark}>mealtill</span>
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
                    <p className={styles.kicker}>
                        <span className={styles.kickerLine} aria-hidden />
                        {t("hero.kicker")}
                    </p>
                    <h1 className={styles.heroTitle}>
                        {t("hero.title")}
                        <br />
                        <em className={styles.heroItalic}>{t("hero.titleHighlight")}</em>
                    </h1>
                    <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
                    <div className={styles.heroActions}>
                        <Link href={ctaHref} className={cn(styles.btn, styles.btnPrimary)}>
                            {ctaLabel} <ArrowRight size={18} aria-hidden />
                        </Link>
                        <a href="#day" className={styles.textLink}>
                            {t("hero.ctaSecondary")} <ArrowDown size={16} aria-hidden />
                        </a>
                    </div>
                </div>

                {/* A member's month, the way Mealtill actually keeps it */}
                <figure className={styles.ledger} aria-hidden>
                    <div className={styles.ledgerHead}>
                        <span className={styles.ledgerMonth}>{monthName}</span>
                        <span className={styles.ledgerName}>{t("ledger.name")}</span>
                    </div>
                    <div className={styles.calendar}>
                        {weekdays.map((w, i) => (
                            <span key={`w${i}`} className={styles.weekday}>{w}</span>
                        ))}
                        {MONTH.map((d, i) =>
                            d ? (
                                <span
                                    key={i}
                                    className={cn(styles.cell, d.day === TODAY && styles.cellToday, d.day > TODAY && styles.cellFuture)}
                                    style={{ "--i": i } as React.CSSProperties}
                                >
                                    <span className={styles.cellNum}>{num(d.day)}</span>
                                    <span className={styles.bars}>
                                        {(d.meals.length ? d.meals : ["", "", ""]).map((m, s) => (
                                            <span key={s} className={cn(styles.bar, m && styles[`bar_${m}`])} />
                                        ))}
                                    </span>
                                </span>
                            ) : (
                                <span key={i} />
                            ),
                        )}
                    </div>
                    <div className={styles.legend}>
                        <span><i className={styles.bar_on} /> {t("ledger.ate")}</span>
                        <span><i className={styles.bar_off} /> {t("ledger.skipped")}</span>
                        <span><i className={styles.bar_guest} /> {t("ledger.guest")}</span>
                    </div>
                    <div className={styles.receipt}>
                        <div>
                            <small>{t("ledger.rate")}</small>
                            <b className={styles.figure}>৳{num(62.4, 2)}</b>
                            <small>{t("ledger.perMeal")}</small>
                        </div>
                        <div>
                            <small>{t("ledger.balance")}</small>
                            <b className={cn(styles.figure, styles.figureUp)}>৳{num(1240)}</b>
                            <small>{t("ledger.meals", { count: num(MEALS_SO_FAR) })}</small>
                        </div>
                    </div>
                    <span className={styles.sticker}>{t("ledger.sticker")}</span>
                </figure>
            </header>

            {/* What a mess sounds like */}
            <div className={styles.ticker} aria-hidden>
                <div className={styles.tickerTrack}>
                    {[...ticker, ...ticker].map((item, i) => (
                        <span key={i} className={styles.tickerItem}>
                            {item}
                            <span className={styles.tickerStar}>✱</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* A day in the mess */}
            <section className={cn(styles.section, styles.daySection)} id="day">
                <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>{t("day.title")}</h2>
                    <p className={styles.sectionSubtitle}>{t("day.subtitle")}</p>
                </div>
                <ol className={styles.timeline}>
                    {dayItems.map((k) => (
                        <li key={k} className={styles.moment}>
                            <time className={styles.momentTime}>{t(`day.items.${k}.time`)}</time>
                            <div>
                                <h3 className={styles.momentTitle}>{t(`day.items.${k}.title`)}</h3>
                                <p className={styles.momentText}>{t(`day.items.${k}.text`)}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Features, as an index */}
            <section className={styles.section} id="features">
                <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>{t("features.title")}</h2>
                    <p className={styles.sectionSubtitle}>{t("features.subtitle")}</p>
                </div>
                <ol className={styles.index}>
                    {features.map((k, i) => (
                        <li key={k} className={styles.entry}>
                            <span className={styles.entryNum}>{String(i + 1).padStart(2, "0")}</span>
                            <h3 className={styles.entryTitle}>{t(`features.${k}.title`)}</h3>
                            <p className={styles.entryText}>{t(`features.${k}.description`)}</p>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Roles: the number each person cares about */}
            <section className={styles.section} id="roles">
                <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>{t("roles.title")}</h2>
                    <p className={styles.sectionSubtitle}>{t("rolesExtra.subtitle")}</p>
                </div>
                <div className={styles.roles}>
                    {roles.map(({ key, figure, tone }) => (
                        <article key={key} className={cn(styles.role, tone)}>
                            <span className={styles.roleFigure}>{figure}</span>
                            <span className={styles.roleCaption}>{t(`rolesExtra.${key}`)}</span>
                            <h3 className={styles.roleTitle}>{t(`roles.${key}.title`)}</h3>
                            <p className={styles.roleDesc}>{t(`roles.${key}.description`)}</p>
                        </article>
                    ))}
                </div>
            </section>

            {/* Closing call */}
            <section className={styles.cta}>
                <svg className={styles.ctaArt} viewBox="0 0 400 400" aria-hidden>
                    {[190, 150, 110].map((r) => (
                        <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.18" />
                    ))}
                    <circle cx="334" cy="106" r="9" className={styles.ctaDot} />
                </svg>
                <h2 className={styles.ctaTitle}>{t("cta.title")}</h2>
                <p className={styles.ctaSubtitle}>{t("cta.subtitle")}</p>
                <Link href={ctaHref} className={cn(styles.btn, styles.btnLime)}>
                    {isAuthenticated ? t("openApp") : t("cta.button")} <ArrowRight size={18} aria-hidden />
                </Link>
            </section>

            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <span className={styles.logo}>
                        <Mark size={24} />
                        <span className={styles.wordmark}>mealtill</span>
                    </span>
                    <nav className={styles.footerLinks} aria-label={t("footer.nav")}>
                        <a href="#features">{t("footer.features")}</a>
                        <a href="#roles">{t("footer.roles")}</a>
                        <Link href={signInHref}>{signInLabel}</Link>
                        {!isAuthenticated && <Link href={ctaHref}>{t("footer.getStarted")}</Link>}
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
                    {ctaLabel} <ArrowRight size={18} aria-hidden />
                </Link>
            </div>
        </div>
    );
}
