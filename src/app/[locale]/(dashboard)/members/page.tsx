"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Share2, Send, ChevronDown, UserX, UserCheck, Phone, Search, KeyRound, Check, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { cn, formatCurrency, getInitials, localISODate } from "@/lib/utils";
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
    isActive: boolean;
    guestFrom: string | null;
    guestUntil: string | null;
}

interface JoinRequest {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    requestedAt: string;
}

const ROLES = ["ADMIN", "MANAGER", "MEMBER", "GUEST"] as const;

export default function MembersPage() {
    const t = useTranslations("members");
    const locale = useLocale();
    const { user, token } = useAuth();

    const [members, setMembers] = useState<MemberRow[]>([]);
    const [messName, setMessName] = useState("");
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
    const [query, setQuery] = useState("");
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [decidingId, setDecidingId] = useState<string | null>(null);
    const [resetCode, setResetCode] = useState<{ memberId: string; code: string; minutes: number } | null>(null);

    const isAdmin = user?.role === "ADMIN";

    const loadMembers = useCallback(() => {
        if (!user || !token) return;
        api.members
            .list(user.messId, token, { includeInactive: isAdmin })
            .then((res) => {
                setMessName(res.messName);
                setMembers(res.members.map((m) => ({ ...m, isActive: m.isActive ?? true })));
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : t("loadFailed")))
            .finally(() => setLoading(false));
    }, [user, token, isAdmin, t]);

    const loadRequests = useCallback(() => {
        if (!token || !isAdmin) return;
        api.members
            .pending(token)
            .then((r) => setRequests(r.pending))
            .catch(() => {});
    }, [token, isAdmin]);

    useEffect(() => {
        loadMembers();
        loadRequests();
        if (token) {
            api.mess.list(token).then((d) => setInviteCode(d.messes.find((m) => m.isCurrent)?.inviteCode ?? null)).catch(() => {});
        }
    }, [loadMembers, loadRequests, token]);

    async function decide(req: JoinRequest, decision: "approve" | "reject") {
        if (!token) return;
        setDecidingId(req.id);
        try {
            await api.members.decideJoin(req.id, decision, token);
            toast.success(decision === "approve" ? t("approved", { name: req.name }) : t("rejected", { name: req.name }));
            setRequests((prev) => prev.filter((r) => r.id !== req.id));
            if (decision === "approve") loadMembers();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("updateFailed"));
        } finally {
            setDecidingId(null);
        }
    }

    async function issueResetCode(member: MemberRow) {
        if (!token) return;
        setSavingId(member.id);
        try {
            const r = await api.members.resetCode(member.id, token);
            setResetCode({ memberId: member.id, code: r.code, minutes: r.minutes });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("updateFailed"));
        } finally {
            setSavingId(null);
        }
    }

    async function copyText(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(t("copied"));
        } catch {
            /* clipboard blocked; the code is on screen */
        }
    }

    async function handleRoleSave(member: MemberRow) {
        if (!token) return;
        const newRole = pendingRoles[member.id] ?? member.role;
        setSavingId(member.id);
        try {
            await api.admin.updateMember(member.id, { role: newRole }, token);
            toast.success(t("roleChanged", { name: member.name, role: t(`roles.${newRole}`) }));
            setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: newRole, isGuest: newRole === "GUEST" } : m)));
            setExpandedId(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("updateFailed"));
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
            toast.success(newActive ? t("reactivated", { name: member.name }) : t("deactivated", { name: member.name }));
            setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, isActive: newActive } : m)));
            setExpandedId(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t("updateFailed"));
        } finally {
            setSavingId(null);
        }
    }

    // Share a real join link: register page with the invite code pre-filled
    async function shareInvite() {
        const url = `${window.location.origin}/${locale}/register${inviteCode ? `?code=${encodeURIComponent(inviteCode)}` : ""}`;
        const text = t("shareText", { mess: messName });
        try {
            if (navigator.share) {
                await navigator.share({ title: "Mealio", text, url });
                return;
            }
        } catch {
            return; // user closed the share sheet
        }
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success(t("linkCopied"));
    }

    const today = localISODate();
    const isGuestExpired = (m: MemberRow) => m.isGuest && !!m.guestUntil && m.guestUntil < today;
    const fmtDate = (d: string) =>
        new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

    const q = query.trim().toLowerCase();
    const visible = q ? members.filter((m) => m.name.toLowerCase().includes(q) || (m.phone ?? "").includes(q)) : members;
    const activeMembers = visible.filter((m) => m.isActive);
    const inactiveMembers = visible.filter((m) => !m.isActive);
    const activeCount = members.filter((m) => m.isActive).length;

    function renderMember(member: MemberRow) {
        const isExpanded = expandedId === member.id;
        const isSaving = savingId === member.id;
        const pendingRole = pendingRoles[member.id] ?? member.role;
        const isSelf = member.id === user?.id;
        const canManage = isAdmin && !isSelf;

        return (
            <li key={member.id} className={cn(styles.memberRow, !member.isActive && styles.inactiveRow, isExpanded && styles.memberRowOpen)}>
                <button
                    type="button"
                    className={styles.memberMain}
                    onClick={() => canManage && setExpandedId(isExpanded ? null : member.id)}
                    aria-expanded={canManage ? isExpanded : undefined}
                    disabled={!canManage}
                >
                    <span className={cn(styles.memberAvatar, styles[`avatar_${member.role}`])}>{getInitials(member.name)}</span>
                    <span className={styles.memberInfo}>
                        <span className={styles.memberNameRow}>
                            <span className={styles.memberName}>{member.name}</span>
                            {member.telegramLinked && (
                                <span className={styles.telegramBadge} title={t("telegramLinked")}>
                                    <Send size={10} />
                                </span>
                            )}
                        </span>
                        <span className={styles.memberSub}>
                            <span className={cn(styles.rolePill, styles[`role_${member.role}`])}>{t(`roles.${member.role}`)}</span>
                            {member.isGuest && (
                                <span className={cn(styles.badge, isGuestExpired(member) ? styles.badgeExpired : styles.badgeGuest)}>
                                    {isGuestExpired(member) ? t("expired") : t("guestStay")}
                                </span>
                            )}
                            {!member.isActive && <span className={cn(styles.badge, styles.badgeInactive)}>{t("inactive")}</span>}
                        </span>
                    </span>
                    <span className={styles.memberRight}>
                        {!member.isGuest && (
                            <span className={cn(styles.balance, "num", member.balance >= 0 ? styles.positive : styles.negative)}>
                                {member.balance < 0 && "−"}
                                {formatCurrency(Math.abs(member.balance))}
                            </span>
                        )}
                        {canManage && <ChevronDown size={18} className={cn(styles.chevron, isExpanded && styles.chevronOpen)} />}
                    </span>
                </button>

                {isExpanded && canManage && (
                    <div className={styles.adminPanel}>
                        {member.phone && (
                            <a className={styles.callLink} href={`tel:${member.phone}`}>
                                <Phone size={16} /> {member.phone}
                            </a>
                        )}
                        <label className={styles.adminLabel} htmlFor={`role-${member.id}`}>{t("role")}</label>
                        <div className={styles.roleChips} role="radiogroup" id={`role-${member.id}`}>
                            {ROLES.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    role="radio"
                                    aria-checked={pendingRole === r}
                                    className={cn(styles.roleChip, pendingRole === r && styles.roleChipActive)}
                                    onClick={() => setPendingRoles((prev) => ({ ...prev, [member.id]: r }))}
                                >
                                    {t(`roles.${r}`)}
                                </button>
                            ))}
                        </div>
                        {member.isGuest && member.guestFrom && member.guestUntil && (
                            <p className={styles.guestDates}>
                                {t("stayDates", { from: fmtDate(member.guestFrom), until: fmtDate(member.guestUntil) })}
                            </p>
                        )}
                        {resetCode?.memberId === member.id ? (
                            <div className={styles.codeBox}>
                                <span className={styles.adminLabel}>{t("resetCodeTitle")}</span>
                                <span className={styles.codeValue}>
                                    <b className="num">{resetCode.code}</b>
                                    <button type="button" className={styles.iconBtn} onClick={() => void copyText(resetCode.code)} aria-label={t("copy")}>
                                        <Copy size={16} />
                                    </button>
                                </span>
                                <span className={styles.guestDates}>{t("resetCodeHelp", { minutes: resetCode.minutes })}</span>
                            </div>
                        ) : (
                            <button type="button" className={styles.textAction} disabled={isSaving} onClick={() => void issueResetCode(member)}>
                                <KeyRound size={16} /> {t("resetCode")}
                            </button>
                        )}
                        <div className={styles.adminActions}>
                            <Button
                                variant={member.isActive ? "danger" : "secondary"}
                                size="small"
                                disabled={isSaving}
                                onClick={() => void handleToggleActive(member)}
                            >
                                {member.isActive ? <><UserX size={16} /> {t("deactivate")}</> : <><UserCheck size={16} /> {t("reactivate")}</>}
                            </Button>
                            <Button size="small" disabled={isSaving || pendingRole === member.role} onClick={() => void handleRoleSave(member)}>
                                {isSaving ? t("saving") : t("saveRole")}
                            </Button>
                        </div>
                    </div>
                )}
            </li>
        );
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h2 className={styles.title}>{messName || t("title")}</h2>
                    <p className={styles.subtitle}>{t("activeCount", { n: activeCount })}</p>
                </div>
                {isAdmin && (
                    <Button variant="accent" size="small" onClick={() => void shareInvite()}>
                        <Share2 size={16} />
                        {t("invite")}
                    </Button>
                )}
            </header>

            <label className={styles.search}>
                <Search size={16} />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("searchPlaceholder")}
                />
            </label>

            {requests.length > 0 && (
                <section className={styles.requests} aria-labelledby="join-requests">
                    <h3 id="join-requests" className={styles.requestsTitle}>
                        {t("requestsTitle")} <span className={styles.countBubble}>{requests.length}</span>
                    </h3>
                    <ul className={styles.memberList}>
                        {requests.map((r) => (
                            <li key={r.id} className={styles.requestRow}>
                                <span className={styles.memberAvatar}>{getInitials(r.name)}</span>
                                <span className={styles.memberInfo}>
                                    <span className={styles.memberName}>{r.name}</span>
                                    <span className={styles.requestMeta}>{r.email}{r.phone ? ` · ${r.phone}` : ""}</span>
                                </span>
                                <span className={styles.requestActions}>
                                    <button
                                        type="button"
                                        className={cn(styles.decideBtn, styles.rejectBtn)}
                                        disabled={decidingId === r.id}
                                        onClick={() => void decide(r, "reject")}
                                        aria-label={t("reject", { name: r.name })}
                                    >
                                        <X size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        className={cn(styles.decideBtn, styles.approveBtn)}
                                        disabled={decidingId === r.id}
                                        onClick={() => void decide(r, "approve")}
                                        aria-label={t("approve", { name: r.name })}
                                    >
                                        <Check size={18} strokeWidth={3} />
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <ul className={styles.memberList}>
                {loading ? (
                    [0, 1, 2, 3].map((i) => <li key={i} className={styles.skeletonRow} />)
                ) : activeMembers.length === 0 ? (
                    <li className={styles.emptyState}>{t("empty")}</li>
                ) : (
                    activeMembers.map(renderMember)
                )}
            </ul>

            {inactiveMembers.length > 0 && (
                <>
                    <h3 className={styles.sectionLabel}>{t("inactiveTitle")}</h3>
                    <ul className={styles.memberList}>{inactiveMembers.map(renderMember)}</ul>
                </>
            )}
        </div>
    );
}
