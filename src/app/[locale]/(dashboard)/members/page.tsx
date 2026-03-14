"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { UserPlus, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { cn, formatCurrency, getInitials } from "@/lib/utils";
import styles from "./members.module.css";

const MOCK_MEMBERS = [
    { id: "1", name: "Sourav Chwn", role: "ADMIN", balance: 1250, phone: "+880 1711 XXXXXX" },
    { id: "2", name: "Rahat Islam", role: "MANAGER", balance: -450, phone: "+880 1812 XXXXXX" },
    { id: "3", name: "Tahmid Hasan", role: "MEMBER", balance: 320, phone: "+880 1913 XXXXXX" },
    { id: "4", name: "Fahim Ahmed", role: "MEMBER", balance: -120, phone: "+880 1614 XXXXXX" },
    { id: "5", name: "Sakib Hossain", role: "MEMBER", balance: 890, phone: "+880 1515 XXXXXX" },
    { id: "6", name: "Nayeem Khan", role: "MEMBER", balance: 50, phone: "+880 1716 XXXXXX" },
    { id: "7", name: "Arif Rahman", role: "MEMBER", balance: -780, phone: "+880 1817 XXXXXX" },
    { id: "8", name: "Jubayer Ali", role: "MEMBER", balance: 200, phone: null },
];

const roleColors: Record<string, string> = {
    ADMIN: "var(--color-primary)",
    MANAGER: "var(--color-accent)",
    MEMBER: "var(--color-text-muted)",
};

export default function MembersPage() {
    const t = useTranslations("members");
    const tc = useTranslations("common");
    const locale = useLocale();

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                <div className={styles.headerActions}>
                    <Button variant="secondary" size="small">
                        <Copy size={16} />
                        {t("inviteCode")}: MESS-4X2K
                    </Button>
                    <Button size="small">
                        <UserPlus size={16} />
                        {t("addMember")}
                    </Button>
                </div>
            </div>

            <Card noPadding>
                <div className={styles.memberList}>
                    {MOCK_MEMBERS.map((member) => (
                        <div key={member.id} className={styles.memberRow}>
                            <div className={styles.memberAvatar}>
                                {getInitials(member.name)}
                            </div>
                            <div className={styles.memberInfo}>
                                <span className={styles.memberName}>{member.name}</span>
                                <span className={styles.memberPhone}>
                                    {member.phone || "—"}
                                </span>
                            </div>
                            <span
                                className={styles.roleBadge}
                                style={{
                                    color: roleColors[member.role],
                                    backgroundColor: roleColors[member.role] + "18",
                                }}
                            >
                                {t(`roles.${member.role}`)}
                            </span>
                            <span
                                className={cn(
                                    styles.balance,
                                    member.balance >= 0 ? styles.positive : styles.negative
                                )}
                            >
                                {member.balance < 0 && "-"}
                                {formatCurrency(Math.abs(member.balance), locale)}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
