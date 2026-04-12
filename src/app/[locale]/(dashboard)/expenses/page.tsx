"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { cn, formatCurrency, getCategoryColor } from "@/lib/utils";
import type { ExpenseCategory, ExpenseResponse } from "@/types";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import styles from "./expenses.module.css";

const CATEGORIES: ExpenseCategory[] = ["PROTEIN", "CARB", "VEGETABLE", "SPICE", "OIL", "UTILITY", "OTHER"];

export default function ExpensesPage() {
    const t = useTranslations("expenses");
    const tc = useTranslations("common");
    const { user, token } = useAuth();

    const currentMonth = new Date().toISOString().slice(0, 7);

    const [expenses, setExpenses] = useState<ExpenseResponse[]>([]);
    const [mealRate, setMealRate] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Edit form state
    const [editAmount, setEditAmount] = useState("");
    const [editCategory, setEditCategory] = useState<ExpenseCategory>("PROTEIN");
    const [editDescription, setEditDescription] = useState("");
    const [editDate, setEditDate] = useState("");

    // Add form state
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState<ExpenseCategory>("PROTEIN");
    const [description, setDescription] = useState("");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

    useEffect(() => {
        if (!user || !token) return;
        Promise.allSettled([
            api.expenses.getExpenses(user.messId, currentMonth, token),
            api.expenses.getMealRate(user.messId, currentMonth, token),
        ]).then(([expRes, rateRes]) => {
            if (expRes.status === "fulfilled") setExpenses(expRes.value);
            if (rateRes.status === "fulfilled") setMealRate(Number(rateRes.value.mealRate));
            setLoading(false);
        });
    }, [user, token, currentMonth]);

    const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const canAddExpense = user?.role === "ADMIN" || user?.role === "MANAGER";

    const filtered = search.trim()
        ? expenses.filter(
              (e) =>
                  (e.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
                  e.memberName.toLowerCase().includes(search.toLowerCase())
          )
        : expenses;

    const isAdmin = user?.role === "ADMIN";

    function startEdit(expense: ExpenseResponse) {
        setEditingId(expense.id);
        setEditAmount(String(expense.amount));
        setEditCategory(expense.category as ExpenseCategory);
        setEditDescription(expense.description ?? "");
        setEditDate(expense.date);
    }

    function cancelEdit() {
        setEditingId(null);
    }

    async function handleEditSave(id: string) {
        if (!token) return;
        try {
            await api.admin.updateExpense(
                id,
                { amount: Number(editAmount), category: editCategory, description: editDescription, date: editDate },
                token
            );
            setExpenses((prev) =>
                prev.map((e) =>
                    e.id === id
                        ? { ...e, amount: Number(editAmount), category: editCategory, description: editDescription, date: editDate }
                        : e
                )
            );
            setEditingId(null);
            toast.success("Expense updated");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update expense");
        }
    }

    async function handleDelete(id: string) {
        if (!token) return;
        setDeletingId(id);
        try {
            await api.admin.deleteExpense(id, token);
            setExpenses((prev) => prev.filter((e) => e.id !== id));
            toast.success("Expense deleted");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete expense");
        } finally {
            setDeletingId(null);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || !token) return;
        setSubmitting(true);
        try {
            const newExpense = await api.expenses.addExpense(
                {
                    messId: user.messId,
                    memberId: user.id,
                    amount: Number(amount),
                    category,
                    description,
                    date,
                },
                token
            );
            setExpenses((prev) => [newExpense, ...prev]);
            setMealRate(Number(newExpense.liveMealRate));
            setShowForm(false);
            setAmount("");
            setDescription("");
            setDate(new Date().toISOString().slice(0, 10));
            toast.success("Expense added");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to add expense");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t("title")}</h2>
                    <p className={styles.subtitle}>{t("subtitle")}</p>
                </div>
                {canAddExpense && (
                    <Button onClick={() => setShowForm(!showForm)}>
                        <Plus size={18} />
                        {t("addExpense")}
                    </Button>
                )}
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <Card compact>
                    <div className={styles.miniStat}>
                        <span className={styles.miniStatLabel}>{t("totalExpense")}</span>
                        <span className={styles.miniStatValue}>
                            {loading ? "—" : formatCurrency(totalExpense)}
                        </span>
                    </div>
                </Card>
                <Card compact>
                    <div className={styles.miniStat}>
                        <span className={styles.miniStatLabel}>{t("mealRate")}</span>
                        <span className={cn(styles.miniStatValue, styles.primaryText)}>
                            {loading ? "—" : formatCurrency(mealRate)}
                        </span>
                    </div>
                </Card>
            </div>

            {/* Add Expense Form */}
            {showForm && canAddExpense && (
                <Card className={styles.formCard}>
                    <h3 className={styles.formTitle}>{t("addExpense")}</h3>
                    <form className={styles.form} onSubmit={handleSubmit}>
                        <div className={styles.formRow}>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("amount")}</label>
                                <input
                                    className={styles.input}
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    required
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("category")}</label>
                                <select
                                    className={styles.select}
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                                >
                                    {CATEGORIES.map((cat) => (
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
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>{t("date")}</label>
                                <input
                                    className={styles.input}
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className={styles.formActions}>
                            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>
                                {tc("cancel")}
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? tc("loading") || "Saving…" : tc("save")}
                            </Button>
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
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className={styles.expenseList}>
                    {loading ? (
                        <div className={styles.expenseRow} style={{ justifyContent: "center", color: "var(--color-text-muted)" }}>
                            Loading…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className={styles.expenseRow} style={{ justifyContent: "center", color: "var(--color-text-muted)" }}>
                            No expenses this month.
                        </div>
                    ) : (
                        filtered.map((expense) => {
                            const isEditing = editingId === expense.id;
                            const isDeleting = deletingId === expense.id;
                            return (
                                <div key={expense.id} className={cn(styles.expenseRow, isEditing && styles.expenseRowEditing)}>
                                    {isEditing ? (
                                        <div className={styles.editInline}>
                                            <input
                                                className={styles.editInput}
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                value={editAmount}
                                                onChange={(e) => setEditAmount(e.target.value)}
                                                placeholder="Amount"
                                            />
                                            <select
                                                className={styles.editSelect}
                                                value={editCategory}
                                                onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)}
                                            >
                                                {CATEGORIES.map((cat) => (
                                                    <option key={cat} value={cat}>{t(`categories.${cat}`)}</option>
                                                ))}
                                            </select>
                                            <input
                                                className={styles.editInput}
                                                type="text"
                                                value={editDescription}
                                                onChange={(e) => setEditDescription(e.target.value)}
                                                placeholder="Description"
                                            />
                                            <input
                                                className={styles.editInput}
                                                type="date"
                                                value={editDate}
                                                onChange={(e) => setEditDate(e.target.value)}
                                            />
                                            <div className={styles.editActions}>
                                                <button className={styles.iconBtnSave} onClick={() => void handleEditSave(expense.id)} aria-label="Save">
                                                    <Check size={14} />
                                                </button>
                                                <button className={styles.iconBtnCancel} onClick={cancelEdit} aria-label="Cancel">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div
                                                className={styles.categoryDot}
                                                style={{ backgroundColor: getCategoryColor(expense.category) }}
                                            />
                                            <div className={styles.expenseInfo}>
                                                <span className={styles.expenseDesc}>
                                                    {expense.description || "—"}
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
                                                {formatCurrency(Number(expense.amount))}
                                            </span>
                                            {isAdmin && (
                                                <div className={styles.expenseActions}>
                                                    <button
                                                        className={styles.iconBtn}
                                                        onClick={() => startEdit(expense)}
                                                        aria-label="Edit"
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        className={cn(styles.iconBtn, styles.iconBtnDanger)}
                                                        onClick={() => void handleDelete(expense.id)}
                                                        disabled={isDeleting}
                                                        aria-label="Delete"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>
        </div>
    );
}
