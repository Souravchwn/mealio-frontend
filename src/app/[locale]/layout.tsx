import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/composed/ThemeProvider/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";

export default async function LocaleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html lang={locale} suppressHydrationWarning>
            <body>
                <ThemeProvider
                    attribute="data-theme"
                    defaultTheme="light"
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
