"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useConsoleData } from "../ConsoleAuth";
import { Filters, Pager, Pill, SearchBox, timeAgo } from "../ui";
import styles from "../console.module.css";

const SEVERITIES = ["all", "HIGH", "WARN", "INFO"] as const;

/** Surveillance: every sign-in, sign-up, code guess and rate limit hit, plus the noisiest sources. */
export default function ConsoleSecurityPage() {
    return (
        <Suspense>
            <SecurityFeed />
        </Suspense>
    );
}

function SecurityFeed() {
    const initialQ = useSearchParams().get("q") ?? "";
    const [q, setQ] = useState(initialQ);
    const [query, setQuery] = useState(initialQ);
    const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("all");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const id = setTimeout(() => {
            setQuery(q.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(id);
    }, [q]);

    const { data, error } = useConsoleData(
        (t) => api.platform.securityEvents({ q: query || undefined, severity: severity === "all" ? undefined : severity, page }, t),
        [query, severity, page]
    );

    return (
        <>
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>Security</h1>
                    <p className={styles.subtitle}>Sign-ins, sign-ups, invite code guesses and blocked requests.</p>
                </div>
            </div>

            <div className={styles.grid2} style={{ marginTop: 0, marginBottom: "var(--space-4)" }}>
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Noisiest IPs, 24h</h2>
                    </div>
                    <div className={styles.hotList}>
                        {data?.hotIps.length === 0 && <p className={styles.empty}>Nothing suspicious.</p>}
                        {data?.hotIps.map((h) => (
                            <div key={h.ip} className={styles.hotRow}>
                                <button type="button" onClick={() => setQ(h.ip)}>{h.ip}</button>
                                <Pill value={h.count >= 10 ? "HIGH" : "WARN"} label={`${h.count} hits`} />
                            </div>
                        ))}
                    </div>
                </section>
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Most targeted emails, 24h</h2>
                    </div>
                    <div className={styles.hotList}>
                        {data?.hotEmails.length === 0 && <p className={styles.empty}>Nothing suspicious.</p>}
                        {data?.hotEmails.map((h) => (
                            <div key={h.email} className={styles.hotRow}>
                                <button type="button" onClick={() => setQ(h.email)}>{h.email}</button>
                                <Pill value={h.count >= 10 ? "HIGH" : "WARN"} label={`${h.count} hits`} />
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <div className={styles.toolbar}>
                <SearchBox value={q} onChange={setQ} placeholder="Filter by email or IP" />
                <Filters options={SEVERITIES} value={severity} onChange={(s) => { setSeverity(s); setPage(1); }} />
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            <div className={styles.list}>
                {data?.events.length === 0 && <p className={styles.empty}>No events.</p>}
                {data?.events.map((e) => (
                    <div key={e.id} className={styles.row}>
                        <span className={styles.cellMain}>
                            <span className={styles.cellTitle}>{e.type.replaceAll("_", " ").toLowerCase()}</span>
                            <span className={styles.cellSub}>{e.email ?? "no email"} · {timeAgo(e.createdAt)}</span>
                        </span>
                        <span className={cn(styles.cellHideSm, styles.mono)}>{e.ip ?? "–"}</span>
                        <span className={styles.cellHideSm}>{new Date(e.createdAt).toLocaleString("en-GB")}</span>
                        <Pill value={e.severity} />
                    </div>
                ))}
            </div>
            {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
    );
}
