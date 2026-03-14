import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import { Toaster } from "sonner";

export default async function LocaleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html lang={locale} data-theme="light">
            <body>
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
            </body>
        </html>
    );
}
