/**
 * currencies.ts — Client. The currency list for pickers (Settings and the setup wizard).
 */

import { formatMoney } from "./money";

// The currencies messes use most, listed first; the rest follow alphabetically
const COMMON = [
    "BDT", "INR", "PKR", "NPR", "LKR", "USD", "GBP", "EUR", "AED", "SAR", "QAR", "KWD", "OMR",
    "MYR", "SGD", "CAD", "AUD", "JPY", "KRW", "EGP", "NGN", "KES",
];

export interface CurrencyOption {
    value: string;
    label: string;
    hint: string;
}

export function buildCurrencyOptions(locale: string, keep: string): CurrencyOption[] {
    let all: string[] = [];
    try {
        all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency") ?? [];
    } catch {
        all = [];
    }
    let names: Intl.DisplayNames | null = null;
    try {
        names = new Intl.DisplayNames([locale, "en"], { type: "currency" });
    } catch {
        names = null;
    }
    const codes = [...new Set([...COMMON, ...all.slice().sort(), ...(keep ? [keep] : [])])];
    return codes.map((code) => {
        const name = names?.of(code) ?? code;
        return { value: code, label: `${code} · ${name}`, hint: formatMoney(0, code).replace(/[\d.,\s]/g, "") };
    });
}
