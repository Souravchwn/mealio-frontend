/**
 * money.ts — Currency for a mess. Shared by the server and the browser (no imports).
 *
 * Every mess keeps its accounts in one currency (messes.currency, an ISO 4217 code like BDT,
 * INR or USD). Amounts are stored as plain numbers; only the way they are shown changes.
 */

export const DEFAULT_CURRENCY = 'BDT'

let knownCurrencies: Set<string> | null = null

/**
 * True for a real ISO 4217 code. Intl.NumberFormat formats any three capital letters ("XYZ"),
 * so the runtime's own list of currencies decides; very old runtimes fall back to the shape.
 */
export function isValidCurrency(code: unknown): code is string {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false
  if (!knownCurrencies) {
    try {
      const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency')
      knownCurrencies = new Set(list ?? [])
    } catch {
      knownCurrencies = new Set()
    }
  }
  if (knownCurrencies.size > 0) return knownCurrencies.has(code)
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code })
    return true
  } catch {
    return false
  }
}

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * "৳1,250.00", "$1,250.00", "€1,250.00", "¥1,250". Uses the currency's own decimals
 * (yen has none) and the short local symbol where one exists.
 */
export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const code = isValidCurrency(currency) ? currency : DEFAULT_CURRENCY
  let f = formatters.get(code)
  if (!f) {
    try {
      f = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
    } catch {
      // Older engines without narrowSymbol
      f = new Intl.NumberFormat('en', { style: 'currency', currency: code })
    }
    formatters.set(code, f)
  }
  return f.format(Number.isFinite(amount) ? amount : 0)
}

/** Just the symbol, for input placeholders and server text: "৳", "$", "€". */
export function currencySymbol(currency: string = DEFAULT_CURRENCY): string {
  return formatMoney(0, currency).replace(/[\d.,\s]/g, '') || currency
}

/** The currency a new mess starts with, guessed from the creator's timezone. Editable later. */
const ZONE_CURRENCY: Record<string, string> = {
  'Asia/Dhaka': 'BDT', 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Karachi': 'PKR',
  'Asia/Kathmandu': 'NPR', 'Asia/Colombo': 'LKR', 'Asia/Thimphu': 'BTN', 'Asia/Yangon': 'MMK',
  'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Qatar': 'QAR', 'Asia/Kuwait': 'KWD',
  'Asia/Muscat': 'OMR', 'Asia/Bahrain': 'BHD', 'Asia/Singapore': 'SGD', 'Asia/Kuala_Lumpur': 'MYR',
  'Asia/Bangkok': 'THB', 'Asia/Jakarta': 'IDR', 'Asia/Manila': 'PHP', 'Asia/Ho_Chi_Minh': 'VND',
  'Asia/Tokyo': 'JPY', 'Asia/Seoul': 'KRW', 'Asia/Hong_Kong': 'HKD', 'Asia/Shanghai': 'CNY',
  'Europe/London': 'GBP', 'Europe/Dublin': 'EUR', 'Europe/Paris': 'EUR', 'Europe/Berlin': 'EUR',
  'Europe/Rome': 'EUR', 'Europe/Madrid': 'EUR', 'Europe/Amsterdam': 'EUR', 'Europe/Lisbon': 'EUR',
  'Europe/Vienna': 'EUR', 'Europe/Brussels': 'EUR', 'Europe/Helsinki': 'EUR', 'Europe/Athens': 'EUR',
  'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK', 'Europe/Copenhagen': 'DKK', 'Europe/Zurich': 'CHF',
  'Europe/Warsaw': 'PLN', 'Europe/Istanbul': 'TRY', 'Europe/Moscow': 'RUB',
  'America/New_York': 'USD', 'America/Chicago': 'USD', 'America/Denver': 'USD', 'America/Los_Angeles': 'USD',
  'America/Phoenix': 'USD', 'America/Anchorage': 'USD', 'Pacific/Honolulu': 'USD',
  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD', 'America/Mexico_City': 'MXN', 'America/Sao_Paulo': 'BRL',
  'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD', 'Australia/Perth': 'AUD', 'Pacific/Auckland': 'NZD',
  'Africa/Cairo': 'EGP', 'Africa/Lagos': 'NGN', 'Africa/Nairobi': 'KES', 'Africa/Johannesburg': 'ZAR',
}

export function currencyForTimezone(timezone: string | null | undefined): string {
  return (timezone && ZONE_CURRENCY[timezone]) || DEFAULT_CURRENCY
}

/** Ways a deposit can be paid. Stored values never change; which ones are offered depends on the currency. */
export const ALL_PAYMENT_METHODS = ['CASH', 'BKASH', 'NAGAD', 'BANK', 'CARD', 'WALLET', 'OTHER'] as const
export type PaymentMethodCode = (typeof ALL_PAYMENT_METHODS)[number]

/** bKash and Nagad only make sense in taka; everywhere else a card and a mobile wallet stand in. */
export function paymentMethodsFor(currency: string): PaymentMethodCode[] {
  return currency === 'BDT' ? ['CASH', 'BKASH', 'NAGAD', 'BANK', 'OTHER'] : ['CASH', 'BANK', 'CARD', 'WALLET', 'OTHER']
}
