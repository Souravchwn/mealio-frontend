"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Plus, TrendingUp, Search } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { cn, formatCurrency, getCategoryColor } from "@/lib/utils";
import type { ExpenseCategory } from "@/types";
import styles from "./expenses.module.css";

const MOCK_EXPENSES = [
    { id: "1", description: "Rui Fish — Karwan Bazar", amount: 850, category: "PROTEIN" as ExpenseCategory, date: "2026-03-14", memberName: "Rahat" },
    { id: "2", description: "Rice (25kg) — Hatirjheel", amount: 1400, category: "CARB" as ExpenseCategory, date: "2026-03-14", memberName: "Sourav" },
    { id: "3", description: "Mixed Vegetables", amount: 450, category: "VEGETABLE" as ExpenseCategory, date: "2026-03-13", memberName: "Rahat" },
    { id: "4", description: "Cooking Oil (5L)", amount: 680, category: "OIL" as ExpenseCategory, date: "2026-03-13", memberName: "Sourav" },
    { id: "5", description: "Eggs (30pcs)", amount: 420, category: "PROTEIN" as ExpenseCategory, date: "2026-03-12", memberName: "Rahat" },
    { id: "6", description: "Spice Mix", amount: 180, category: "SPICE" as ExpenseCategory, date: "2026-03-12", memberName: "Rahat" },
    { id: "7", description: "Gas Cylinder", amount: 1200, category: "UTILITY" as ExpenseCategory, date: "2026-03-11", memberName: "Sourav" },
    { id: "8", description: "Potatoes & Onions", amount: 320, category: "VEGETABLE" as ExpenseCategory, date: "2026-03-11", memberName: "Rahat" },
];

export default function ExpensesPage() {
    const t = useTranslations("expenses");
    const tc = useTranslations("common");
    const locale = useLocale();
    const [showForm, setShowForm] = useState(false);

    const totalExpense = MOCK_EXPENSES.reduce((sum, e) => sum + e.amount, 0);
    const mealRate = 87.5;

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)}>
                    <Plus size={18} />
                    {t("addExpense")}
                </Button>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <Card compact>
                    <div className={styles.miniStat}>
                        <span className={styles.miniStatLabel}>{t("totalExpense")}</span>
                        <span className={styles.miniStatValue}>
                            {formatCurrency(totalExpense, locale)}
                        </span>
                    </div>
                </Card>
                <Card compact>
                    <div className={styles.miniStat}>
                        <span className={styles.miniStatLabel}>{t("mealRate")}</span>
                        <span className={cn(styles.miniStatValue, styles.primaryText)}>
                            {formatCurrency(mealRate, locale)}
                        </span>
                    </div>
                </Card>
            </div>

            {/* Add Expense Form */}
            {showForm && (
                <Card className={styles.formCard}>
                    <h3 className={styles.formTitle}>{t("addExpense")}</h3>
                    <form
                        className={styles.form}
                        onSubmit={(e) => {
                            e.preventDefault();
                            setShowForm(false);
                        }}
                    >
                        <div className={styles.formRow}>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("amount")}</label>
                                <input
                                    className={styles.input}
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("category")}</label>
                                <select className={styles.select}>
                                    {(
                                        [
                                            "PROTEIN",
                                            "CARB",
                                            "VEGETABLE",
                                            "SPICE",
                                            "OIL",
                                            "UTILITY",
                                            "OTHER",
                                        ] as ExpenseCategory[]
                                    ).map((cat) => (
                                        <option key={cat} value={cat}>
                                            {t(`categories.${cat}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className={styles.formRow}>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("description")}</label>
                                <input
                                    className={styles.input}
                                    type="text"
                                    placeholder="e.g. Rui fish from Karwan Bazar"
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("date")}</label>
                                <input className={styles.input} type="date" />
                            </div>
                        </div>
                        <div className={styles.formActions}>
                            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>
                                {tc("cancel")}
                            </Button>
                            <Button type="submit">{tc("save")}</Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Expense List */}
            <Card noPadding>
                <div className={styles.listHeader}>
                    <div className={styles.searchWrap}>
                        <Search size={16} />
                        <input
                            className={styles.searchInput}
                            type="text"
                            placeholder={tc("search")}
                        />
                    </div>
                </div>
                <div className={styles.expenseList}>
                    {MOCK_EXPENSES.map((expense) => (
                        <div key={expense.id} className={styles.expenseRow}>
                            <div
                                className={styles.categoryDot}
                                style={{ backgroundColor: getCategoryColor(expense.category) }}
                            />
                            <div className={styles.expenseInfo}>
                                <span className={styles.expenseDesc}>
                                    {expense.description}
                                </span>
                                <span className={styles.expenseMeta}>
                                    {expense.date} · {expense.memberName} ·{" "}
                                    <span
                                        className={styles.categoryTag}
                                        style={{
                                            backgroundColor: getCategoryColor(expense.category) + "18",
                                            color: getCategoryColor(expense.category),
                                        }}
                                    >
                                        {t(`categories.${expense.category}`)}
                                    </span>
                                </span>
                            </div>
                            <span className={styles.expenseAmount}>
                                {formatCurrency(expense.amount, locale)}
                            </span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}
