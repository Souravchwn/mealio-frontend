"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatCurrency } from "@/lib/utils";
import { AuthShell, PasswordInput } from "../../AuthShell";
import styles from "../../auth.module.css";
import invite from "./invite.module.css";

type Preview = Awaited<ReturnType<typeof api.invite.get>>;

/**
 * A personal invite for someone the admin added by name. Shows their own numbers first
 * (the reason to join), then one short form: email and password. No approval needed.
 */
export default function InvitePage() {
    const t = useTranslations("auth.invite");
    const locale = useLocale();
    const router = useRouter();
    const { login } = useAuth();
    const params = useParams<{ token: string }>();
    const token = params.token;

    const [preview, setPreview] = useState<Preview | null>(null);
    const [invalid, setInvalid] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.invite
            .get(token)
            .then(setPreview)
            .catch(() => setInvalid(true));
    }, [token]);

    async function join(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await api.invite.claim(token, { email, password, locale });
            login(res.user, res.accessToken);
            toast.success(t("welcome", { name: res.user.name }));
            router.replace(`/${locale}/overview`);
        } catch (err) {
            if (err instanceof ApiError && err.code === "INVITE_INVALID") setInvalid(true);
            else toast.error(err instanceof Error ? err.message : t("failed"));
        } finally {
            setBusy(false);
        }
    }

    const footer = (
        <>
            {t("haveAccount")}{" "}
            <Link href={`/${locale}/login`} className={styles.switchLink}>{t("signIn")}</Link>
        </>
    );

    if (invalid) {
        return (
            <AuthShell title={t("invalidTitle")} subtitle={t("invalidBody")} footer={footer}>
                <div className={styles.stateCard}>
                    <span className={styles.stateIcon} data-tone="warn"><CircleAlert size={26} /></span>
                </div>
            </AuthShell>
        );
    }

    if (!preview) {
        return (
            <AuthShell title={t("loading")} subtitle=" " footer={footer}>
                <div className={styles.stateCard}>
                    <span className={styles.stateIcon}><Loader2 size={26} className={styles.spin} /></span>
                </div>
            </AuthShell>
        );
    }

    const ahead = preview.balance >= 0;
    return (
        <AuthShell
            title={t("title", { name: preview.name })}
            subtitle={t("subtitle", { mess: preview.messName })}
            footer={footer}
        >
            {/* Their own numbers this month: the reason to join */}
            <div className={invite.preview} aria-label={t("previewLabel")}>
                <div className={cn(invite.balance, ahead ? invite.ahead : invite.behind)}>
                    <small>{ahead ? t("getBack") : t("owe")}</small>
                    <b className="num">{formatCurrency(Math.abs(preview.balance))}</b>
                </div>
                <div className={invite.stat}>
                    <b className="num">{preview.meals}</b>
                    <small>{t("meals")}</small>
                </div>
                <div className={invite.stat}>
                    <b className="num">{formatCurrency(preview.deposited)}</b>
                    <small>{t("paid")}</small>
                </div>
                <div className={invite.stat}>
                    <b className="num">{formatCurrency(preview.mealRate)}</b>
                    <small>{t("rate")}</small>
                </div>
            </div>
            <p className={invite.why}>{t("why")}</p>

            <form className={styles.form} onSubmit={join}>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="invite-email">{t("email")}</label>
                    <input
                        className={styles.input}
                        id="invite-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="invite-password">{t("password")}</label>
                    <PasswordInput
                        id="invite-password"
                        autoComplete="new-password"
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <span className={styles.help}>{t("passwordHelp")}</span>
                </div>
                <Button type="submit" className={styles.submitBtn} disabled={busy}>
                    {busy ? t("joining") : t("join")}
                </Button>
            </form>
        </AuthShell>
    );
}
