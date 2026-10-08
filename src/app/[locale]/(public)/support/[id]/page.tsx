"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime } from "@/lib/utils";
import type { SupportTicket } from "@/types";
import styles from "../../public.module.css";

export default function TicketPage() {
    return (
        <Suspense>
            <TicketThread />
        </Suspense>
    );
}

function TicketThread() {
    const t = useTranslations("support");
    const locale = useLocale();
    const { id } = useParams<{ id: string }>();
    const key = useSearchParams().get("key");
    const { token, isLoading } = useAuth();

    const [ticket, setTicket] = useState<SupportTicket | null>(null);
    const [missing, setMissing] = useState(false);
    const [reply, setReply] = useState("");
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        try {
            setTicket(await api.support.get(id, { token, key }));
        } catch {
            setMissing(true);
        }
    }, [id, token, key]);

    useEffect(() => {
        if (isLoading) return;
        let cancelled = false;
        api.support
            .get(id, { token, key })
            .then((tk) => !cancelled && setTicket(tk))
            .catch(() => !cancelled && setMissing(true));
        return () => {
            cancelled = true;
        };
    }, [id, token, key, isLoading]);

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reply.trim()) return;
        setSending(true);
        try {
            await api.support.reply(id, reply.trim(), { token, key });
            setReply("");
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("error"));
        } finally {
            setSending(false);
        }
    };

    const back = (
        <Link href={`/${locale}/support`} className={styles.backLink}>
            <ArrowLeft size={16} /> {t("backToSupport")}
        </Link>
    );

    if (missing) {
        return (
            <>
                {back}
                <p className={`${styles.empty} ${styles.card}`}>{t("notFound")}</p>
            </>
        );
    }
    if (!ticket) return back;

    return (
        <>
            {back}
            <div className={styles.threadHead}>
                <h1 className={styles.threadTitle}>{ticket.subject}</h1>
                <span className={styles.status} data-status={ticket.status}>{t(`status.${ticket.status}`)}</span>
            </div>
            <p className={styles.updated}>
                {t(`categories.${ticket.category}`)} · {t("opened", { date: formatDateTime(ticket.createdAt) })}
            </p>

            <div className={styles.thread}>
                {ticket.messages?.map((m) => (
                    <div key={m.id} className={styles.bubble} data-author={m.authorType}>
                        <span className={styles.bubbleMeta}>
                            {m.authorType === "STAFF" ? t("supportTeam") : t("you")} · {formatDateTime(m.createdAt)}
                        </span>
                        {m.body}
                    </div>
                ))}
            </div>

            {ticket.status === "CLOSED" ? (
                <p className={styles.closedNote}>{t("closedNote")}</p>
            ) : (
                <form className={styles.replyBox} onSubmit={send}>
                    <label className={styles.label} htmlFor="reply">{t("reply")}</label>
                    <textarea
                        id="reply"
                        className={styles.textarea}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        maxLength={5000}
                        placeholder={t("replyPlaceholder")}
                    />
                    <div className={styles.replyActions}>
                        <Button type="submit" loading={sending} disabled={!reply.trim()}>
                            <Send size={16} /> {t("sendReply")}
                        </Button>
                    </div>
                </form>
            )}
        </>
    );
}
