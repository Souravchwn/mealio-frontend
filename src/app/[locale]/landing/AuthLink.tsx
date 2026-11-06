"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * A landing-page link that sends signed-in people straight back into the app.
 * The prerendered HTML always carries the guest version, which is what crawlers see.
 */
export function AuthLink({
    href,
    memberHref,
    label,
    memberLabel,
    className,
    arrow,
    children,
}: {
    href: string;
    memberHref: string;
    label?: string;
    memberLabel?: string;
    className?: string;
    arrow?: boolean;
    children?: ReactNode;
}) {
    const { isAuthenticated } = useAuth();
    return (
        <Link href={isAuthenticated ? memberHref : href} className={className}>
            {children ?? (isAuthenticated && memberLabel ? memberLabel : label)}
            {arrow && <ArrowRight size={18} aria-hidden />}
        </Link>
    );
}
