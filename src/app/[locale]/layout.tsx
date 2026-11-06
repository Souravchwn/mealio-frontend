import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Hind_Siliguri, Inter, Space_Grotesk } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/composed/ThemeProvider/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";

// Self-hosted at build time (no render-blocking request to Google), with size-adjusted fallbacks
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    weight: ["500", "600", "700"],
    variable: "--font-space-grotesk",
    display: "swap",
});
const hindSiliguri = Hind_Siliguri({
    subsets: ["bengali", "latin"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-hind-siliguri",
    display: "swap",
    preload: false, // only Bangla pages use it
});

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

/** Defaults for every page in a locale. Indexable pages add their own canonical (src/lib/seo.ts). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) return {};
    const t = await getTranslations({ locale, namespace: "meta" });
    const appName = (await getTranslations({ locale, namespace: "common" }))("appName");
    return {
        metadataBase: new URL(SITE_URL),
        title: { default: t("homeTitle"), template: `%s | ${appName}` },
        description: t("description"),
        applicationName: appName,
        openGraph: { type: "website", siteName: appName, title: t("homeTitle"), description: t("description") },
        twitter: { card: "summary_large_image" },
    };
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    // Unknown first segments (/robots.txt used to land here, as did /anything) are real 404s
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);
    const messages = await getMessages();

    return (
        <html
            lang={locale}
            className={`${inter.variable} ${spaceGrotesk.variable} ${hindSiliguri.variable}`}
            suppressHydrationWarning
        >
            <body>
                <ThemeProvider
                    attribute="data-theme"
                    defaultTheme="dark"
                    enableSystem={false}
                    disableTransitionOnChange
                >
                    <AuthProvider>
                        <NextIntlClientProvider messages={messages}>
                            {children}
                            <Toaster
                                position="top-right"
                                richColors
                                closeButton
                                toastOptions={{
                                    style: {
                                        fontFamily:
                                            locale === "bn"
                                                ? "var(--font-bangla)"
                                                : "var(--font-primary)",
                                    },
                                }}
                            />
                        </NextIntlClientProvider>
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
