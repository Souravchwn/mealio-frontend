"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { api } from "@/lib/api";
import { useConsoleAuth } from "../ConsoleAuth";
import styles from "../console.module.css";

export default function ConsoleLoginPage() {
    const locale = useLocale();
    const router = useRouter();
    const { token, signIn } = useConsoleAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (token) router.replace(`/${locale}/console`);
    }, [token, router, locale]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await api.platform.login(email.trim(), password);
            signIn(res.accessToken, res.admin);
            router.replace(`/${locale}/console`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Sign in failed");
            setBusy(false);
        }
    };

    return (
        <div className={styles.loginPage}>
            <div className={styles.loginCard}>
                <span className={styles.brandMark}><ShieldCheck size={20} /></span>
                <h1 className={styles.title} style={{ marginTop: "var(--space-4)" }}>Mealtill Console</h1>
                <p className={styles.subtitle}>Platform staff only. Every sign-in is recorded.</p>
                <form className={styles.loginForm} onSubmit={submit}>
                    <input
                        className={styles.input}
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        placeholder="Staff email"
                        aria-label="Staff email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        className={styles.input}
                        type="password"
                        autoComplete="current-password"
                        placeholder="Password"
                        aria-label="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <Button type="submit" size="large" fullWidth loading={busy}>
                        Sign in
                    </Button>
                </form>
                <p className={styles.loginNote}>
                    No account? Create one on the server with <code>npm run platform-admin</code>.
                </p>
            </div>
        </div>
    );
}
