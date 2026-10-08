"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { BazaarMemoInfo } from "@/types";
import { prepareMemo } from "./image";
import styles from "./Memo.module.css";

interface Props {
    sessionId: string;
    memos: BazaarMemoInfo[];
    token: string;
    /** Managers and admins may add more photos, up to `max` */
    canAdd?: boolean;
    max?: number;
    onAdded?: (memos: BazaarMemoInfo[]) => void;
}

/** Saved memo photos of one bazaar trip. Photos load with the user's token and open full screen on tap. */
export function MemoGallery({ sessionId, memos, token, canAdd, max = 3, onAdded }: Props) {
    const t = useTranslations("expenses.memo");
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [failed, setFailed] = useState<Record<string, boolean>>({});
    const [viewing, setViewing] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const created = useRef<string[]>([]);

    // Fetch each photo once; release the object URLs when the gallery goes away
    useEffect(() => {
        let cancelled = false;
        for (const m of memos) {
            if (urls[m.id] || failed[m.id]) continue;
            api.expenses.sessions
                .memoBlob(sessionId, m.id, token)
                .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    if (cancelled) return URL.revokeObjectURL(url);
                    created.current.push(url);
                    setUrls((p) => ({ ...p, [m.id]: url }));
                })
                .catch(() => !cancelled && setFailed((p) => ({ ...p, [m.id]: true })));
        }
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memos, sessionId, token]);

    useEffect(() => {
        const list = created.current;
        return () => list.forEach(URL.revokeObjectURL);
    }, []);

    const close = useCallback(() => setViewing(null), []);
    useEffect(() => {
        if (!viewing) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [viewing, close]);

    async function addFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setAdding(true);
        try {
            const room = max - memos.length;
            const drafts = [];
            for (const f of Array.from(files).slice(0, room)) {
                const d = await prepareMemo(f);
                URL.revokeObjectURL(d.previewUrl);
                drafts.push({ data: d.data });
            }
            const res = await api.expenses.sessions.addMemos(sessionId, drafts, token);
            onAdded?.(res.memos);
            toast.success(t("added"));
        } catch (err) {
            const m = err instanceof Error ? err.message : "";
            toast.error(m === "too-large" ? t("tooLarge") : m === "decode" || !m ? t("unreadable") : m);
        } finally {
            setAdding(false);
        }
    }

    if (memos.length === 0 && !canAdd) return null;

    return (
        <div className={styles.gallery}>
            <span className={styles.galleryLabel}>{t("title2")}</span>
            <div className={styles.thumbRow}>
                {memos.map((m, i) => (
                    <button
                        key={m.id}
                        type="button"
                        className={styles.thumb}
                        onClick={() => urls[m.id] && setViewing(m.id)}
                        aria-label={t("open", { n: i + 1 })}
                    >
                        {urls[m.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={urls[m.id]} alt={t("photoAlt", { n: i + 1 })} />
                        ) : failed[m.id] ? (
                            <span className={styles.thumbState}>{t("failed")}</span>
                        ) : (
                            <span className={styles.thumbState}><Loader2 size={18} className={styles.spin} /></span>
                        )}
                    </button>
                ))}
                {canAdd && memos.length < max && (
                    <label className={styles.addPhoto} aria-busy={adding}>
                        {adding ? <Loader2 size={22} className={styles.spin} /> : <Camera size={22} />}
                        <span>{t("addAnother")}</span>
                        <input type="file" accept="image/*" multiple hidden disabled={adding} onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
                    </label>
                )}
            </div>

            {viewing && urls[viewing] && typeof document !== "undefined" && createPortal(
                <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={t("title")} onClick={close}>
                    <button type="button" className={styles.lightboxClose} onClick={close} aria-label={t("close")}>
                        <X size={22} />
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[viewing]} alt={t("title")} onClick={(e) => e.stopPropagation()} />
                </div>,
                document.body,
            )}
        </div>
    );
}
