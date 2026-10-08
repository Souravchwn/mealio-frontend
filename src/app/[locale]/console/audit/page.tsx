"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { api } from "@/lib/api";
import { useConsoleData } from "../ConsoleAuth";
import { Filters, Pager, timeAgo } from "../ui";
import styles from "../console.module.css";

const SOURCES = ["platform", "mess"] as const;

export default function ConsoleAuditPage() {
    return (
        <Suspense>
            <AuditLog />
        </Suspense>
    );
}

function AuditLog() {
    const locale = useLocale();
    const sp = useSearchParams();
    const messId = sp.get("mess") ?? undefined;
    const [source, setSource] = useState<(typeof SOURCES)[number]>(sp.get("source") === "mess" ? "mess" : "platform");
    const [page, setPage] = useState(1);

    const { data, error } = useConsoleData(
        (t) => api.platform.audit({ source, messId: source === "mess" ? messId : undefined, page }, t),
        [source, messId, page]
    );

    return (
        <>
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>Audit log</h1>
                    <p className={styles.subtitle}>
                        {source === "platform" ? "What platform staff did." : messId ? "Everything done inside one mess." : "Everything done inside every mess."}
                    </p>
                </div>
            </div>

            <div className={styles.toolbar}>
                <Filters options={SOURCES} value={source} onChange={(s) => { setSource(s); setPage(1); }} />
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            <div className={styles.list}>
                {data?.entries.length === 0 && <p className={styles.empty}>Nothing logged yet.</p>}
                {data?.entries.map((e) => (
                    <div key={e.id} className={styles.row}>
                        <span className={styles.cellMain}>
                            <span className={styles.cellTitle}>{e.action.replaceAll("_", " ").toLowerCase()}</span>
                            <span className={styles.cellSub}>{e.actor} · {timeAgo(e.createdAt)}</span>
                        </span>
                        <span className={styles.cellHideSm}>
                            {e.mess ? (
                                <Link href={`/${locale}/console/messes/${e.mess.id}`} className={styles.cardLink}>{e.mess.name}</Link>
                            ) : (
                                <span className={styles.mono}>{e.target ?? "–"}</span>
                            )}
                        </span>
                        <span className={styles.cellHideSm}>{new Date(e.createdAt).toLocaleString("en-GB")}</span>
                        <span />
                    </div>
                ))}
            </div>
            {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
    );
}
