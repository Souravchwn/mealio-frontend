"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Download, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { cn, formatCurrency } from "@/lib/utils";
import styles from "./matrix.module.css";

// Generate mock data
const MEMBERS = [
    "Sourav", "Rahat", "Tahmid", "Fahim", "Sakib",
    "Nayeem", "Arif", "Jubayer", "Rifat", "Mamun",
    "Kabir", "Shanto", "Tuhin", "Rony",
];

function generateMockMatrix() {
    const daysInMonth = 31; // March 2026
    return MEMBERS.map((name, idx) => {
        const days = Array.from({ length: daysInMonth }, (_, d) => {
            const r = Math.random();
            return {
                date: `2026-03-${String(d + 1).padStart(2, "0")}`,
                breakfast: r > 0.2,
                lunch: r > 0.1,
                dinner: r > 0.3,
                guestCount: r > 0.9 ? 1 : 0,
            };
        });
        const totalMeals = days.reduce(
            (sum, d) =>
                sum +
                (d.breakfast ? 1 : 0) +
                (d.lunch ? 1 : 0) +
                (d.dinner ? 1 : 0) +
                d.guestCount * 3,
            0
        );
        return {
            memberId: String(idx),
            memberName: name,
            days,
            totalMeals,
            totalAmount: totalMeals * 87.5,
            balance: 6000 - totalMeals * 87.5,
        };
    });
}

const MOCK_MEMBERS = generateMockMatrix();

export default function MatrixPage() {
    const t = useTranslations("matrix");
    const tc = useTranslations("common");
    const locale = useLocale();
    const [selectedMonth, setSelectedMonth] = useState("2026-03");

    const totalExpense = 45000;
    const totalMeals = MOCK_MEMBERS.reduce((s, m) => s + m.totalMeals, 0);
    const mealRate = totalExpense / totalMeals;
    const daysInMonth = 31;

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                <div className={styles.headerActions}>
                    <Button variant="secondary" size="small">
                        <Download size={16} />
                        {t("exportCsv")}
                    </Button>
                    <Button size="small">
                        <Lock size={16} />
                        {t("closeMonth")}
                    </Button>
                </div>
            </div>

            {/* Month Selector */}
            <div className={styles.monthSelector}>
                <button className={styles.monthBtn}>
                    <ChevronLeft size={20} />
                </button>
                <span className={styles.monthLabel}>
                    {new Date(selectedMonth + "-01").toLocaleDateString(
                        locale === "bn" ? "bn-BD" : "en-US",
                        { year: "numeric", month: "long" }
                    )}
                </span>
                <button className={styles.monthBtn}>
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.totalExpense")}</span>
                    <span className={styles.summaryValue}>
                        {formatCurrency(totalExpense, locale)}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.totalMeals")}</span>
                    <span className={styles.summaryValue}>{totalMeals}</span>
                </div>
                <div className={cn(styles.summaryCard, styles.summaryPrimary)}>
                    <span className={styles.summaryLabel}>{t("summary.mealRate")}</span>
                    <span className={styles.summaryValue}>
                        {formatCurrency(mealRate, locale)}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>{t("summary.members")}</span>
                    <span className={styles.summaryValue}>{MEMBERS.length}</span>
                </div>
            </div>

            {/* Matrix Table */}
            <Card noPadding>
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.stickyCol}>{t("member")}</th>
                                {Array.from({ length: daysInMonth }, (_, i) => (
                                    <th key={i} className={styles.dayHeader}>
                                        {i + 1}
                                    </th>
                                ))}
                                <th className={styles.totalHeader}>{t("totalMeals")}</th>
                                <th className={styles.totalHeader}>{t("amount")}</th>
                                <th className={styles.totalHeader}>{t("balance")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_MEMBERS.map((member) => (
                                <tr key={member.memberId} className={styles.row}>
                                    <td className={styles.stickyCol}>
                                        <span className={styles.memberName}>
                                            {member.memberName}
                                        </span>
                                    </td>
                                    {member.days.map((day, i) => {
                                        const mealsOn =
                                            (day.breakfast ? 1 : 0) +
                                            (day.lunch ? 1 : 0) +
                                            (day.dinner ? 1 : 0);
                                        return (
                                            <td key={i} className={styles.dayCell}>
                                                <span
                                                    className={cn(
                                                        styles.cellDot,
                                                        mealsOn === 3 && styles.cellFull,
                                                        mealsOn > 0 && mealsOn < 3 && styles.cellPartial,
                                                        mealsOn === 0 && styles.cellOff,
                                                        day.guestCount > 0 && styles.cellGuest
                                                    )}
                                                    title={`B:${day.breakfast ? "✓" : "✗"} L:${day.lunch ? "✓" : "✗"} D:${day.dinner ? "✓" : "✗"}${day.guestCount > 0 ? ` G:${day.guestCount}` : ""}`}
                                                >
                                                    {mealsOn}
                                                </span>
                                            </td>
                                        );
                                    })}
                                    <td className={styles.totalCell}>
                                        <strong>{member.totalMeals}</strong>
                                    </td>
                                    <td className={styles.totalCell}>
                                        {formatCurrency(member.totalAmount, locale)}
                                    </td>
                                    <td
                                        className={cn(
                                            styles.totalCell,
                                            member.balance >= 0
                                                ? styles.positive
                                                : styles.negative
                                        )}
                                    >
                                        <strong>
                                            {formatCurrency(Math.abs(member.balance), locale)}
                                        </strong>
                                        {member.balance < 0 && (
                                            <span className={styles.owes}>owes</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
