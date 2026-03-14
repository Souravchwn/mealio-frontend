"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card/Card";
import { FileText } from "lucide-react";
import styles from "./audit.module.css";

const MOCK_AUDIT = [
    { id: "1", adminName: "Sourav", action: "Meal Override", entity: "DailyLog", reason: "Member was sick, forgot to opt out", time: "2026-03-14 18:30", oldValue: '{"dinner": true}', newValue: '{"dinner": false}' },
    { id: "2", adminName: "Sourav", action: "Balance Adjustment", entity: "Member", reason: "Late deposit recorded", time: "2026-03-13 20:15", oldValue: '{"balance": 800}', newValue: '{"balance": 2800}' },
    { id: "3", adminName: "Sourav", action: "Role Change", entity: "Member", reason: "New meal manager for March", time: "2026-03-01 10:00", oldValue: '{"role": "MEMBER"}', newValue: '{"role": "MANAGER"}' },
];

export default function AuditPage() {
    const t = useTranslations("audit");

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle")}</p>
            </div>

            <div className={styles.auditList}>
                {MOCK_AUDIT.map((entry) => (
                    <Card key={entry.id} hoverable className={styles.auditCard}>
                        <div className={styles.auditHeader}>
                            <div className={styles.auditIcon}>
                                <FileText size={16} />
                            </div>
                            <div className={styles.auditMeta}>
                                <strong>{entry.adminName}</strong> · {entry.action}
                                <span className={styles.auditTime}>{entry.time}</span>
                            </div>
                        </div>
                        <div className={styles.auditReason}>
                            <span className={styles.reasonLabel}>{t("reason")}:</span>{" "}
                            {entry.reason}
                        </div>
                        <div className={styles.auditDiff}>
                            <div className={styles.diffOld}>
                                <span className={styles.diffLabel}>{t("oldValue")}</span>
                                <code>{entry.oldValue}</code>
                            </div>
                            <div className={styles.diffNew}>
                                <span className={styles.diffLabel}>{t("newValue")}</span>
                                <code>{entry.newValue}</code>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
