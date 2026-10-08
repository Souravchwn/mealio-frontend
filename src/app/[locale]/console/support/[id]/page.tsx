"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Select } from "@/components/ui/Select/Select";
import { api } from "@/lib/api";
import { useConsoleAuth, useConsoleData } from "../../ConsoleAuth";
import { Pill, timeAgo } from "../../ui";
import styles from "../../console.module.css";

const STATUSES = ["OPEN", "WAITING_ON_USER", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;

export default function ConsoleTicketPage() {
    const locale = useLocale();
    const { id } = useParams<{ id: string }>();
    const { token } = useConsoleAuth();
    const { data: tk, error, reload } = useConsoleData((t) => api.platform.ticket(id, t), [id]);
    const [reply, setReply] = useState("");
    const [afterStatus, setAfterStatus] = useState<string>("WAITING_ON_USER");
    const [busy, setBusy] = useState(false);
    const base = `/${locale}/console`;

    async function send(e: React.FormEvent) {
        e.preventDefault();
        if (!token || !reply.trim()) return;
        setBusy(true);
        try {
            await api.platform.replyTicket(id, { body: reply.trim(), status: afterStatus }, token);
            setReply("");
            toast.success("Reply sent");
            reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
        } finally {
            setBusy(false);
        }
    }

    async function update(data: { status?: string; priority?: string }) {
        if (!token) return;
        try {
            await api.platform.updateTicket(id, data, token);
            reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
        }
    }

    const back = (
        <Link href={`${base}/support`} className={styles.backLink}>
            <ArrowLeft size={16} /> Support
        </Link>
    );

    if (error) return <>{back}<p className={styles.errorBox}>{error}</p></>;
    if (!tk) return back;

    return (
        <>
            {back}
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>{tk.subject}</h1>
                    <p className={styles.subtitle}>
                        {tk.name} · {tk.email} · opened {timeAgo(tk.createdAt)}
                    </p>
                </div>
                <Pill value={tk.status} />
            </div>

            <div className={styles.grid2}>
                <section className={styles.card}>
                    <div className={styles.kv}>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Status</span>
                            <Select
                                className={styles.select}
                                value={tk.status}
                                onChange={(v) => void update({ status: v })}
                                aria-label="Status"
                                options={STATUSES.map((v) => ({ value: v, label: v.replaceAll("_", " ").toLowerCase() }))}
                            />
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Priority</span>
                            <Select
                                className={styles.select}
                                value={tk.priority}
                                onChange={(v) => void update({ priority: v })}
                                aria-label="Priority"
                                options={PRIORITIES.map((v) => ({ value: v, label: v.toLowerCase() }))}
                            />
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Category</span>
                            <span className={styles.kvValue}>{tk.category.toLowerCase()}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Mess</span>
                            <span className={styles.kvValue}>
                                {tk.mess ? <Link href={`${base}/messes/${tk.mess.id}`} className={styles.cardLink}>{tk.mess.name}</Link> : "Not signed in"}
                            </span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Person</span>
                            <span className={styles.kvValue}>
                                {tk.memberId ? (
                                    <Link href={`${base}/users/${tk.memberId}`} className={styles.cardLink}>Open profile</Link>
                                ) : (
                                    <Link href={`${base}/users?q=${encodeURIComponent(tk.email)}`} className={styles.cardLink}>Find by email</Link>
                                )}
                            </span>
                        </div>
                    </div>
                </section>

                <section className={`${styles.card} ${styles.wide}`}>
                    <div className={styles.thread}>
                        {tk.messages?.map((m) => (
                            <div key={m.id} className={styles.bubble} data-author={m.authorType}>
                                <span className={styles.bubbleMeta}>
                                    {m.authorName} · {timeAgo(m.createdAt)}
                                </span>
                                {m.body}
                            </div>
                        ))}
                    </div>

                    <form onSubmit={send} style={{ marginTop: "var(--space-5)" }}>
                        <textarea
                            className={styles.textarea}
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder={`Reply to ${tk.name}. They also get it by email when email is set up.`}
                            maxLength={5000}
                            aria-label="Reply"
                        />
                        <div className={styles.replyActions}>
                            <Select
                                className={styles.select}
                                value={afterStatus}
                                onChange={setAfterStatus}
                                aria-label="Status after reply"
                                options={STATUSES.map((v) => ({ value: v, label: `then ${v.replaceAll("_", " ").toLowerCase()}` }))}
                            />
                            <Button type="submit" loading={busy} disabled={!reply.trim()}>
                                <Send size={16} /> Send reply
                            </Button>
                        </div>
                    </form>
                </section>
            </div>
        </>
    );
}
