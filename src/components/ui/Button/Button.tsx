import { cn } from "@/lib/utils";
import styles from "./Button.module.css";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
    size?: "small" | "medium" | "large";
    loading?: boolean;
    fullWidth?: boolean;
    children: ReactNode;
}

export function Button({
    variant = "primary",
    size = "medium",
    loading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    ...props
}: ButtonProps) {
    return (
        <button
            className={cn(
                styles.root,
                styles[variant],
                styles[size],
                fullWidth && styles.fullWidth,
                (disabled || loading) && styles.disabled,
                className
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className={styles.spinner} />}
            {children}
        </button>
    );
}
