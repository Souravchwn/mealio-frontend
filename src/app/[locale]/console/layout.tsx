import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleAuthProvider } from "./ConsoleAuth";
import { ConsoleShell } from "./ConsoleShell";

export const metadata: Metadata = {
    title: "Mealtill Console",
    robots: { index: false, follow: false },
};

export default function ConsoleLayout({ children }: { children: ReactNode }) {
    return (
        <ConsoleAuthProvider>
            <ConsoleShell>{children}</ConsoleShell>
        </ConsoleAuthProvider>
    );
}
