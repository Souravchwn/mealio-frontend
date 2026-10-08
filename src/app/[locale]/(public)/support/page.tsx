"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronRight, Copy, LifeBuoy, Send, Check } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime } from "@/lib/utils";
import type { SupportTicket } from "@/types";
import styles from "../public.module.css";

const CATEGORIES = ["ACCOUNT", "BILLING", "BUG", "ABUSE", "OTHER"] as const;

/**
 * Contact support. Signed-in people see their tickets and skip the name and
 * email fields. Anyone else gets a private link to follow the conversation.
 */
export default function SupportPage() {
    const t = useTranslations("support");
    const locale = useLocale();
    const { user, token, isAuthenticated, isLoading } = useAuth();

    const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("OTHER");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [created, setCreated] = useState<{ id: string; accessKey: string | null } | null>(null);
    const [copied, setCopied] = useState(false);
    const [tickets, setTickets] = useState<SupportTicket[] | null>(null);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.support
            .mine(token)
            .then((r) => !cancelled && setTickets(r.tickets))
            .catch(() => !cancelled && setTickets([]));
        return () => {
            cancelled = true;
        };
    }, [token, created]);

    const ticketHref = (id: string, key?: string | null) =>
        `/${locale}/support/${id}${key ? `?key=${encodeURIComponent(key)}` : ""}`;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            const res = await api.support.create(
                { category, subject, message, ...(isAuthenticated ? {} : { name, email }) },
                token
            );
            setCreated(res);
            setSubject("");
            setMessage("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error"));
        } finally {
            setSending(false);
        }
    };

    const copyLink = async (href: string) => {
        try {
            await navigator.clipboard.writeText(window.location.origin + href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error(t("copyFailed"));
        }
    };

    return (
        <>
            <span className={styles.eyebrow}><LifeBuoy size={14} /> {t("eyebrow")}</span>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.lead}>{isAuthenticated ? t("leadSignedIn", { name: user?.name ?? "" }) : t("lead")}</p>

            <section className={styles.card}>
                {created ? (
                    <div className={styles.success}>
                        <span className={styles.successIcon}><Check size={26} strokeWidth={3} /></span>
                        <h2 className={styles.threadTitle}>{t("sentTitle")}</h2>
                        <p>{created.accessKey ? t("sentBodyGuest") : t("sentBody")}</p>
                        {created.accessKey && (
                            <div className={styles.keyBox}>
                                <span>{typeof window !== "undefined" ? window.location.origin : ""}{ticketHref(created.id, created.accessKey)}</span>
                                <button
                                    type="button"
                                    className={styles.iconBtn}
                                    onClick={() => copyLink(ticketHref(created.id, created.accessKey))}
                                    aria-label={t("copyLink")}
                                >
                                    {copied ? <Check size={18} /> : <Copy size={18} />}
                                </button>
                            </div>
                        )}
                        <div className={styles.chips}>
                            <Link href={ticketHref(created.id, created.accessKey)} className={styles.chip} aria-pressed="true">
                                {t("openTicket")}
                            </Link>
                            <button type="button" className={styles.chip} onClick={() => setCreated(null)}>
                                {t("another")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <form className={styles.form} onSubmit={handleSubmit}>
                        <div className={styles.field}>
                            <span className={styles.label}>{t("category")}</span>
                            <div className={styles.chips}>
                                {CATEGORIES.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        className={styles.chip}
                                        aria-pressed={category === c}
                                        onClick={() => setCategory(c)}
                                    >
                                        {t(`categories.${c}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!isLoading && !isAuthenticated && (
                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="s-name">{t("name")}</label>
                                    <input id="s-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="s-email">{t("email")}</label>
                                    <input id="s-email" className={styles.input} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                                </div>
                            </div>
                        )}

                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="s-subject">{t("subject")}</label>
                            <input id="s-subject" className={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={140} placeholder={t("subjectPlaceholder")} />
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label} htmlFor="s-message">{t("message")}</label>
                            <textarea id="s-message" className={styles.textarea} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={5000} placeholder={t("messagePlaceholder")} />
                            <span className={styles.help}>{t("privacyHint")}</span>
                        </div>
                        <Button type="submit" size="large" fullWidth loading={sending}>
                            <Send size={18} /> {t("send")}
                        </Button>
                    </form>
                )}
            </section>

            {isAuthenticated && (
                <>
                    <h2 className={styles.sectionTitle}>{t("yourTickets")}</h2>
                    {tickets === null ? null : tickets.length === 0 ? (
                        <p className={styles.empty}>{t("noTickets")}</p>
                    ) : (
                        <div className={styles.ticketList}>
                            {tickets.map((tk) => (
                                <Link key={tk.id} href={ticketHref(tk.id)} className={styles.ticketRow}>
                                    <span className={styles.ticketMain}>
                                        <span className={styles.ticketSubject}>{tk.subject}</span>
                                        <span className={styles.ticketMeta}>
                                            {t(`categories.${tk.category}`)} · {formatDateTime(tk.updatedAt)}
                                        </span>
                                    </span>
                                    <span className={styles.status} data-status={tk.status}>{t(`status.${tk.status}`)}</span>
                                    <ChevronRight size={18} />
                                </Link>
                            ))}
                        </div>
                    )}
                </>
            )}
        </>
    );
}
