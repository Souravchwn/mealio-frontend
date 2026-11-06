import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Page not found | Manager Babu",
    robots: { index: false, follow: true },
};

/**
 * Shown for addresses outside a locale (e.g. /nope). The root layout renders no <html>,
 * so this page brings its own. Pages inside /en or /bn use Next's 404 within the locale layout.
 */
export default function RootNotFound() {
    return (
        <html lang="en">
            <body style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
                <main>
                    <h1>Page not found</h1>
                    <p>This page does not exist.</p>
                    <p>
                        <Link href="/en">Go to Manager Babu</Link>
                    </p>
                </main>
            </body>
        </html>
    );
}
