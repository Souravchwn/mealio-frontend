import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { publicPageMetadata } from "@/lib/seo";
import SupportPage from "./SupportPage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) return {};
    const t = await getTranslations({ locale, namespace: "meta" });
    const ts = await getTranslations({ locale, namespace: "support" });
    const tc = await getTranslations({ locale, namespace: "common" });
    return publicPageMetadata({
        locale,
        path: "/support",
        title: t("supportTitle"),
        description: ts("lead"),
        siteName: tc("appName"),
    });
}

export default async function Page({ params }: Props) {
    setRequestLocale((await params).locale);
    return <SupportPage />;
}
