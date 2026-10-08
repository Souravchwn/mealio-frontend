"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { api } from "@/lib/api";
import { useConsoleData } from "../ConsoleAuth";
import { Filters, Pager, Pill, SearchBox, timeAgo } from "../ui";
import styles from "../console.module.css";

const STATUSES = ["open", "OPEN", "WAITING_ON_USER", "RESOLVED", "CLOSED", "all"] as const;

export default function ConsoleSupportPage() {
    const locale = useLocale();
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<(typeof STATUSES)[number]>("open");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const id = setTimeout(() => {
            setQuery(q.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(id);
    }, [q]);

    const { data, error } = useConsoleData((t) => api.platform.tickets({ q: query || undefined, status, page }, t), [query, status, page]);

    return (
        <>
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>Support</h1>
                    <p className={styles.subtitle}>
                        {data ? `${data.total} tickets` : "Loading"}. High priority first, then newest activity.
                    </p>
                </div>
            </div>

            <div className={styles.toolbar}>
                <SearchBox value={q} onChange={setQ} placeholder="Subject, name or email" />
                <Filters options={STATUSES} value={status} onChange={(s) => { setStatus(s); setPage(1); }} />
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            <div className={styles.list}>
                {data?.tickets.length === 0 && <p className={styles.empty}>Inbox zero. Nice.</p>}
                {data?.tickets.map((tk) => (
                    <Link key={tk.id} href={`/${locale}/console/support/${tk.id}`} className={styles.row}>
                        <span className={styles.cellMain}>
                            <span className={styles.cellTitle}>{tk.subject}</span>
                            <span className={styles.cellSub}>
                                {tk.name} · {tk.email}
                            </span>
                        </span>
                        <span className={styles.cellHideSm}>
                            <span className={styles.cellTitle}>{tk.category.toLowerCase()}</span>
                            <span className={styles.cellSub}>updated {timeAgo(tk.updatedAt)}</span>
                        </span>
                        <span className={styles.cellHideSm}>
                            {tk.priority !== "NORMAL" && <Pill value={tk.priority} label={`${tk.priority.toLowerCase()} priority`} />}
                        </span>
                        <Pill value={tk.status} />
                    </Link>
                ))}
            </div>
            {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
    );
}
