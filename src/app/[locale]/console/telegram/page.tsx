"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleX, Plug, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useConsoleAuth, useConsoleData } from "../ConsoleAuth";
import styles from "../console.module.css";

/** Telegram bot status for the whole platform, with a one-click connect. */
export default function ConsoleTelegramPage() {
    const { token } = useConsoleAuth();
    const { data: s, error, reload } = useConsoleData((t) => api.platform.telegram(t), []);
    const [busy, setBusy] = useState(false);

    async function act(action: "connect" | "disconnect") {
        if (!token) return;
        setBusy(true);
        try {
            await api.platform.telegramAction(action, token);
            toast.success(action === "connect" ? "Connected. The bot now reaches this app." : "Disconnected.");
            reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
        } finally {
            setBusy(false);
        }
    }

    const checks = s
        ? [
              { ok: s.tokenSet && s.botOk, label: "Bot token", note: s.botOk ? `Bot is @${s.botUsername}` : s.botError ?? "Set TELEGRAM_BOT_TOKEN in the server environment (get it from @BotFather)." },
              { ok: s.secretSet, label: "Webhook secret", note: s.secretSet ? "Set." : "Set TELEGRAM_WEBHOOK_SECRET (any long random text). The app refuses every update without it." },
              { ok: !!s.botNameFromEnv && s.botNameFromEnv === s.botUsername, label: "Bot name shown to members", note: s.botNameFromEnv ? `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is ${s.botNameFromEnv}.` : `Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME${s.botUsername ? ` to ${s.botUsername}` : ""}.` },
              { ok: s.appUrlPublic, label: "Public https address", note: s.appUrlPublic ? s.appUrl : "NEXT_PUBLIC_APP_URL must be your public https address. Telegram cannot call localhost." },
              { ok: s.connected, label: "Webhook connected", note: s.connected ? s.webhookUrl ?? "" : s.webhookUrl ? `Points somewhere else: ${s.webhookUrl}` : "Not connected yet." },
              { ok: s.connected && s.hearsGroupAdds, label: "Sets itself up in groups", note: s.hearsGroupAdds ? "The bot hears when it is added to a group." : "Press Connect (again) so Telegram also sends group join events." },
              { ok: s.menuButtonSet, label: "Menu button opens the Mini App", note: s.menuButtonSet ? "Private chats show a Mealtill button." : "Set by Connect." },
              { ok: s.hasMiniApp, label: "Mini App set in @BotFather", note: s.hasMiniApp ? "The group button can open the Mini App." : `Once, in @BotFather: Bot Settings, Configure Mini App, and paste ${s.miniAppUrl}` },
          ]
        : [];
    const ready = !!s && s.tokenSet && s.botOk && s.secretSet && s.appUrlPublic;

    return (
        <>
            <div className={styles.pageHead}>
                <div>
                    <h1 className={styles.title}>Telegram bot</h1>
                    <p className={styles.subtitle}>One bot serves every mess. Connect it once; each mess then links its own group.</p>
                </div>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            <section className={styles.card}>
                <div className={styles.feed}>
                    {checks.map((c) => (
                        <div key={c.label} className={styles.feedItem}>
                            {c.ok ? <CheckCircle2 size={18} color="var(--color-success)" /> : <CircleX size={18} color="var(--color-danger)" />}
                            <span className={styles.cellMain}>
                                <span className={styles.cellTitle}>{c.label}</span>
                                <span className={styles.cellSub} style={{ whiteSpace: "normal" }}>{c.note}</span>
                            </span>
                            <span />
                        </div>
                    ))}
                </div>

                {s && (
                    <div className={styles.actions} style={{ marginTop: "var(--space-4)" }}>
                        <button type="button" className={cn(styles.actionBtn)} disabled={busy || !ready} onClick={() => void act("connect")}>
                            <Plug size={16} /> {s.connected ? "Reconnect" : "Connect the bot"}
                        </button>
                        {s.webhookUrl && (
                            <button type="button" className={cn(styles.actionBtn, styles.actionDanger)} disabled={busy} onClick={() => void act("disconnect")}>
                                <Unplug size={16} /> Disconnect
                            </button>
                        )}
                    </div>
                )}
                {s?.lastError && <p className={styles.errorBox} style={{ marginTop: "var(--space-4)" }}>Telegram reported: {s.lastError}</p>}
                {s && s.pending > 0 && <p className={styles.subtitle} style={{ marginTop: "var(--space-3)" }}>{s.pending} messages are waiting for the bot.</p>}
            </section>
        </>
    );
}
