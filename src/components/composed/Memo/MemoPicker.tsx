"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { prepareMemo, type MemoDraft } from "./image";
import styles from "./Memo.module.css";

export type { MemoDraft };

interface Props {
    value: MemoDraft[];
    onChange: (next: MemoDraft[]) => void;
    max?: number;
    disabled?: boolean;
    /** Highlights the empty picker as a required field */
    required?: boolean;
}

/** Choose or take photos of the paper memo. Each photo is shrunk here before it is sent. */
export function MemoPicker({ value, onChange, max = 3, disabled, required }: Props) {
    const t = useTranslations("expenses.memo");
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    async function onFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setBusy(true);
        const next = [...value];
        for (const file of Array.from(files)) {
            if (next.length >= max) {
                toast.error(t("tooMany", { max }));
                break;
            }
            try {
                next.push(await prepareMemo(file));
            } catch (err) {
                toast.error(err instanceof Error && err.message === "too-large" ? t("tooLarge") : t("unreadable"));
            }
        }
        onChange(next);
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
    }

    function remove(id: string) {
        const gone = value.find((m) => m.id === id);
        if (gone) URL.revokeObjectURL(gone.previewUrl);
        onChange(value.filter((m) => m.id !== id));
    }

    return (
        <div className={styles.picker}>
            <div className={styles.thumbRow}>
                {value.map((m, i) => (
                    <div key={m.id} className={styles.thumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.previewUrl} alt={t("photoAlt", { n: i + 1 })} />
                        <button type="button" className={styles.thumbRemove} onClick={() => remove(m.id)} aria-label={t("remove")} disabled={disabled}>
                            <X size={13} />
                        </button>
                    </div>
                ))}
                {value.length < max && (
                    <button
                        type="button"
                        className={cn(styles.addPhoto, required && value.length === 0 && styles.addPhotoRequired)}
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled || busy}
                    >
                        {busy ? <Loader2 size={22} className={styles.spin} /> : <Camera size={22} />}
                        <span>{value.length === 0 ? t("add") : t("addAnother")}</span>
                    </button>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void onFiles(e.target.files)}
            />
            <p className={styles.hint}>{t("hint", { max })}</p>
        </div>
    );
}
