"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import styles from "./LocaleSwitcher.module.css";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();

    function switchLocale(newLocale: string) {
        const segments = pathname.split("/");
        segments[1] = newLocale;
        router.push(segments.join("/"));
    }

    return (
        <div className={styles.root}>
            <button
                className={cn(styles.option, locale === "en" && styles.active)}
                onClick={() => switchLocale("en")}
                aria-label="Switch to English"
            >
                EN
            </button>
            <button
                className={cn(styles.option, locale === "bn" && styles.active)}
                onClick={() => switchLocale("bn")}
                aria-label="বাংলায় পরিবর্তন করুন"
            >
                বাং
            </button>
            <span
                className={styles.slider}
                style={{ transform: locale === "bn" ? "translateX(100%)" : "translateX(0)" }}
            />
        </div>
    );
}
