import { cn } from "@/lib/utils";
import styles from "./Card.module.css";
import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    hoverable?: boolean;
    glow?: boolean;
    glass?: boolean;
    noPadding?: boolean;
    compact?: boolean;
    children: ReactNode;
}

export function Card({
    hoverable = false,
    glow = false,
    glass = false,
    noPadding = false,
    compact = false,
    className,
    children,
    ...props
}: CardProps) {
    return (
        <div
            className={cn(
                styles.root,
                hoverable && styles.hoverable,
                glow && styles.glow,
                glass && styles.glass,
                noPadding && styles.noPadding,
                compact && styles.compact,
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
