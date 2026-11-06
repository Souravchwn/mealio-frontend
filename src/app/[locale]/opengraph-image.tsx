import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";

/** Share card for every page in a locale, rendered once at build time. Text is English: the default
 *  image font has no Bangla glyphs, and the brand name reads the same in both languages. */
export const alt = "Mealio, smart mess management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export default function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "80px",
                    background: "linear-gradient(135deg, #1e1035 0%, #5b21b6 60%, #7c3aed 100%)",
                    color: "#ffffff",
                    fontFamily: "sans-serif",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    <div
                        style={{
                            width: 88,
                            height: 88,
                            borderRadius: 24,
                            background: "#c4f04d",
                            color: "#1a2e05",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 56,
                            fontWeight: 800,
                        }}
                    >
                        M
                    </div>
                    <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: -2 }}>Mealio</div>
                </div>
                <div style={{ fontSize: 52, fontWeight: 700, marginTop: 48, lineHeight: 1.15 }}>
                    Smart mess management
                </div>
                <div style={{ fontSize: 32, marginTop: 24, color: "#e9e3ff", maxWidth: 900, lineHeight: 1.35 }}>
                    Meals, bazaar, deposits and a live meal rate for shared living in Bangladesh and India.
                </div>
            </div>
        ),
        size,
    );
}
