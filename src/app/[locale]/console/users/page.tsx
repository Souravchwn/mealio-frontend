"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { api } from "@/lib/api";
import { useConsoleData } from "../ConsoleAuth";
import { Filters, Pager, Pill, SearchBox, timeAgo } from "../ui";
import styles from "../console.module.css";

const STATUSES = ["all", "active", "pending", "inactive", "deleted"] as const;

export default function ConsoleUsersPage() {
    return (
        <Suspense>
            <UsersList />
        </Suspense>
    );
}

function UsersList() {
    const locale = useLocale();
    const initialQ = useSearchParams().get("q") ?? "";
    const [q, setQ] = useState(initialQ);
    const [query, setQuery] = useState(initialQ);
    const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const id = setTimeout(() => {
            setQuery(q.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(id);
    }, [q]);

    const { data, error } = useConsoleData((t) => api.platform.users({ q: query || undefined, status, page }, t), [query, status, page]);

    return (
        <>
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>Users</h1>
                    <p className={styles.subtitle}>{data ? `${data.total} found` : "Loading"}</p>
                </div>
            </div>

            <div className={styles.toolbar}>
                <SearchBox value={q} onChange={setQ} placeholder="Name, email or phone" />
                <Filters options={STATUSES} value={status} onChange={(s) => { setStatus(s); setPage(1); }} />
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            <div className={styles.list}>
                {data?.users.length === 0 && <p className={styles.empty}>No users match.</p>}
                {data?.users.map((u) => (
                    <Link key={u.id} href={`/${locale}/console/users/${u.id}`} className={styles.row}>
                        <span className={styles.cellMain}>
                            <span className={styles.cellTitle}>{u.name}</span>
                            <span className={styles.cellSub}>
                                {u.email}
                                {u.emailVerified ? " ✓" : ""}
                            </span>
                        </span>
                        <span className={styles.cellHideSm}>
                            <span className={styles.cellTitle}>{u.mess?.name ?? "No mess"}</span>
                            <span className={styles.cellSub}>{u.role.toLowerCase()}</span>
                        </span>
                        <span className={styles.cellHideSm}>seen {timeAgo(u.lastLoginAt)}</span>
                        <Pill value={u.status} />
                    </Link>
                ))}
            </div>
            {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
    );
}
