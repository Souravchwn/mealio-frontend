"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { api } from "@/lib/api";
import { useConsoleData } from "../ConsoleAuth";
import { Filters, Pager, Pill, SearchBox, timeAgo } from "../ui";
import styles from "../console.module.css";

const STATUSES = ["all", "active", "suspended", "deleted"] as const;

export default function ConsoleMessesPage() {
    const locale = useLocale();
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
    const [page, setPage] = useState(1);

    // Search after a short pause in typing
    useEffect(() => {
        const id = setTimeout(() => {
            setQuery(q.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(id);
    }, [q]);

    const { data, error } = useConsoleData((t) => api.platform.messes({ q: query || undefined, status, page }, t), [query, status, page]);

    return (
        <>
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>Messes</h1>
                    <p className={styles.subtitle}>{data ? `${data.total} found` : "Loading"}</p>
                </div>
            </div>

            <div className={styles.toolbar}>
                <SearchBox value={q} onChange={setQ} placeholder="Name, invite code or member email" />
                <Filters options={STATUSES} value={status} onChange={(s) => { setStatus(s); setPage(1); }} />
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            <div className={styles.list}>
                {data?.messes.length === 0 && <p className={styles.empty}>No messes match.</p>}
                {data?.messes.map((m) => (
                    <Link key={m.id} href={`/${locale}/console/messes/${m.id}`} className={styles.row}>
                        <span className={styles.cellMain}>
                            <span className={styles.cellTitle}>{m.name}</span>
                            <span className={styles.cellSub}>
                                {m.members} members · {m.plan} · created {timeAgo(m.createdAt)}
                            </span>
                        </span>
                        <span className={styles.cellHideSm}>
                            <span className={styles.cellTitle}>{m.owner?.name ?? "No owner"}</span>
                            <span className={styles.cellSub}>{m.owner?.email}</span>
                        </span>
                        <span className={styles.cellHideSm}>{m.plan}</span>
                        <Pill value={m.status} />
                    </Link>
                ))}
            </div>
            {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
    );
}
