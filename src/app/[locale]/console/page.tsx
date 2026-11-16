"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { Activity, Building2, CalendarCheck, LifeBuoy, Repeat, ShieldAlert, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useConsoleAuth, useConsoleData } from "./ConsoleAuth";
import { Pill, timeAgo, toneOf } from "./ui";
import styles from "./console.module.css";

export default function ConsoleDashboard() {
    const locale = useLocale();
    const { admin } = useConsoleAuth();
    const { data, error } = useConsoleData((t) => api.platform.stats(t), []);
    const base = `/${locale}/console`;

    if (error) return <p className={styles.errorBox}>{error}</p>;

    const max = Math.max(1, ...(data?.signups ?? []).map((d) => d.members + d.messes));
    const usage = data?.usage;
    const maxActive = Math.max(1, ...(usage?.daily ?? []).map((d) => d.people));

    return (
        <>
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>Hi {admin?.name?.split(" ")[0] ?? "there"}</h1>
                    <p className={styles.subtitle}>What is happening across every mess right now.</p>
                </div>
            </div>

            <div className={styles.statGrid}>
                <div className={cn(styles.stat, styles.statHot)}>
                    <span className={styles.statLabel}><Building2 size={14} /> Messes</span>
                    <span className={styles.statValue}>{data?.messes.active ?? "–"}</span>
                    <span className={styles.statHint}>
                        active, {data?.messes.newThisWeek ?? 0} new this week
                    </span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}><Users size={14} /> Users</span>
                    <span className={styles.statValue}>{data?.members.total ?? "–"}</span>
                    <span className={styles.statHint}>
                        {data?.members.activeToday ?? 0} signed in today, {data?.members.pending ?? 0} waiting
                    </span>
                </div>
                <Link href={`${base}/support`} className={cn(styles.stat, (data?.support.high ?? 0) > 0 && styles.statWarn)}>
                    <span className={styles.statLabel}><LifeBuoy size={14} /> Open tickets</span>
                    <span className={styles.statValue}>{data?.support.open ?? "–"}</span>
                    <span className={styles.statHint}>{data?.support.high ?? 0} high priority</span>
                </Link>
                <Link href={`${base}/security`} className={cn(styles.stat, (data?.security.highEventsDay ?? 0) > 0 && styles.statWarn)}>
                    <span className={styles.statLabel}><ShieldAlert size={14} /> Failed logins</span>
                    <span className={styles.statValue}>{data?.security.failedLoginsDay ?? "–"}</span>
                    <span className={styles.statHint}>last 24h, {data?.security.highEventsDay ?? 0} high alerts</span>
                </Link>
            </div>

            <h2 className={styles.sectionTitle}>Usage</h2>
            <div className={styles.statGrid}>
                <div className={styles.stat}>
                    <span className={styles.statLabel}><Activity size={14} /> Active messes</span>
                    <span className={styles.statValue}>{usage?.activeMessesWeek ?? "–"}</span>
                    <span className={styles.statHint}>used in the last 7 days</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}><Users size={14} /> Active people</span>
                    <span className={styles.statValue}>{usage?.activePeopleWeek ?? "–"}</span>
                    <span className={styles.statHint}>
                        {usage?.activePeopleToday ?? 0} today · web {usage?.peopleByChannelWeek.web ?? 0},
                        bot {usage?.peopleByChannelWeek.telegram ?? 0}, mini app {usage?.peopleByChannelWeek.miniApp ?? 0}
                    </span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}><CalendarCheck size={14} /> Closed 2+ months</span>
                    <span className={styles.statValue}>{usage?.messesClosedTwo ?? "–"}</span>
                    <span className={styles.statHint}>{usage?.messesClosedOne ?? 0} messes closed at least one</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statLabel}><Repeat size={14} /> Second-week return</span>
                    <span className={styles.statValue}>
                        {usage && usage.secondWeek.cohort > 0
                            ? `${Math.round((usage.secondWeek.retained / usage.secondWeek.cohort) * 100)}%`
                            : "–"}
                    </span>
                    <span className={styles.statHint}>
                        {usage?.secondWeek.retained ?? 0} of {usage?.secondWeek.cohort ?? 0} messes made 8–14 days ago
                    </span>
                </div>
            </div>

            <div className={styles.grid2}>
                <section className={cn(styles.card, styles.wide)}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>People using it each day, last 14 days</h2>
                    </div>
                    <div className={styles.chart} role="img" aria-label="People who used ManagerBabu each day for the last 14 days">
                        {usage?.daily.map((d) => (
                            <div key={d.date} className={styles.barCol} title={`${d.date}: ${d.people} people in ${d.messes} messes`}>
                                <div className={styles.bar} style={{ height: `${(d.people / maxActive) * 100}%` }} />
                            </div>
                        ))}
                    </div>
                    <div className={styles.chartAxis} aria-hidden>
                        {usage?.daily.map((d, i) => (
                            <span key={d.date}>{i % 2 === 0 ? Number(d.date.slice(8)) : ""}</span>
                        ))}
                    </div>
                </section>

                <section className={cn(styles.card, styles.wide)}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Sign-ups, last 14 days</h2>
                        <div className={styles.legend}>
                            <span><i /> People</span>
                            <span><i className={styles.barMess} /> Messes</span>
                        </div>
                    </div>
                    <div className={styles.chart} role="img" aria-label="Daily sign-ups for the last 14 days">
                        {data?.signups.map((d) => (
                            <div key={d.date} className={styles.barCol} title={`${d.date}: ${d.members} people, ${d.messes} messes`}>
                                <div className={cn(styles.bar, styles.barMess)} style={{ height: `${(d.messes / max) * 100}%` }} />
                                <div className={styles.bar} style={{ height: `${(d.members / max) * 100}%` }} />
                            </div>
                        ))}
                    </div>
                    <div className={styles.chartAxis} aria-hidden>
                        {data?.signups.map((d, i) => (
                            <span key={d.date}>{i % 2 === 0 ? Number(d.date.slice(8)) : ""}</span>
                        ))}
                    </div>
                </section>

                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Newest messes</h2>
                        <Link href={`${base}/messes`} className={styles.cardLink}>All</Link>
                    </div>
                    <div className={styles.feed}>
                        {data?.recentMesses.length === 0 && <p className={styles.empty}>No messes yet.</p>}
                        {data?.recentMesses.map((m) => (
                            <Link key={m.id} href={`${base}/messes/${m.id}`} className={styles.feedItem}>
                                <span className={styles.dot} />
                                <span className={styles.cellMain}>
                                    <span className={styles.cellTitle}>{m.name}</span>
                                    <span className={styles.cellSub}>{m.members} members, {m.plan}</span>
                                </span>
                                <span className={styles.feedTime}>{timeAgo(m.createdAt)}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Security alerts</h2>
                        <Link href={`${base}/security`} className={styles.cardLink}>All</Link>
                    </div>
                    <div className={styles.feed}>
                        {data?.recentEvents.length === 0 && <p className={styles.empty}>All quiet.</p>}
                        {data?.recentEvents.map((e) => (
                            <div key={e.id} className={styles.feedItem}>
                                <span className={styles.dot} data-tone={toneOf(e.severity) === "bad" ? "bad" : "warn"} />
                                <span className={styles.cellMain}>
                                    <span className={styles.cellTitle}>{e.type.replaceAll("_", " ").toLowerCase()}</span>
                                    <span className={styles.cellSub}>{e.email ?? e.ip ?? "unknown"}</span>
                                </span>
                                <span className={styles.feedTime}>{timeAgo(e.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {data && (
                <div className={styles.pills} style={{ marginTop: "var(--space-4)" }}>
                    <Pill value="ACTIVE" label={`${data.messes.active} active`} />
                    <Pill value="SUSPENDED" label={`${data.messes.suspended} suspended`} />
                    <Pill value="INACTIVE" label={`${data.messes.deleted} deleted`} />
                    <Pill value="PENDING" label={`${data.members.pending} join requests`} />
                </div>
            )}
        </>
    );
}
