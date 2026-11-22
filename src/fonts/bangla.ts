import localFont from "next/font/local";

/**
 * Bangla face: Aborton (Mashbik Bin Anam, FontBD), regular and a real italic. Used for Bengali
 * letters only (unicode-range), so Latin text and figures keep the Latin fonts next to it in each
 * font stack. One weight only: bold is never faked (font-synthesis: none for lang="bn").
 */
export const bangla = localFont({
    src: [
        { path: "./Aborton-Regular.ttf", weight: "400", style: "normal" },
        { path: "./Aborton-Italic.ttf", weight: "400", style: "italic" },
    ],
    display: "swap",
    variable: "--font-bangla-face",
    // No generated "Arial" fallback: it has no unicode-range and would draw Latin text in the Bangla UI
    adjustFontFallback: false,
    declarations: [{ prop: "unicode-range", value: "U+0980-09FF, U+200C-200D, U+25CC" }],
});
