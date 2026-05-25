## Overview

Airbnb is the canonical example of a generous, photography-led consumer marketplace. The base canvas is **pure white** (`{colors.canvas}` — #ffffff) with deep near-black ink (`{colors.ink}` — #222222) for headlines and body, and a single voltage of **Rausch** (`{colors.primary}` — #ff385c) carrying every primary CTA, the search-button orb, the heart save state, and inline brand links. There is no secondary brand color in mainline marketing — the **Luxe purple** (`{colors.luxe}` — #460479) and **Plus magenta** (`{colors.plus}` — #92174d) tokens are sub-brand accents that only appear inside Airbnb Luxe / Plus contexts.

Type runs **Airbnb Cereal VF** (a custom variable font Airbnb licenses), with **Circular** as the historic in-house fallback and a system stack underneath. Cereal sits at modest weights — display headlines render at 22–28px in weight 500–600, not the heavy 700+ weights that financial or enterprise systems lean on. The hero h1 ("Inspiration for future getaways") on the homepage is just 28px / 700, which would feel small on a typical SaaS page; here it works because the layout leans on photography (city collage, property cards) for visual weight rather than typographic muscle.

The shape language is **soft**. Buttons are 8px radius (`{rounded.sm}`), property cards are ~14px (`{rounded.md}`), the search bar is fully pill-shaped (`{rounded.full}`), wishlist hearts and search orbs are circles (`{rounded.full}`), and category strip rounded corners run at 32px (`{rounded.xl}`). There is essentially no hard corner anywhere except the body grid itself — every interactive element is rounded.

**Key Characteristics:**
- Single accent color: `{colors.primary}` (#ff385c — "Rausch") carries every primary CTA, the search orb, the heart save state, and the brand wordmark. Used scarcely — most pages are 90% white + ink with one or two Rausch moments.
- Custom variable type: `Airbnb Cereal VF`. Display weights sit at 500–700, body at 400. Modest weight is intentional — the system trusts photography for visual heft.
- Three-product top nav: Homes, Experiences, Services — each with a hand-illustrated 32px icon and "NEW" badges (`{component.new-tag}`) on the two newer products. Active tab uses an underline rule (`{component.product-tab-active}`).
- Pill-shaped global search bar: white surface, fully rounded (`{rounded.full}`), divided by 1px hairlines into Where / When / Who segments, terminated by a circular Rausch search orb (`{component.search-orb}`).
- Property cards are photo-first: aspect-ratio rectangles with `{rounded.md}` corner clipping, swipeable image carousel, "Guest favorite" floating badge top-left, heart icon top-right, then 4–5 lines of meta beneath.
- Editorial dropdowns (footer, language picker) are clean text columns over the white canvas — no card surface, no shadow.
- The design system caps elevation at one shadow tier (`box-shadow: rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 8px`) — used on hover-floated cards and search/account dropdowns.
- 8px base spacing system, with major sections at `{spacing.section}` (64px) — generous but not airy enough to feel editorial-magazine; the marketplace density wants more cards per scroll.

## Colors

### Brand & Accent
- **Rausch** (`{colors.primary}` — #ff385c): The single brand color. Used for primary CTA backgrounds (Reserve, Continue), the search orb, the heart save state on property cards, and inline brand links. The most recognizable color in consumer travel.
- **Rausch Active** (`{colors.primary-active}` — #e00b41): The press / pointer-down variant — slightly more saturated. Used on `{component.button-primary-active}`.
- **Rausch Disabled** (`{colors.primary-disabled}` — #ffd1da): A pale tint used on disabled CTAs.
- **Luxe Purple** (`{colors.luxe}` — #460479): Sub-brand accent for Airbnb Luxe. Only appears inside Luxe-branded surfaces — never in mainline marketing.
- **Plus Magenta** (`{colors.plus}` — #92174d): Sub-brand accent for Airbnb Plus. Same scoping as Luxe — sub-product only.

### Surface
- **Canvas** (`{colors.canvas}` — #ffffff): The default page floor for every public page. Airbnb does not have a dark mode on the public web.
- **Surface Soft** (`{colors.surface-soft}` — #f7f7f7): The lightest fill — used on disabled fields, sub-nav hover backgrounds, and the inline search filter band.
- **Surface Strong** (`{colors.surface-strong}` — #f2f2f2): Slightly heavier fill — circular icon-button surface (e.g., the breadcrumb back-arrow and listing toolbar buttons).

### Hairlines & Borders
- **Hairline** (`{colors.hairline}` — #dddddd): The default 1px border tone — search bar dividers, table separators, footer column splitters, card 1px borders.
- **Hairline Soft** (`{colors.hairline-soft}` — #ebebeb): A lighter divider used on long-scrolling editorial body separators.
- **Border Strong** (`{colors.border-strong}` — #c1c1c1): A heavier stroke used on disabled outline buttons and form input outlines after focus.

### Text
- **Ink** (`{colors.ink}` — #222222): The dominant text color on light surfaces. Display headlines, body paragraphs, primary nav links, and most inline link text. Never pure black.
- **Body** (`{colors.body}` — #3f3f3f): A secondary running-text color used inside long-form review and amenity copy where ink would feel too heavy.
- **Muted** (`{colors.muted}` — #6a6a6a): Sub-titles inside city link blocks, inactive product-tab labels, footer category sub-labels, "View all" links.
- **Muted Soft** (`{colors.muted-soft}` — #929292): Disabled link text. Used very sparingly.
- **Star Rating** (`{colors.star-rating}` — #222222): The same ink token — Airbnb's star icon and rating numbers all render in ink rather than a yellow/gold color.
- **On Primary** (`{colors.on-primary}` — #ffffff): White text on Rausch CTAs.

### Semantic
- **Error** (`{colors.primary-error-text}` — #c13515): Inline error text for form validation. Distinct from Rausch — slightly darker, more saturated red.
- **Error Hover** (`{colors.primary-error-text-hover}` — #b32505): Darkens on link hover.
- **Legal Link Blue** (`{colors.legal-link}` — #428bff): Inline links inside legal copy (Privacy, Terms). Only used inside the legal sub-band.

### Scrim
- **Scrim** (`{colors.scrim}` — #000000 at 50% opacity): The global modal backdrop tone. Stored as the base hex; opacity is applied at render time.

## Typography

### Font Family
The system runs **Airbnb Cereal VF** for everything — display, body, navigation, captions, microcopy. Fallbacks walk `Circular, -apple-system, system-ui, Roboto, "Helvetica Neue", sans-serif`. **Circular** is the historic in-house typeface still kept as the first non-variable fallback; system stacks back it up.

There is no separate display family. The variable font carries the entire scale.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.rating-display}` | 64px | 700 | 1.1 | -1px | Listing detail rating display ("4.81") |
| `{typography.display-xl}` | 28px | 700 | 1.43 | 0 | Homepage h1 |
| `{typography.display-lg}` | 22px | 500 | 1.18 | -0.44px | Listing detail h1 |
| `{typography.display-md}` | 21px | 700 | 1.43 | 0 | Section heads inside listing detail |
| `{typography.display-sm}` | 20px | 600 | 1.20 | -0.18px | Sub-section titles |
| `{typography.title-md}` | 16px | 600 | 1.25 | 0 | City link block titles |
| `{typography.title-sm}` | 16px | 500 | 1.25 | 0 | Footer column heads |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Default running-text inside listing copy |
| `{typography.body-sm}` | 14px | 400 | 1.43 | 0 | Card meta lines, dates, prices, distance text |
| `{typography.caption}` | 14px | 500 | 1.29 | 0 | Search field segment labels |
| `{typography.caption-sm}` | 13px | 400 | 1.23 | 0 | Footer legal line |
| `{typography.badge}` | 11px | 600 | 1.18 | 0 | "Guest favorite" floating badge text |
| `{typography.micro-label}` | 12px | 700 | 1.33 | 0 | Card amenity micro-labels |
| `{typography.uppercase-tag}` | 8px | 700 | 1.25 | 0.32px (uppercase) | "NEW" badge on product nav tabs |
| `{typography.button-md}` | 16px | 500 | 1.25 | 0 | Primary CTA button labels |
| `{typography.button-sm}` | 14px | 500 | 1.29 | 0 | Pill button labels |
| `{typography.link}` | 14px | 400 | 1.43 | 0 | Inline body links |
| `{typography.nav-link}` | 16px | 600 | 1.25 | 0 | Top product-nav labels |

### Principles
Display weights stay modest. The homepage h1 at 28px / 700 is deliberately small — it tucks under the search bar so photography and the city-link grid carry visual hierarchy. The listing-detail h1 at 22px / 500 is even quieter; the listing photo banner does the work above it.

The single typographically loud moment in the entire system is the **rating display** (`{typography.rating-display}` — 64px / 700) on listing pages. That is the only place the system trusts type alone to carry hierarchy.

### Note on Font Substitutes
If Airbnb Cereal VF and Circular are unavailable, **Inter** is the closest open-source substitute. Adjust display headlines down by ~2% in line-height to match Cereal's slightly tighter cap height; otherwise the proportions transfer cleanly.

## Layout

### Spacing System
- **Base unit:** 4px (with 2px micro-step).
- **Tokens:** `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.base}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 64px.
- **Section padding (vertical):** `{spacing.section}` (64px) for major page bands.
- **Card internal padding:** `{spacing.lg}` (24px) for host/reservation cards; `{spacing.base}` (16px) for property-card meta block; `{spacing.sm}` (8px) for caption / date-row gutters.
- **Gutters:** `{spacing.base}` (16px) between cards; `{spacing.lg}` (24px) inside footer column gutters; `{spacing.xs}` (4px) on dense category-strip dividers.

### Grid & Container
- **Max content width:** ~1280px centered on homepage and editorial pages. Listing detail pages cap closer to 1080px.
- **City link grid (homepage footer):** 6-column grid at desktop.
- **Listing detail:** 2-column with photo/amenity body (~64% width) and sticky reservation card (~32%).
- **Footer:** 3-column link list at desktop, collapsing to 1-column on mobile.

### Whitespace Philosophy
The system gives editorial bands 64px of vertical breathing room but compresses card grids — property and city-link cards sit just 16px apart. The contrast is intentional: the page reads as "open hero, dense marketplace below."

## Elevation

The system has essentially **one shadow tier** plus the flat baseline.

- **Flat (no shadow):** Body, hero, footer, all editorial bands — 95% of surfaces.
- **Card hover float:** `box-shadow: rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — applied to property cards on pointer hover, the search bar at rest, and the dropdown menus.
- **Modal scrim:** `{colors.scrim}` rendered at 50% opacity.

There are no progressive elevation tiers — the system either has the one shadow or none.

## Components

### Buttons

**`button-primary`** — Rausch fill, white text, 8px radius, 14×24px padding, 48px height, weight 500.

**`button-primary-active`** — Background flips to `{colors.primary-active}`. No transform, no shadow change.

**`button-primary-disabled`** — Pale Rausch tint at #ffd1da with white text. Cursor not-allowed.

**`button-secondary`** — White fill with ink text and a 1px ink outline. 8px radius.

**`button-tertiary-text`** — Plain ink text, no surface, no border. Underlined on hover.

**`button-pill-rausch`** — Pill-shaped Rausch CTA — 9999px radius, 10×20px padding, 14px label.

### Search Surface

**`search-bar-pill`** — White fill, 9999px radius, 64px height, 1px hairline border. Internally divided into Where / When / Who segments.

**`search-orb`** — Circular Rausch orb at 48×48px, fully rounded, white magnifying-glass icon centered.

### Top Navigation

**`top-nav`** — White surface, 80px height, 1px bottom hairline.

**`product-tab-active`** — Ink label in `{typography.nav-link}`, 32px icon, 2px ink underline rule.

**`product-tab-inactive`** — Muted label, illustrated icon, no underline.

**`new-tag`** — Tiny rounded-pill badge carrying "NEW" in `{typography.uppercase-tag}`.

### Listing Cards

**`property-card`** — Photo-first card with 1:1 aspect-ratio image, `{rounded.md}` clipping, "Guest favorite" badge top-left, heart top-right, 4–5 lines of meta beneath.

**`guest-favorite-badge`** — White rounded pill at 11px / 600 weight.

### Listing Detail

**`rating-display-card`** — 64px / 700 rating number flanked by laurel-wreath SVG ornaments.

**`amenity-row`** — 1-column list of amenity icons + ink labels.

**`reservation-card`** — Sticky right-rail card with white surface, `{rounded.md}`, 1px hairline border, 1px shadow tier, 24px padding.

### Date Picker

**`date-picker-day`** — 40×40px circular cell, default transparent fill, ink text.

**`date-picker-day-selected`** — Ink fill, white text, full circle. Range states carry `{colors.surface-soft}` lozenge background.

### Forms

**`text-input`** — White surface, 1px hairline outline, `{rounded.sm}` 8px radius, 56px height. On focus, border thickens to 2px ink — no glow, no ring.

### Footer

**`footer-light`** — White surface, 48×80px padding, 3 columns of link blocks.

**`legal-band`** — Bottom strip with copyright, language picker, currency picker, and social icons.

## Responsive Behavior

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 744px | Top nav collapses to logo + hamburger; search bar collapses to single tappable pill; property cards stack 1-up; listing detail collapses reservation card to sticky bottom bar. |
| Tablet | 744–1128px | Top nav keeps product tabs; property cards 2-up; city grid 2–3 column. |
| Desktop | 1128–1440px | Full top nav; property cards 4-up; city grid 6-column; listing detail 2-column. |
| Wide | > 1440px | Content width caps at 1440px on listing/search pages and ~1280px on editorial. |

### Touch Targets
- Primary CTAs at minimum 48×48px (above WCAG AAA).
- Search orb is 48×48px circular.
- Heart save button is 32×32px circular.
- Date-picker day cells are 40×40px circular.

### Collapsing Strategy
- Top product tabs collapse into a hamburger sheet below 744px.
- Search bar's 3 segments collapse into a single-tap entry opening a full-screen search overlay on mobile.
- Property and city-link grids drop column counts at each breakpoint — never reflow rows.
- Reservation card switches from sticky right-rail to sticky bottom bar on mobile.

## Known Gaps

- **Hover state colors:** intentionally not documented per the global no-hover policy.
- **Loading states / skeleton screens:** not visible on the extracted surfaces.
- **Map view styling:** uses Mapbox-tinted tiles with custom Rausch markers; not captured here.
- **Form input error states:** error text color documented, but full input outline + helper-text combination on validation failure was not visible.
- **Sub-brand palettes:** Luxe and Plus tokens documented, but their full sub-system lives on separate sub-domains and is not captured here.
