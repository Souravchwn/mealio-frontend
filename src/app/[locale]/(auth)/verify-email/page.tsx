"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CircleAlert, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { AuthShell } from "../AuthShell";
import styles from "../auth.module.css";

export default function VerifyEmailPage() {
    return (
        <Suspense>
            <VerifyEmail />
        </Suspense>
    );
}

function VerifyEmail() {
    const t = useTranslations("auth.verify");
    const locale = useLocale();
    const token = useSearchParams().get("token") ?? "";
    const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
    const started = useRef(false);

    useEffect(() => {
        // The token is single-use, so never send it twice (React dev mode runs effects twice)
        if (!token || started.current) return;
        started.current = true;
        api.auth
            .verifyEmail(token)
            .then(() => setState("done"))
            .catch(() => setState("failed"));
    }, [token]);

    return (
        <AuthShell
            title={state === "done" ? t("doneTitle") : state === "failed" ? t("failedTitle") : t("workingTitle")}
            subtitle={state === "done" ? t("doneSubtitle") : state === "failed" ? t("failedSubtitle") : ""}
            footer={
                <Link href={`/${locale}/login`} className={styles.switchLink}>
                    {t("continue")}
                </Link>
            }
        >
            <div className={styles.stateCard}>
                <span className={styles.stateIcon} data-tone={state === "failed" ? "warn" : undefined}>
                    {state === "done" ? <BadgeCheck size={26} /> : state === "failed" ? <CircleAlert size={26} /> : <Loader2 size={26} className={styles.spin} />}
                </span>
                {state === "failed" && <p>{t("failedBody")}</p>}
            </div>
        </AuthShell>
    );
}
