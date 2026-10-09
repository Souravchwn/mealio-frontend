"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ArrowUpRight, CloudSun, Link2, Moon, RefreshCw, Sun, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import type { TgHome, TgHomeLinked, TgSlot } from "@/types/telegram-app";
import styles from "./tg.module.css";

/* The bits of window.Telegram.WebApp this page uses */
interface TelegramWebApp {
    initData: string;
    initDataUnsafe: { user?: { first_name?: string; language_code?: string } };
    colorScheme: "light" | "dark";
    ready(): void;
    expand(): void;
    disableVerticalSwipes?(): void;
    openLink(url: string): void;
    openTelegramLink(url: string): void;
    onEvent(event: string, cb: () => void): void;
    offEvent(event: string, cb: () => void): void;
    HapticFeedback?: { impactOccurred(style: "light" | "medium"): void; notificationOccurred(type: "success" | "error"): void };
}
declare global {
    interface Window {
        Telegram?: { WebApp?: TelegramWebApp };
    }
}

type Slot = "breakfast" | "lunch" | "dinner";
const SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];
const SLOT_ICON = { breakfast: Sun, lunch: CloudSun, dinner: Moon } as const;

// Kept outside React so a language switch (a client-side route change) does not lose it
let initDataCache = "";

/** HH:MM now in the mess's time zone */
function nowIn(timezone: string): string {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date());
}
function minutesBetween(from: string, to: string): number {
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    return th * 60 + tm - (fh * 60 + fm);
}

export default function TelegramMiniApp() {
    const t = useTranslations("tg");
    const locale = useLocale();
    const { setTheme } = useTheme();

    const [tg, setTg] = useState<TelegramWebApp | null>(null);
    const [outside, setOutside] = useState(false);
    const [data, setData] = useState<TgHome | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [pull, setPull] = useState(0);
    const [slot, setSlot] = useState<Slot | null>(null);
    const [clock, setClock] = useState(0);
    const touchStart = useRef<number | null>(null);

    // Telegram's script: take its theme and language, then load the data
    const init = useCallback(() => {
        const app = window.Telegram?.WebApp;
        if (!app || !app.initData) {
            if (!initDataCache) setOutside(true);
            return;
        }
        initDataCache = app.initData;
        app.ready();
        app.expand();
        app.disableVerticalSwipes?.();
        setTheme(app.colorScheme);
        setTg(app);
        // Speak the person's Telegram language. A full load that KEEPS the #tgWebApp... hash, so
        // Telegram's script starts again with the same identity and theme.
        const lang = app.initDataUnsafe.user?.language_code ?? "";
        const want = lang.startsWith("bn") ? "bn" : "en";
        if (want !== locale) {
            window.location.replace(window.location.pathname.replace(`/${locale}/`, `/${want}/`) + window.location.search + window.location.hash);
        }
    }, [locale, setTheme]);

    // Load Telegram's script once (a plain script element, not a React <script>)
    useEffect(() => {
        if (window.Telegram?.WebApp) {
            init();
            return;
        }
        let tag = document.querySelector<HTMLScriptElement>("script[data-telegram-sdk]");
        if (!tag) {
            tag = document.createElement("script");
            tag.src = "https://telegram.org/js/telegram-web-app.js";
            tag.async = true;
            tag.dataset.telegramSdk = "1";
            document.head.appendChild(tag);
        }
        const onLoad = () => init();
        const onError = () => setOutside(true);
        tag.addEventListener("load", onLoad);
        tag.addEventListener("error", onError);
        return () => {
            tag?.removeEventListener("load", onLoad);
            tag?.removeEventListener("error", onError);
        };
    }, [init]);

    const load = useCallback(async (haptic: boolean) => {
        if (!initDataCache) return;
        setRefreshing(true);
        try {
            const home = await api.tg.home(initDataCache);
            setData(home);
            setError(null);
            if (haptic) window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
        } catch (e) {
            setError(e instanceof Error ? e.message : t("error"));
            if (haptic) window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
        } finally {
            setRefreshing(false);
        }
    }, [t]);

    // Load once Telegram is ready, again whenever the app comes back to the front
    useEffect(() => {
        if (!tg) return;
        void load(false);
        const onActive = () => void load(false);
        tg.onEvent("activated", onActive);
        return () => tg.offEvent("activated", onActive);
    }, [tg, load]);

    // Tick every 30 s so cutoff countdowns stay right
    useEffect(() => {
        const id = setInterval(() => setClock((n) => n + 1), 30_000);
        return () => clearInterval(id);
    }, []);

    // Pull down from the top to refresh
    const onTouchStart = (e: React.TouchEvent) => {
        touchStart.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onTouchMove = (e: React.TouchEvent) => {
        if (touchStart.current === null) return;
        setPull(Math.max(0, Math.min(90, e.touches[0].clientY - touchStart.current)));
    };
    const onTouchEnd = () => {
        if (pull > 64 && !refreshing) {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
            void load(true);
        }
        setPull(0);
        touchStart.current = null;
    };

    const linked = data?.linked ? (data as TgHomeLinked) : null;

    // The meal the cook is thinking about: the next one not locked yet
    const nextSlot: Slot = useMemo(() => {
        if (!linked?.today) return "lunch";
        return SLOTS.find((s) => !linked.today!.passed[s]) ?? "dinner";
    }, [linked]);
    const shownSlot = slot ?? nextSlot;

    const fmtDay = (iso: string) =>
        new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
    const fmtTime = (hhmm: string) =>
        new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(`1970-01-01T${hhmm}:00Z`));

    const countdown = useMemo(() => {
        void clock;
        if (!linked?.today) return null;
        const s = SLOTS.find((x) => !linked.today!.passed[x]);
        if (!s) return null;
        const mins = minutesBetween(nowIn(linked.mess.timezone), linked.today.cutoffs[s]);
        if (mins <= 0) return null;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return { slot: s, text: h > 0 ? t("inHoursMinutes", { h, m }) : t("inMinutes", { m }) };
    }, [linked, clock, t]);

    const openSite = (url: string) => (tg ? tg.openLink(url) : window.open(url, "_blank"));

    return (
        <div className={styles.app} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <div className={styles.pull} style={{ height: pull, opacity: pull / 64 }} aria-hidden>
                <RefreshCw size={18} style={{ transform: `rotate(${pull * 4}deg)` }} />
            </div>

            {outside && (
                <section className={styles.center}>
                    <span className={styles.bigEmoji} aria-hidden>🍽️</span>
                    <h1 className={styles.title}>{t("outsideTitle")}</h1>
                    <p className={styles.hint}>{t("outsideBody")}</p>
                </section>
            )}

            {!outside && !data && !error && (
                <div className={styles.stack} aria-busy="true">
                    <div className={cn(styles.skeleton, styles.skHead)} />
                    <div className={cn(styles.skeleton, styles.skCard)} />
                    <div className={cn(styles.skeleton, styles.skCard)} />
                </div>
            )}

            {error && (
                <section className={styles.center}>
                    <p className={styles.hint}>{error}</p>
                    <button type="button" className={styles.primary} onClick={() => void load(true)}>{t("tryAgain")}</button>
                </section>
            )}

            {data && !data.linked && (
                <section className={styles.center}>
                    <span className={styles.bigEmoji} aria-hidden>👋</span>
                    <h1 className={styles.title}>{t("unlinkedTitle", { name: data.firstName })}</h1>
                    <p className={styles.hint}>{t("unlinkedBody")}</p>
                    <button type="button" className={styles.primary} onClick={() => openSite(data.linkUrl)}>
                        <Link2 size={18} /> {t("linkButton")}
                    </button>
                    <p className={styles.small}>{t("unlinkedAfter")}</p>
                </section>
            )}

            {linked && (
                <div className={styles.stack}>
                    {/* Header */}
                    <header className={styles.header}>
                        <div>
                            <p className={styles.kicker}>{linked.mess.name}</p>
                            <h1 className={styles.title}>{t("hi", { name: linked.member.name.split(" ")[0] })}</h1>
                            <p className={styles.small}>{t("period", { from: fmtDay(linked.mess.periodStart), to: fmtDay(linked.mess.periodEnd) })}</p>
                        </div>
                        <button
                            type="button"
                            className={cn(styles.iconBtn, refreshing && styles.spinning)}
                            onClick={() => { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light"); void load(true); }}
                            aria-label={t("refresh")}
                        >
                            <RefreshCw size={18} />
                        </button>
                    </header>

                    {/* My money */}
                    <section className={cn(styles.card, styles.moneyCard, linked.money.balance >= 0 ? styles.ahead : styles.behind)}>
                        <p className={styles.cardLabel}>{t("myBalance")}</p>
                        <p className={styles.balance}>
                            {linked.money.balance < 0 && "−"}{formatCurrency(Math.abs(linked.money.balance))}
                        </p>
                        <p className={styles.balanceNote}>{linked.money.balance >= 0 ? t("getBack") : t("owe")}</p>
                        <div className={styles.statRow}>
                            <div><span>{t("meals")}</span><b>{linked.money.meals}</b></div>
                            <div><span>{t("paid")}</span><b>{formatCurrency(linked.money.deposited)}</b></div>
                            <div><span>{t("rate")}</span><b>{formatCurrency(linked.money.mealRate)}</b></div>
                        </div>
                        {linked.money.carriedIn !== 0 && (
                            <p className={styles.small}>{t("carriedIn", { amount: formatCurrency(linked.money.carriedIn) })}</p>
                        )}
                    </section>

                    {/* Today, mine */}
                    {linked.today && (
                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <p className={styles.cardLabel}>{t("myToday")}</p>
                                {countdown && <span className={styles.badge}>{t("locks", { meal: t(`slot.${countdown.slot}`), time: countdown.text })}</span>}
                            </div>
                            <div className={styles.mealRow}>
                                {SLOTS.map((s) => {
                                    const n = linked.today![s];
                                    const Icon = SLOT_ICON[s];
                                    return (
                                        <div key={s} className={cn(styles.meal, n > 0 ? styles.mealOn : styles.mealOff)}>
                                            <Icon size={20} />
                                            <span className={styles.mealName}>{t(`slot.${s}`)}</span>
                                            <b>{n > 0 ? (n > 1 ? `×${n}` : t("on")) : t("off")}</b>
                                        </div>
                                    );
                                })}
                            </div>
                            {linked.today.guests > 0 && <p className={styles.small}>{t("guests", { n: linked.today.guests })}</p>}
                            <p className={styles.small}>{t("changeHint")}</p>
                        </section>
                    )}

                    {/* Who is eating today */}
                    {linked.headcount && (
                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <p className={styles.cardLabel}><Users size={14} /> {t("whoEats")}</p>
                            </div>
                            <div className={styles.segment} role="tablist">
                                {SLOTS.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        role="tab"
                                        aria-selected={shownSlot === s}
                                        className={styles.segBtn}
                                        onClick={() => { setSlot(s); window.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light"); }}
                                    >
                                        {t(`slot.${s}`)} <span>{linked.headcount![s].total}</span>
                                    </button>
                                ))}
                            </div>
                            <SlotPeople slot={linked.headcount[shownSlot]} t={t} fmtTime={fmtTime} />
                        </section>
                    )}

                    <button type="button" className={styles.linkOut} onClick={() => openSite(`${linked.siteUrl}/${locale}/overview`)}>
                        {t("openFull")} <ArrowUpRight size={16} />
                    </button>
                    <p className={cn(styles.small, styles.centerText)}>{t("readOnly")}</p>
                </div>
            )}
        </div>
    );
}

function SlotPeople({ slot, t, fmtTime }: { slot: TgSlot; t: ReturnType<typeof useTranslations>; fmtTime: (s: string) => string }) {
    return (
        <>
            <p className={styles.headcount}>
                <b>{slot.total}</b> {t("plates")}
                {slot.guests > 0 && <span> · {t("guestPlates", { n: slot.guests })}</span>}
                <span className={styles.small}> · {t("locksAt", { time: fmtTime(slot.cutoffTime) })}</span>
            </p>
            {slot.people.length === 0 ? (
                <p className={styles.small}>{t("nobody")}</p>
            ) : (
                <ul className={styles.people}>
                    {slot.people.map((p) => (
                        <li key={p.name}>
                            {p.name}
                            {p.count > 1 && <em>×{p.count}</em>}
                            {p.guests > 0 && <em>+{p.guests}</em>}
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
