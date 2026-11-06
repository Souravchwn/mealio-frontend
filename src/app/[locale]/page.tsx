import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SITE_URL, publicPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import LandingPage from "./LandingPage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) return {};
    const t = await getTranslations({ locale, namespace: "meta" });
    const tc = await getTranslations({ locale, namespace: "common" });
    return publicPageMetadata({
        locale,
        path: "",
        title: t("homeTitle"),
        description: t("description"),
        absoluteTitle: true,
        siteName: tc("appName"),
    });
}

export default async function Page({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations({ locale, namespace: "meta" });
    const tc = await getTranslations({ locale, namespace: "common" });
    const url = `${SITE_URL}/${locale}`;

    return (
        <>
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@graph": [
                        {
                            "@type": "WebSite",
                            "@id": `${SITE_URL}/#website`,
                            name: tc("appName"),
                            url,
                            inLanguage: locale,
                        },
                        {
                            "@type": "WebApplication",
                            "@id": `${SITE_URL}/#app`,
                            name: tc("appName"),
                            url,
                            description: t("description"),
                            applicationCategory: "LifestyleApplication",
                            operatingSystem: "Web",
                            browserRequirements: "Requires JavaScript",
                            isAccessibleForFree: true,
                            inLanguage: routing.locales,
                        },
                    ],
                }}
            />
            <LandingPage />
        </>
    );
}
