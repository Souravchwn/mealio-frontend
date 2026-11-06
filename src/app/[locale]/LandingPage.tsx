import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/composed/ThemeToggle/ThemeToggle";
import { LocaleSwitcher } from "@/components/composed/LocaleSwitcher/LocaleSwitcher";
import { AuthLink } from "./landing/AuthLink";
import { StickyCta } from "./landing/StickyCta";
import styles from "./landing.module.css";

/** The brand mark: a khata (ledger notebook) with its margin line and two ruled lines. */
function KhataMark({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={styles.mark}>
            <rect x="3.5" y="2.5" width="17" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.5 2.5v19" stroke="var(--lp-margin)" strokeWidth="1.8" />
            <path d="M11.5 9h5.5M11.5 13h5.5M11.5 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

const FEATURES = ["mealToggle", "expense", "headcount", "matrix", "telegram", "finance"] as const;
const ROLES = ["member", "manager", "admin", "cook"] as const;
const STEPS = ["one", "two", "three"] as const;
const FACTS = ["taps", "auto", "lang"] as const;

/**
 * Landing page, designed as the mess's own khata: ruled paper, a margin line and the month's
 * arithmetic shown in full. A Server Component; only the auth-aware links, the theme and
 * language switches and the phone call-to-action bar run in the browser.
 */
export default async function LandingPage({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "landing" });
    const tc = await getTranslations({ locale, namespace: "common" });

    const home = `/${locale}`;
    const app = `/${locale}/overview`;
    const register = `/${locale}/register`;
    const login = `/${locale}/login`;
    const openApp = t("openApp");
    const year = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en", { year: "numeric" }).format(new Date());
    const num = (n: number) => n.toLocaleString(locale === "bn" ? "bn-BD" : "en", { minimumIntegerDigits: 2 });

    const ledger = (key: string) => t(`ledger.${key}`);

    return (
        <div className={styles.landing}>
            <header className={styles.navbar}>
                <div className={styles.navInner}>
                    <AuthLink href={home} memberHref={app} className={styles.logo}>
                        <KhataMark />
                        <span>{tc("appName")}</span>
                    </AuthLink>
                    <div className={styles.navActions}>
                        <span className={styles.navPrefs}>
                            <LocaleSwitcher />
                            <ThemeToggle />
                        </span>
                        <AuthLink
                            href={login}
                            memberHref={app}
                            label={t("nav.signIn")}
                            memberLabel={openApp}
                            className={styles.navSignIn}
                        />
                    </div>
                </div>
            </header>

            <main>
                <section className={styles.hero}>
                    <div className={styles.heroCopy}>
                        <p className={styles.eyebrow}>{t("hero.badge")}</p>
                        <h1 className={styles.heroTitle}>
                            {t("hero.title")} <span className={styles.highlight}>{t("hero.titleHighlight")}</span>
                        </h1>
                        <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
                        <div className={styles.heroActions} id="hero-actions">
                            <AuthLink
                                href={register}
                                memberHref={app}
                                label={t("hero.cta")}
                                memberLabel={openApp}
                                className={styles.btnPrimary}
                                arrow
                            />
                            <a href="#how" className={styles.btnGhost}>
                                {t("hero.ctaSecondary")}
                            </a>
                        </div>
                        <ul className={styles.facts}>
                            {FACTS.map((k) => (
                                <li key={k}>
                                    <span className={styles.factValue}>{t(`facts.${k}.value`)}</span>
                                    <span className={styles.factLabel}>{t(`facts.${k}.label`)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <figure className={styles.ledger} aria-label={`${ledger("label")}: ${ledger("title")}`}>
                        <figcaption className={styles.ledgerHead}>
                            <span className={styles.ledgerLabel}>{ledger("label")}</span>
                            <span className={styles.ledgerTitle}>{ledger("title")}</span>
                        </figcaption>
                        <dl className={styles.ledgerRows}>
                            <div className={styles.row}>
                                <dt>{ledger("bazaar")}</dt>
                                <dd>{ledger("bazaarValue")}</dd>
                            </div>
                            <div className={styles.row}>
                                <dt>
                                    <span className={styles.op} aria-hidden>÷</span> {ledger("meals")}
                                </dt>
                                <dd>{ledger("mealsValue")}</dd>
                            </div>
                            <div className={`${styles.row} ${styles.rowTotal}`}>
                                <dt>{ledger("rate")}</dt>
                                <dd>{ledger("rateValue")}</dd>
                            </div>
                            <div className={`${styles.row} ${styles.rowMember}`}>
                                <dt>
                                    {ledger("member")} <small>{ledger("memberMeals")}</small>
                                </dt>
                                <dd>{ledger("memberCost")}</dd>
                            </div>
                            <div className={styles.row}>
                                <dt>{ledger("deposited")}</dt>
                                <dd>{ledger("depositedValue")}</dd>
                            </div>
                            <div className={`${styles.row} ${styles.rowBalance}`}>
                                <dt>{ledger("balance")}</dt>
                                <dd>
                                    <mark>{ledger("balanceValue")}</mark>
                                </dd>
                            </div>
                        </dl>
                        <p className={styles.ledgerNote}>{ledger("note")}</p>
                    </figure>
                </section>

                <section className={styles.section} id="how">
                    <h2 className={styles.sectionTitle}>{t("steps.title")}</h2>
                    <ol className={styles.steps}>
                        {STEPS.map((k, i) => (
                            <li key={k} className={styles.step}>
                                <span className={styles.stepNum} aria-hidden>{num(i + 1)}</span>
                                <div>
                                    <h3 className={styles.itemTitle}>{t(`steps.${k}.title`)}</h3>
                                    <p className={styles.itemText}>{t(`steps.${k}.description`)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className={styles.section} id="features">
                    <div className={styles.sectionHead}>
                        <h2 className={styles.sectionTitle}>{t("features.title")}</h2>
                        <p className={styles.sectionSubtitle}>{t("features.subtitle")}</p>
                    </div>
                    <ul className={styles.index}>
                        {FEATURES.map((k) => (
                            <li key={k} className={styles.indexRow}>
                                <h3 className={styles.itemTitle}>{t(`features.${k}.title`)}</h3>
                                <p className={styles.itemText}>{t(`features.${k}.description`)}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.section} id="roles">
                    <h2 className={styles.sectionTitle}>{t("roles.title")}</h2>
                    <ul className={styles.roles}>
                        {ROLES.map((k) => (
                            <li key={k} className={styles.role}>
                                <h3 className={styles.itemTitle}>{t(`roles.${k}.title`)}</h3>
                                <p className={styles.itemText}>{t(`roles.${k}.description`)}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.closing} id="start">
                    <div>
                        <h2 className={styles.closingTitle}>{t("cta.title")}</h2>
                        <p className={styles.closingText}>{t("cta.subtitle")}</p>
                    </div>
                    <AuthLink
                        href={register}
                        memberHref={app}
                        label={t("cta.button")}
                        memberLabel={openApp}
                        className={styles.btnPrimary}
                        arrow
                    />
                </section>
            </main>

            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <span className={styles.logo}>
                        <KhataMark size={20} />
                        <span>{tc("appName")}</span>
                    </span>
                    <nav className={styles.footerLinks} aria-label={t("footer.nav")}>
                        <a href="#features">{t("footer.features")}</a>
                        <a href="#roles">{t("footer.roles")}</a>
                        <AuthLink href={login} memberHref={app} label={t("nav.signIn")} memberLabel={openApp} />
                        <AuthLink href={register} memberHref={app} label={t("footer.getStarted")} memberLabel={openApp} />
                        <Link href={`/${locale}/support`}>{t("footer.support")}</Link>
                        <Link href={`/${locale}/privacy`}>{t("footer.privacy")}</Link>
                        <Link href={`/${locale}/terms`}>{t("footer.terms")}</Link>
                    </nav>
                    <p className={styles.footerCopy}>{t("footer.copyright", { year })}</p>
                </div>
            </footer>

            <StickyCta watch={["hero-actions", "start"]} className={styles.stickyCta}>
                <AuthLink
                    href={register}
                    memberHref={app}
                    label={t("hero.cta")}
                    memberLabel={openApp}
                    className={`${styles.btnPrimary} ${styles.btnBlock}`}
                    arrow
                />
            </StickyCta>
        </div>
    );
}
