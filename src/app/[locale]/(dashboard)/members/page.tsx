"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Copy, Send, ChevronDown, ChevronUp, UserX, UserCheck } from "lucide-react";
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
    isActive: boolean;
}

const ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const;

const roleColors: Record<string, string> = {
    ADMIN: "var(--color-primary)",
    MANAGER: "var(--color-accent)",
    MEMBER: "var(--color-text-muted)",
};

export default function MembersPage() {
    const t = useTranslations("members");
    const { user, token } = useAuth();

    const [members, setMembers] = useState<MemberRow[]>([]);
    const [messName, setMessName] = useState("");
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});

    const isAdmin = user?.role === "ADMIN";

    function loadMembers() {
        if (!user || !token) return;
        api.members
            .list(user.messId, token)
            .then((res) => {
                setMessName(res.messName);
                setMembers(res.members as MemberRow[]);
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load members"))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, token]);

    async function handleRoleSave(member: MemberRow) {
        if (!token) return;
        const newRole = pendingRoles[member.id] ?? member.role;
        setSavingId(member.id);
        try {
            await api.admin.updateMember(member.id, { role: newRole }, token);
            toast.success(`${member.name} is now ${newRole}`);
            setMembers((prev) =>
                prev.map((m) => m.id === member.id ? { ...m, role: newRole } : m)
            );
            setExpandedId(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update role");
        } finally {
            setSavingId(null);
        }
    }

    async function handleToggleActive(member: MemberRow) {
        if (!token) return;
        setSavingId(member.id);
        const newActive = !member.isActive;
        try {
            await api.admin.updateMember(member.id, { isActive: newActive }, token);
            toast.success(`${member.name} ${newActive ? "reactivated" : "deactivated"}`);
            setMembers((prev) =>
                prev.map((m) => m.id === member.id ? { ...m, isActive: newActive } : m)
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update member");
        } finally {
            setSavingId(null);
        }
    }

    function copyInviteLink() {
        const inviteUrl = `${window.location.origin}/register`;
        navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Invite link copied"));
    }

    const activeMembers = members.filter((m) => m.isActive !== false);
    const inactiveMembers = members.filter((m) => m.isActive === false);

    function renderMember(member: MemberRow) {
        const isExpanded = expandedId === member.id;
        const isSaving = savingId === member.id;
        const pendingRole = pendingRoles[member.id] ?? member.role;
        const isSelf = member.id === user?.id;

        return (
            <div key={member.id} className={cn(styles.memberRow, !member.isActive && styles.inactiveRow)}>
                {/* Main row */}
                <div className={styles.memberMain}>
                    <div className={styles.memberAvatar}>
                        {getInitials(member.name)}
                    </div>
                    <div className={styles.memberInfo}>
                        <div className={styles.memberNameRow}>
                            <span className={styles.memberName}>{member.name}</span>
                            {member.telegramLinked && (
                                <span className={styles.telegramBadge} title="Telegram linked">
                                    <Send size={10} />
                                </span>
                            )}
                            {!member.isActive && (
                                <span className={cn(styles.badge, styles.badgeInactive)}>Inactive</span>
                            )}
                        </div>
                        <div className={styles.memberSub}>
                            <span
                                className={styles.rolePill}
                                style={{
                                    color: roleColors[member.role] ?? "var(--color-text-muted)",
                                    backgroundColor: (roleColors[member.role] ?? "var(--color-text-muted)") + "18",
                                }}
                            >
                                {member.role}
                            </span>
                            {member.phone && (
                                <span className={styles.phone}>{member.phone}</span>
                            )}
                        </div>
                    </div>

                    <div className={styles.memberRight}>
                        <span className={cn(styles.balance, member.balance >= 0 ? styles.positive : styles.negative)}>
                            {member.balance < 0 && "−"}
                            {formatCurrency(Math.abs(member.balance))}
                        </span>
                        {isAdmin && !isSelf && (
                            <button
                                className={cn(styles.expandBtn, isExpanded && styles.expandBtnOpen)}
                                onClick={() => setExpandedId(isExpanded ? null : member.id)}
                                aria-label="Manage member"
                            >
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        )}
                    </div>
                </div>

                {/* Expanded admin controls */}
                {isExpanded && isAdmin && (
                    <div className={styles.adminPanel}>
                        <div className={styles.adminPanelRow}>
                            <label className={styles.adminLabel}>Role</label>
                            <select
                                className={styles.roleSelect}
                                value={pendingRole}
                                onChange={(e) =>
                                    setPendingRoles((prev) => ({ ...prev, [member.id]: e.target.value }))
                                }
                            >
                                {ROLES.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                            <Button
                                size="small"
                                disabled={isSaving || pendingRole === member.role}
                                onClick={() => void handleRoleSave(member)}
                            >
                                {isSaving ? "Saving…" : "Save"}
                            </Button>
                        </div>
                        <div className={styles.adminPanelRow}>
                            <Button
                                variant={member.isActive ? "danger" : "secondary"}
                                size="small"
                                disabled={isSaving}
                                onClick={() => void handleToggleActive(member)}
                            >
                                {member.isActive
                                    ? <><UserX size={14} /> Deactivate</>
                                    : <><UserCheck size={14} /> Reactivate</>
                                }
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{messName || t("title")}</h2>
                    <p className={styles.subtitle}>
                        {activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}
                    </p>
                </div>
                <Button variant="secondary" size="small" onClick={copyInviteLink}>
                    <Copy size={16} />
                    {t("inviteCode")}
                </Button>
            </div>

            <Card noPadding>
                <div className={styles.memberList}>
                    {loading ? (
                        <div className={styles.emptyState}>Loading…</div>
                    ) : activeMembers.length === 0 ? (
                        <div className={styles.emptyState}>No members found.</div>
                    ) : (
                        activeMembers.map(renderMember)
                    )}
                </div>
            </Card>

            {inactiveMembers.length > 0 && (
                <>
                    <h3 className={styles.sectionLabel}>Inactive Members</h3>
                    <Card noPadding>
                        <div className={styles.memberList}>
                            {inactiveMembers.map(renderMember)}
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
