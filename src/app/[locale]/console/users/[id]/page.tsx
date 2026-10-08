"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, KeyRound, LogOut, Mail, Unlink, UserCheck, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { UserAction } from "@/types/platform";
import { useConsoleAuth, useConsoleData } from "../../ConsoleAuth";
import { Pill, timeAgo, toneOf } from "../../ui";
import styles from "../../console.module.css";

export default function ConsoleUserDetail() {
    const locale = useLocale();
    const { id } = useParams<{ id: string }>();
    const { token } = useConsoleAuth();
    const { data: u, error, reload } = useConsoleData((t) => api.platform.user(id, t), [id]);
    const [busy, setBusy] = useState(false);
    const [code, setCode] = useState<{ code: string; minutes: number } | null>(null);
    const [emailOpen, setEmailOpen] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const base = `/${locale}/console`;

    async function act(action: UserAction, confirmText?: string) {
        if (!token || (confirmText && !window.confirm(confirmText))) return;
        setBusy(true);
        try {
            const res = await api.platform.userAction(id, action, token);
            if (res.code) setCode({ code: res.code, minutes: res.minutes ?? 30 });
            else toast.success("Done");
            setEmailOpen(false);
            reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
        } finally {
            setBusy(false);
        }
    }

    const back = (
        <Link href={`${base}/users`} className={styles.backLink}>
            <ArrowLeft size={16} /> Users
        </Link>
    );

    if (error) return <>{back}<p className={styles.errorBox}>{error}</p></>;
    if (!u) return back;

    const deleted = u.status === "DELETED";

    return (
        <>
            {back}
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>{u.name}</h1>
                    <p className={styles.subtitle}>{u.email}</p>
                </div>
                <Pill value={u.status} />
            </div>

            {!deleted && (
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Actions</h2>
                    </div>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.actionBtn}
                            disabled={busy}
                            onClick={() => void act({ action: "reset_code" }, `Make a one-time password reset code for ${u.email}? Share it only after you confirm who is asking.`)}
                        >
                            <KeyRound size={16} /> Reset code
                        </button>
                        {!u.emailVerified && (
                            <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => void act({ action: "verify_email" })}>
                                <BadgeCheck size={16} /> Mark email verified
                            </button>
                        )}
                        <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => setEmailOpen((v) => !v)}>
                            <Mail size={16} /> Change email
                        </button>
                        {u.telegramLinked && (
                            <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => void act({ action: "unlink_telegram" }, "Unlink this Telegram account?")}>
                                <Unlink size={16} /> Unlink Telegram
                            </button>
                        )}
                        <button
                            type="button"
                            className={styles.actionBtn}
                            disabled={busy}
                            onClick={() => void act({ action: "sign_out_everywhere" }, "Sign this person out on every device?")}
                        >
                            <LogOut size={16} /> Sign out everywhere
                        </button>
                        {u.status === "ACTIVE" ? (
                            <button
                                type="button"
                                className={cn(styles.actionBtn, styles.actionDanger)}
                                disabled={busy}
                                onClick={() => void act({ action: "deactivate" }, `Deactivate ${u.name}? Their meals stop counting from today.`)}
                            >
                                <UserX size={16} /> Deactivate
                            </button>
                        ) : (
                            <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => void act({ action: "reactivate" })}>
                                <UserCheck size={16} /> Reactivate
                            </button>
                        )}
                    </div>

                    {emailOpen && (
                        <form
                            className={styles.inlineForm}
                            onSubmit={(e) => {
                                e.preventDefault();
                                void act({ action: "change_email", email: newEmail.trim() });
                            }}
                        >
                            <input
                                className={styles.input}
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="New email address"
                                required
                            />
                            <button type="submit" className={styles.actionBtn} disabled={busy}>
                                Save email
                            </button>
                        </form>
                    )}

                    {code && (
                        <div className={styles.secret}>
                            <span className={styles.kvLabel}>One-time reset code</span>
                            <b>{code.code}</b>
                            <span className={styles.subtitle}>
                                Valid for {code.minutes} minutes. They enter it with their email at /reset-password.
                            </span>
                        </div>
                    )}
                </section>
            )}

            <div className={styles.grid2}>
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Profile</h2>
                    </div>
                    <div className={styles.kv}>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Mess</span>
                            <span className={styles.kvValue}>
                                {u.mess ? <Link href={`${base}/messes/${u.mess.id}`} className={styles.cardLink}>{u.mess.name}</Link> : "None"}
                            </span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Role</span>
                            <span className={styles.kvValue}>{u.role.toLowerCase()}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Phone</span>
                            <span className={styles.kvValue}>{u.phone ?? "–"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Email</span>
                            <span className={styles.kvValue}>{u.emailVerified ? "Verified" : "Not verified"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Telegram</span>
                            <span className={styles.kvValue}>{u.telegramLinked ? "Linked" : "Not linked"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Joined</span>
                            <span className={styles.kvValue}>{timeAgo(u.joinedAt)}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Last sign-in</span>
                            <span className={styles.kvValue}>{timeAgo(u.lastLoginAt)}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Password changed</span>
                            <span className={styles.kvValue}>{timeAgo(u.passwordChangedAt)}</span>
                        </div>
                    </div>
                </section>

                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Security events</h2>
                        <Link href={`${base}/security?q=${encodeURIComponent(u.email)}`} className={styles.cardLink}>All</Link>
                    </div>
                    <div className={styles.feed}>
                        {u.events.length === 0 && <p className={styles.empty}>No events.</p>}
                        {u.events.slice(0, 12).map((e) => (
                            <div key={e.id} className={styles.feedItem}>
                                <span className={styles.dot} data-tone={toneOf(e.severity)} />
                                <span className={styles.cellMain}>
                                    <span className={styles.cellTitle}>{e.type.replaceAll("_", " ").toLowerCase()}</span>
                                    <span className={cn(styles.cellSub, styles.mono)}>{e.ip ?? "no ip"}</span>
                                </span>
                                <span className={styles.feedTime}>{timeAgo(e.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {u.tickets.length > 0 && (
                    <section className={cn(styles.card, styles.wide)}>
                        <div className={styles.cardHead}>
                            <h2 className={styles.cardTitle}>Support tickets</h2>
                        </div>
                        <div className={styles.list}>
                            {u.tickets.map((tk) => (
                                <Link key={tk.id} href={`${base}/support/${tk.id}`} className={cn(styles.row, styles.rowSimple)}>
                                    <span className={styles.cellMain}>
                                        <span className={styles.cellTitle}>{tk.subject}</span>
                                        <span className={styles.cellSub}>updated {timeAgo(tk.updatedAt)}</span>
                                    </span>
                                    <Pill value={tk.status} />
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </>
    );
}
