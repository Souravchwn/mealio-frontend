"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Ban, CircleCheck, RefreshCw, RotateCcw, Trash2, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import { PLAN_KEYS, PLANS } from "@/lib/plans";
import { Select } from "@/components/ui/Select/Select";
import type { MessAction } from "@/types/platform";
import { useConsoleAuth, useConsoleData } from "../../ConsoleAuth";
import { Pill, timeAgo } from "../../ui";
import styles from "../../console.module.css";

export default function ConsoleMessDetail() {
    const locale = useLocale();
    const { id } = useParams<{ id: string }>();
    const { token } = useConsoleAuth();
    const { data: m, error, reload } = useConsoleData((t) => api.platform.mess(id, t), [id]);
    const [busy, setBusy] = useState(false);
    const [suspendOpen, setSuspendOpen] = useState(false);
    const [reason, setReason] = useState("");
    const base = `/${locale}/console`;

    async function act(action: MessAction, confirmText?: string) {
        if (!token || (confirmText && !window.confirm(confirmText))) return;
        setBusy(true);
        try {
            const res = await api.platform.messAction(id, action, token);
            toast.success(res.inviteCode ? `New invite code: ${res.inviteCode}` : "Done");
            setSuspendOpen(false);
            setReason("");
            reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
        } finally {
            setBusy(false);
        }
    }

    const back = (
        <Link href={`${base}/messes`} className={styles.backLink}>
            <ArrowLeft size={16} /> Messes
        </Link>
    );

    if (error) return <>{back}<p className={styles.errorBox}>{error}</p></>;
    if (!m) return back;

    const activeMembers = m.members.filter((x) => x.isActive && !x.deleted).length;

    return (
        <>
            {back}
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>{m.name}</h1>
                    <p className={styles.subtitle}>
                        Created {timeAgo(m.createdAt)} · {activeMembers} active of {PLANS[m.plan as keyof typeof PLANS]?.maxMembers ?? "?"} allowed
                    </p>
                </div>
                <Pill value={m.status} />
            </div>

            {m.status === "SUSPENDED" && (
                <div className={styles.banner} data-tone="bad">
                    <Ban size={18} /> Suspended {timeAgo(m.suspendedAt)}: {m.suspendedReason}
                </div>
            )}
            {m.status === "DELETED" && (
                <div className={styles.banner}>
                    <Trash2 size={18} /> Deleted {timeAgo(m.deletedAt)}. Members cannot sign in. Restore brings it back as it was.
                </div>
            )}

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <h2 className={styles.cardTitle}>Actions</h2>
                </div>
                <div className={styles.actions}>
                    {m.status === "SUSPENDED" ? (
                        <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => void act({ action: "unsuspend" })}>
                            <CircleCheck size={16} /> Lift suspension
                        </button>
                    ) : m.status !== "DELETED" ? (
                        <button type="button" className={cn(styles.actionBtn, styles.actionDanger)} disabled={busy} onClick={() => setSuspendOpen((v) => !v)}>
                            <Ban size={16} /> Suspend
                        </button>
                    ) : null}
                    {m.status === "DELETED" ? (
                        <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => void act({ action: "restore" })}>
                            <RotateCcw size={16} /> Restore
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={cn(styles.actionBtn, styles.actionDanger)}
                            disabled={busy}
                            onClick={() => void act({ action: "delete" }, `Delete "${m.name}"? Members are signed out. You can restore it later.`)}
                        >
                            <Trash2 size={16} /> Delete
                        </button>
                    )}
                    <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={busy}
                        onClick={() => void act({ action: "rotate_invite" }, "Make a new invite code? The old one stops working.")}
                    >
                        <RefreshCw size={16} /> New invite code
                    </button>
                    <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={busy}
                        onClick={() => void act({ action: "set_join_approval", value: !m.requireJoinApproval })}
                    >
                        <UserCheck size={16} /> {m.requireJoinApproval ? "Let people join without approval" : "Require join approval"}
                    </button>
                </div>
                {suspendOpen && (
                    <form
                        className={styles.inlineForm}
                        onSubmit={(e) => {
                            e.preventDefault();
                            void act({ action: "suspend", reason: reason.trim() });
                        }}
                    >
                        <input
                            className={styles.input}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason (members of this mess see a generic message)"
                            maxLength={300}
                            required
                        />
                        <button type="submit" className={cn(styles.actionBtn, styles.actionDanger)} disabled={busy || !reason.trim()}>
                            Confirm suspension
                        </button>
                    </form>
                )}
            </section>

            <div className={styles.grid2}>
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Details</h2>
                    </div>
                    <div className={styles.kv}>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Invite code</span>
                            <span className={cn(styles.kvValue, styles.mono)}>{m.inviteCode}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Plan</span>
                            <Select
                                className={styles.select}
                                value={m.plan}
                                disabled={busy}
                                onChange={(v) => void act({ action: "set_plan", plan: v })}
                                aria-label="Plan"
                                options={PLAN_KEYS.map((p) => ({
                                    value: p,
                                    label: `${PLANS[p].label} (${PLANS[p].maxMembers} members)`,
                                }))}
                            />
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Join approval</span>
                            <span className={styles.kvValue}>{m.requireJoinApproval ? "Required" : "Off"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Telegram group</span>
                            <span className={styles.kvValue}>{m.telegramGroup ? `${m.telegramGroup.chatName ?? "Linked"} (${m.telegramGroup.timezone})` : "Not linked"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Current period</span>
                            <span className={styles.kvValue}>{m.period ? `${m.period.start} to ${m.period.end}` : "None"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Meal rate</span>
                            <span className={cn(styles.kvValue, "num")}>{m.money ? formatCurrency(m.money.mealRate) : "–"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Spent this period</span>
                            <span className={cn(styles.kvValue, "num")}>{m.money ? formatCurrency(m.money.totalExpense) : "–"}</span>
                        </div>
                        <div className={styles.kvItem}>
                            <span className={styles.kvLabel}>Meals this period</span>
                            <span className={cn(styles.kvValue, "num")}>{m.money?.totalMeals ?? "–"}</span>
                        </div>
                    </div>
                </section>

                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Recent activity</h2>
                        <Link href={`${base}/audit?source=mess&mess=${m.id}`} className={styles.cardLink}>Full log</Link>
                    </div>
                    <div className={styles.feed}>
                        {m.recentActivity.length === 0 && <p className={styles.empty}>Nothing yet.</p>}
                        {m.recentActivity.map((a) => (
                            <div key={a.id} className={styles.feedItem}>
                                <span className={styles.dot} />
                                <span className={styles.cellMain}>
                                    <span className={styles.cellTitle}>{a.action.replaceAll("_", " ").toLowerCase()}</span>
                                    <span className={styles.cellSub}>{a.actor}</span>
                                </span>
                                <span className={styles.feedTime}>{timeAgo(a.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={cn(styles.card, styles.wide)}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Members ({m.members.length})</h2>
                    </div>
                    <div className={styles.list}>
                        {m.members.map((u) => (
                            <Link key={u.id} href={`${base}/users/${u.id}`} className={styles.row}>
                                <span className={styles.cellMain}>
                                    <span className={styles.cellTitle}>
                                        {u.name} {u.id === m.ownerId && <small>(owner)</small>}
                                    </span>
                                    <span className={styles.cellSub}>{u.email}</span>
                                </span>
                                <span className={styles.cellHideSm}>{u.role.toLowerCase()}</span>
                                <span className={styles.cellHideSm}>last seen {timeAgo(u.lastLoginAt)}</span>
                                <Pill
                                    value={u.deleted ? "DELETED" : u.joinStatus !== "APPROVED" ? u.joinStatus : u.isActive ? "ACTIVE" : "INACTIVE"}
                                />
                            </Link>
                        ))}
                    </div>
                </section>

                {m.tickets.length > 0 && (
                    <section className={cn(styles.card, styles.wide)}>
                        <div className={styles.cardHead}>
                            <h2 className={styles.cardTitle}>Support tickets</h2>
                        </div>
                        <div className={styles.list}>
                            {m.tickets.map((tk) => (
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
