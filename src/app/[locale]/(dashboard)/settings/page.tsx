"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Save, AlertTriangle } from "lucide-react";
import styles from "./settings.module.css";

export default function SettingsPage() {
    const t = useTranslations("settings");

    return (
        <div className={styles.page}>
            <div>
                <h2 className={styles.title}>{t("title")}</h2>
                <p className={styles.subtitle}>{t("subtitle")}</p>
            </div>

            <Card>
                <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
                    <div className={styles.field}>
                        <label className={styles.label}>{t("messName")}</label>
                        <input
                            className={styles.input}
                            type="text"
                            defaultValue="Bashundhara Mess"
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>{t("cutoffTime")}</label>
                        <input
                            className={styles.input}
                            type="time"
                            defaultValue="21:00"
                        />
                        <span className={styles.helpText}>{t("cutoffHelp")}</span>
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>{t("inviteCode")}</label>
                        <div className={styles.codeRow}>
                            <input
                                className={styles.input}
                                type="text"
                                value="MESS-4X2K"
                                readOnly
                            />
                            <Button variant="secondary" size="small" type="button">
                                {t("regenerateCode")}
                            </Button>
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        <Button type="submit">
                            <Save size={16} />
                            {t("saveChanges")}
                        </Button>
                    </div>
                </form>
            </Card>

            <Card className={styles.dangerCard}>
                <div className={styles.dangerHeader}>
                    <AlertTriangle size={20} />
                    <h3>{t("dangerZone")}</h3>
                </div>
                <p className={styles.dangerDesc}>
                    This action will permanently delete your mess and all associated data.
                </p>
                <Button variant="danger" size="small">
                    {t("deleteMess")}
                </Button>
            </Card>
        </div>
    );
}
