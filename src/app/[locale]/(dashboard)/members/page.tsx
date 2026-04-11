"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { cn, formatCurrency, getInitials } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import styles from "./members.module.css";

interface MemberRow {
    id: string;
    name: string;
    phone: string | null;
    role: string;
    balance: number;
    telegramLinked: boolean;
    isGuest: boolean;
    guestFrom: string | null;
    guestUntil: string | null;
}

const roleColors: Record<string, string> = {
    ADMIN: "var(--color-primary)",
    MANAGER: "var(--color-accent)",
    MEMBER: "var(--color-text-muted)",
    GUEST: "#f59e0b",
};

export default function MembersPage() {
    const t = useTranslations("members");
    const tg = useTranslations("guest");
    const locale = useLocale();
    const { user, token } = useAuth();

    const [members, setMembers] = useState<MemberRow[]>([]);
    const [messName, setMessName] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !token) return;
        api.members
            .list(user.messId, token)
            .then((res) => {
                setMessName(res.messName);
                setMembers(res.members as MemberRow[]);
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load members"))
            .finally(() => setLoading(false));
    }, [user, token]);

    function copyInviteLink() {
        const inviteUrl = `${window.location.origin}/register`;
        navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Invite link copied"));
    }

    const today = new Date().toISOString().slice(0, 10);

    function isGuestExpired(member: MemberRow): boolean {
        return member.isGuest && !!member.guestUntil && member.guestUntil < today;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{messName || t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                <div className={styles.headerActions}>
                    <Button variant="secondary" size="small" onClick={copyInviteLink}>
                        <Copy size={16} />
                        {t("inviteCode")}
                    </Button>
                </div>
            </div>

            <Card noPadding>
                <div className={styles.memberList}>
                    {loading ? (
                        <div className={styles.memberRow} style={{ justifyContent: "center", color: "var(--color-text-muted)" }}>
                            Loading…
                        </div>
                    ) : members.length === 0 ? (
                        <div className={styles.memberRow} style={{ justifyContent: "center", color: "var(--color-text-muted)" }}>
                            No members found.
                        </div>
                    ) : (
                        members.map((member) => (
                            <div key={member.id} className={cn(styles.memberRow, member.isGuest && styles.guestRow)}>
                                <div className={styles.memberAvatar}>
                                    {getInitials(member.name)}
                                </div>
                                <div className={styles.memberInfo}>
                                    <div className={styles.memberNameRow}>
                                        <span className={styles.memberName}>{member.name}</span>
                                        {member.isGuest && (
                                            <span className={cn(styles.guestBadge, isGuestExpired(member) && styles.guestBadgeExpired)}>
                                                {isGuestExpired(member) ? tg("expired") : tg("badge")}
                                            </span>
                                        )}
                                        {member.telegramLinked && (
                                            <span className={styles.telegramBadge} title="Telegram linked">
                                                <Send size={10} />
                                            </span>
                                        )}
                                    </div>
                                    <span className={styles.memberPhone}>
                                        {member.isGuest && member.guestFrom && member.guestUntil
                                            ? tg("dateRange", { from: member.guestFrom, until: member.guestUntil })
                                            : member.phone || "—"}
                                    </span>
                                </div>
                                <span
                                    className={styles.roleBadge}
                                    style={{
                                        color: roleColors[member.role] ?? "var(--color-text-muted)",
                                        backgroundColor: (roleColors[member.role] ?? "var(--color-text-muted)") + "18",
                                    }}
                                >
                                    {t(`roles.${member.role}`)}
                                </span>
                                {!member.isGuest && (
                                    <span
                                        className={cn(
                                            styles.balance,
                                            member.balance >= 0 ? styles.positive : styles.negative
                                        )}
                                    >
                                        {member.balance < 0 && "-"}
                                        {formatCurrency(Math.abs(member.balance), locale)}
                                    </span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
