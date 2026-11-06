import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { publicPageMetadata } from "@/lib/seo";
import { LegalDoc } from "../LegalDoc";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) return {};
    const t = await getTranslations({ locale, namespace: "legal.terms" });
    const tc = await getTranslations({ locale, namespace: "common" });
    return publicPageMetadata({
        locale,
        path: "/terms",
        title: t("title"),
        description: t("lead"),
        siteName: tc("appName"),
    });
}

export default async function TermsPage({ params }: Props) {
    setRequestLocale((await params).locale);
    return <LegalDoc doc="terms" />;
}
