# MODULE 0: Landing Page

**Route:** `/{locale}` (public — no auth required)

---

## Files

| Layer | File |
|-------|------|
| Page | `src/app/[locale]/page.tsx` |
| Styles | `src/app/[locale]/landing.module.css` |
| Layout | `src/app/[locale]/layout.tsx` (locale layout, provides `next-intl` + `next-themes`) |
| i18n (EN) | `messages/en.json` → `landing.*` |
| i18n (BN) | `messages/bn.json` → `landing.*` |
| Global scrollbar | `src/app/globals.css` → `::-webkit-scrollbar` + Firefox `scrollbar-*` |

---

## Sections (top → bottom)

### 1. Navbar (fixed)
- Logo: gradient icon + "Mealtill" wordmark. Icon rotates on hover.
- Right actions: `ThemeToggle`, "Sign In" ghost link (`/{locale}/login`), "Get Started" CTA (`/{locale}/register`)
- **Scroll behavior**: `backdrop-filter: blur(18px)` is **always active** (prevents visual pop). Only `background-color`, `border-color`, and `box-shadow` transition on scroll via `scrolled` state (`window.scrollY > 50`).
- Dark mode: `rgba(10, 8, 24, 0)` → `rgba(10, 8, 24, 0.88)` on scroll
- Sign-in link hidden on mobile (`<640px`)

### 2. Hero
- Full-viewport-height (`min-height: 100svh`)
- **No badge / pill** — removed for clean minimalist look
- **Background layers** (inside `.heroBg`, all `aria-hidden`):
  1. `.heroDotGrid` — subtle 30×30px dot grid (indigo, 7% opacity) with radial edge-fade mask + slow `gridDrift` drift animation (18s). Linear/Vercel style.
  2. `::before` — indigo radial blob top-left, `ambientFloat` 9s
  3. `::after` — purple radial blob top-right, `ambientFloat` 12s reverse
  4. Food emoji particles (see below)
  - All blobs stay in the **upper half** — no bleed into the features section.
- **Food particle animations**: 8 floating food emoji (`🍜 🥘 🍚 🧑‍🍳 🥗 🫕 🥩 🧅`). Rise from bottom, fade in/out — `particleRise` keyframe. Particles 3,5,7,8 hidden on `<480px`.
- **Hero elements animate individually** (staggered, not as one block):
  - `.heroTitle` → `elementIn` delay 0s
  - `.heroSubtitle` → `elementIn` delay 0.18s
  - `.heroActions` → `elementIn` delay 0.32s
  - `.statsBar` → `elementIn` delay 0.48s
- **Title**: 900-weight. Gradient highlight span uses `heroGradientSweep` (9s per pass, 2s initial delay, `ease-in-out infinite alternate backwards`).
  - **Gradient is symmetric**: `indigo(0%) → purple(30%) → amber(50%) → purple(70%) → indigo(100%)` — both endpoints show indigo, so `alternate` direction reverses seamlessly.
  - `background-size: 200% 100%`. At `0%` position shows the left half (indigo→amber); at `100%` shows the right half (amber→indigo, mirror). Reverses on next iteration — no loop jump, no flick.
  - **Do not** use hold-keyframes (they cause orange to park visibly). **Do not** use `background-position > 100%` (causes overflow). **Do not** add a second `background-position` animation — two CSS animations on the same property conflict (last one wins, first is silently ignored).
- **CTA buttons**: wrapped in `.heroActions`. Primary CTA wrapped in `.ctaGlowWrap` — a `::before` pseudo with `blur(14px)` gradient, pulsing via `ctaGlowPulse` (3s loop, delay 1.5s). **Base `opacity: 0` + `animation-fill-mode: backwards`** are both required — without them the glow renders at full brightness on page load before the delay elapses, causing a visible flash on every reload.
- **Stats bar**: `margin-top: var(--space-24)` (6rem) — generous breathing room between buttons and the divider line. 3 stats with vertical dividers.
- **Scroll indicator** (`scrollHint`): thin 1.5px vertical line with gradient dot traveling down (`scrollTravel` 1.8s loop). Fades out when `scrolled === true`. Appears via `hintIn` at 1.2s delay.

### 3. Features Grid (`#features`)
- `data-landing-animate` on section header + each card → IntersectionObserver adds `.is-visible`
- Cards stagger via inline `transitionDelay: index * 0.08s`
- Hover: lifts `-5px`, top gradient bar reveals, icon scales + rotates
- 6-card grid (`auto-fit minmax(280px, 1fr)`)

### 4. Roles Section (`#roles`)
- Alternate `--color-bg-subtle` background
- `data-landing-animate` on header + each card, stagger `index * 0.1s`
- Hover: emoji scale + rotation

### 5. CTA Section
- Floating 🍽️ dish icon with `dishFloat` keyframe
- Two soft centered radial orbs (no edge bleed)
- `data-landing-animate` on content block
- No demo accounts (removed permanently)

### 6. Footer (professional product layout)
- **Left**: Logo mark + tagline (`tc("tagline")` = "Smart Mess Management")
- **Center**: `footerLinks` nav — Features (`#features`), Who It's For (`#roles`), Sign In, Get Started
- **Right**: Copyright
- Responsive: stacks vertically on `<768px`

---

## Scroll-Triggered Animation System

IntersectionObserver runs in `useEffect` on mount. Any element with `data-landing-animate` attribute starts at `opacity: 0; transform: translateY(30px)` and transitions to visible when it enters the viewport. Observer uses `threshold: 0.1, rootMargin: "0px 0px -60px 0px"` — triggers slightly before element fully enters.

CSS uses `:global([data-landing-animate])` and `:global([data-landing-animate].is-visible)` in the CSS module, since the `is-visible` class is added via vanilla DOM (`classList.add('is-visible')`).

**Do NOT** put `data-landing-animate` on hero content — it already uses `heroIn` CSS animation on load.

---

## i18n Namespace: `landing`

```
landing.nav.signIn
landing.hero.title / titleHighlight / subtitle / cta / ctaSecondary
landing.stats.messes / meals / saved
landing.features.title / subtitle
landing.features.{mealToggle|expense|headcount|matrix|finance|ai}.{title|description}
landing.roles.title
landing.roles.{member|manager|admin|cook}.{title|description}
landing.cta.title / subtitle / button
landing.footer.features / roles / getStarted / copyright
```

---

## Animation Inventory

| Element | Keyframe | Duration |
|---------|----------|----------|
| Hero title | `elementIn` | 0.9s, delay 0s |
| Hero subtitle | `elementIn` | 0.9s, delay 0.18s |
| Hero action buttons | `elementIn` | 0.9s, delay 0.32s |
| Stats bar | `elementIn` | 0.9s, delay 0.48s |
| Hero highlight gradient sweep | `heroGradientSweep` | 9s/pass, delay 2s, `infinite alternate backwards` |
| Primary CTA glow pulse | `ctaGlowPulse` | 3s loop, delay 1.5s, `backwards` |
| Dot grid drift | `gridDrift` | 18s loop |
| Ambient background blobs | `ambientFloat` | 9s / 12s loop |
| Food emoji particles | `particleRise` | 11–17s, staggered |
| Scroll indicator dot | `scrollTravel` | 1.8s loop |
| Scroll indicator appear | `hintIn` | 1s, delay 1.2s |
| Feature icon on hover | CSS hover transition | spring |
| Role emoji on hover | CSS hover transition | spring |
| Logo icon on hover | CSS hover transition | spring |
| CTA dish icon | `dishFloat` | 5s loop |
| Scroll-triggered cards/headers | `[data-landing-animate]` → `.is-visible` | 0.7s, staggered |

---

## Scrollbar

Defined globally in `src/app/globals.css`:
- Width: 5px, no track background
- Thumb: `linear-gradient(to bottom, --color-primary, #a855f7)` gradient
- Firefox: `scrollbar-width: thin`, `scrollbar-color: --color-primary transparent`

---

## Theme Support

- Navbar: transparent → frosted glass on scroll. Separate light/dark `rgba()` values — no flash.
- All colors via CSS custom properties from `globals.css` — dark mode auto-swaps.
- Purple feature icon dark override: `background: #2e1065`.

---

## Key Design Decisions

- **No demo credentials** on landing — removed permanently. Professional product look.
- **Badge removed** — cleaner hero with just the headline.
- **Orange blob removed from hero** — replaced with purple blob (upper-right), both blobs stay in the **upper zone only** to avoid bleeding into the next section.
- **`transition: all` removed from navbar** — only specific properties transition to prevent visual flashes. `backdrop-filter` always active.
- **"Explore Features" button** uses `useRef` scroll — no router navigation needed.
- Food particles are `aria-hidden="true"` — decorative only.
- `navSignIn` hidden on mobile to save nav space.

---

## Dependencies

- `next-intl`: `useTranslations("landing")`, `useTranslations("common")`, `useLocale()`
- `lucide-react`: `Utensils`, `ToggleRight`, `Receipt`, `ChefHat`, `Grid3X3`, `Shield`, `Sparkles`, `ArrowRight`
- `@/components/ui/Button/Button`
- `@/components/composed/ThemeToggle/ThemeToggle`
- `@/lib/utils`: `cn()`
- No API calls — fully static public page
