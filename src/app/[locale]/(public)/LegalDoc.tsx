"use client";

import { useTranslations } from "next-intl";
import styles from "./public.module.css";

type Section = { heading: string; paragraphs?: string[]; bullets?: string[] };

/** Renders a legal page from messages: legal.<doc>.{title, lead, updated, sections[]} */
export function LegalDoc({ doc }: { doc: "privacy" | "terms" }) {
    const t = useTranslations(`legal.${doc}`);
    const sections = t.raw("sections") as Section[];

    return (
        <>
            <span className={styles.eyebrow}>{t("eyebrow")}</span>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.lead}>{t("lead")}</p>
            <p className={styles.updated}>{t("updated")}</p>
            <article className={styles.prose}>
                {sections.map((s) => (
                    <section key={s.heading}>
                        <h2>{s.heading}</h2>
                        {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
                        {s.bullets && (
                            <ul>
                                {s.bullets.map((b) => <li key={b}>{b}</li>)}
                            </ul>
                        )}
                    </section>
                ))}
            </article>
        </>
    );
}
