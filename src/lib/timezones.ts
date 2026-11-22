/**
 * timezones.ts — Client. The timezone list for pickers (Settings and the setup wizard).
 */

// Zones people look for first (South Asia, the Gulf, and where members often work abroad)
const COMMON_TIMEZONES = [
    "Asia/Dhaka", "Asia/Kolkata", "Asia/Karachi", "Asia/Kathmandu", "Asia/Colombo", "Asia/Thimphu",
    "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kuwait", "Asia/Muscat", "Asia/Bahrain",
    "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Bangkok", "Asia/Jakarta", "Asia/Tokyo", "Asia/Seoul", "Asia/Hong_Kong",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
    "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto",
    "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland", "Africa/Cairo", "Africa/Johannesburg",
];

// Old names some browsers still list, and the current name for each
const LEGACY_TIMEZONES: Record<string, string> = {
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Dacca": "Asia/Dhaka",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Asia/Rangoon": "Asia/Yangon",
};

export interface TimezoneOption {
    value: string;
    label: string;
    hint: string;
}

/**
 * Every zone the browser knows, with its current offset, e.g. "Asia/Dhaka · UTC+6".
 * Browsers list some zones under their old names (Chrome says Asia/Calcutta, not Asia/Kolkata), so
 * the names people actually search for are added, and the old alias is hidden when the new one exists.
 * `keep` (the saved zone) is always included, so whatever is saved stays selectable.
 */
export function buildTimezoneOptions(keep: string): TimezoneOption[] {
    const isZone = (z: string) => {
        try {
            new Intl.DateTimeFormat("en", { timeZone: z });
            return true;
        } catch {
            return false;
        }
    };
    let known: string[] = [];
    try {
        known = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
        known = [];
    }
    const zones = new Set<string>([...known, ...COMMON_TIMEZONES.filter(isZone)]);
    for (const [legacy, modern] of Object.entries(LEGACY_TIMEZONES)) {
        if (zones.has(modern)) zones.delete(legacy);
    }
    if (keep) zones.add(keep);
    const now = new Date();
    return [...zones].sort().map((zone) => {
        let hint = "";
        try {
            hint =
                new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" })
                    .formatToParts(now)
                    .find((p) => p.type === "timeZoneName")
                    ?.value.replace("GMT", "UTC") ?? "";
        } catch {
            hint = "";
        }
        return { value: zone, label: zone.replace(/_/g, " "), hint };
    });
}
