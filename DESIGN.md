## Overview

Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice. The homepage opens with **"Meet the night shift."** rendered centered over a deep navy hero band ({colors.brand-navy}), decorated with brand-colored sticky-note dots and mesh wire illustrations scattered around the headline. The signature **purple pill primary CTA** ({colors.primary}) "Get Notion free" sits at the visual center, paired with an outlined "Request a demo" secondary. Below the buttons, a real Notion workspace UI mockup card (the "Ramp HQ" kanban board) breaks out of the hero band with a deep diffuse drop shadow.

Below the hero, the page cycles through a distinctive sequence of feature sections: a dense sticky-note "Keep work moving 24/7" panel with red/blue/green/purple/teal status icons; a **bold yellow** ({colors.card-tint-yellow-bold}) "Ask your on-demand assistants" banner card flanked by orange/rose/mint pastel feature tiles showing assistant UI mockups; and a "Bring all your work together" 3-column grid with brand-colored mockups (sky-blue tutorial card, light Notion calendar, brown/rust testimonial slate). The pricing page renders 4 tiers (Free / Plus / Business / Enterprise) horizontally with one tier featured (purple-bordered) and a dense feature comparison table running below.

The system uses a Notion-Sans typeface (Inter-based) across every UI surface — humanist-geometric character that pairs naturally with the colorful illustrations. Buttons are `{rounded.md}` (8px) rectangles, NOT pills — distinguishing Notion's sober rectangular geometry from competitors that use pills universally. Cards use `{rounded.lg}` (12px) consistently.

**Key Characteristics:**
- Deep navy hero band ({colors.brand-navy}) with scattered sticky-note dots + mesh wire decorative illustrations
- **Signature purple** ({colors.primary}) primary CTA — Notion's recognizable "Get Notion free" button color
- Real Notion workspace UI mockup card embedded in the hero with deep drop shadow
- Bold yellow feature banner ({colors.card-tint-yellow-bold}) for high-emphasis content sections
- Pastel feature card palette (peach, rose, mint, lavender, sky, yellow) echoing the live product database properties
- Notion-Sans (Inter-based) across every UI surface
- 8px-rounded buttons (NOT pills), 12px-rounded cards — sober editorial geometry
- 4-tier pricing comparison with dense feature table
- Centered hero layout (different from the left-aligned norm of most B2B SaaS)

## Colors

### Brand & Primary
- **Notion Purple** ({colors.primary} — #6E56CF): Signature primary CTA color — the unmistakable "Get Notion free" button. Reserved for the dominant CTA only.
- **Purple Pressed** ({colors.primary-pressed} — #5E47B0): Pressed-state variant
- **Purple Deep** ({colors.primary-deep} — #4A3899): Deeper variant for emphasis
- **Brand Navy** ({colors.brand-navy} — #191A23): Hero band background — deep navy
- **Brand Navy Deep** ({colors.brand-navy-deep} — #0F1018): Deeper navy for promo banner
- **Brand Navy Mid** ({colors.brand-navy-mid} — #23253A): Mid-spectrum navy
- **Link Blue** ({colors.link-blue} — #3E83F8): Inline text link blue (NOT primary CTA)
- **Link Blue Pressed** ({colors.link-blue-pressed} — #2563EB): Pressed-state link blue

### Brand Color Spectrum (echoes live product database properties)
- **Brand Pink** ({colors.brand-pink} — #E879A0)
- **Brand Orange** ({colors.brand-orange} — #F97316)
- **Brand Purple** ({colors.brand-purple} — #A78BFA)
- **Brand Teal** ({colors.brand-teal} — #2DD4BF)
- **Brand Green** ({colors.brand-green} — #4ADE80)
- **Brand Yellow** ({colors.brand-yellow} — #FACC15)
- **Brand Brown** ({colors.brand-brown} — #92400E)

### Card Tints (Pastel Feature Card Backgrounds)
- **Tint Peach** ({colors.card-tint-peach} — #FFF0E8)
- **Tint Rose** ({colors.card-tint-rose} — #FEE2EF)
- **Tint Mint** ({colors.card-tint-mint} — #E0FDF4)
- **Tint Lavender** ({colors.card-tint-lavender} — #EDE9FE)
- **Tint Sky** ({colors.card-tint-sky} — #E0F2FE)
- **Tint Yellow** ({colors.card-tint-yellow} — #FEFCE8)
- **Tint Yellow Bold** ({colors.card-tint-yellow-bold} — #FDE047): Bold yellow for high-emphasis feature banners
- **Tint Cream** ({colors.card-tint-cream} — #FAFAF5)
- **Tint Gray** ({colors.card-tint-gray} — #F5F5F5)

### Surface
- **Canvas White** ({colors.canvas} — #FFFFFF): Page background and primary card surface
- **Surface** ({colors.surface} — #F7F7F5): Subtle section backgrounds
- **Surface Soft** ({colors.surface-soft} — #FAFAF8): Quieter section divisions
- **Hairline** ({colors.hairline} — #E3E2E0): 1px borders and primary dividers
- **Hairline Soft** ({colors.hairline-soft} — #EBEBEA): Quieter dividers
- **Hairline Strong** ({colors.hairline-strong} — #C9C8C6): Stronger 1px border for inputs

### Text
- **Ink Deep** ({colors.ink-deep} — #0F0F0F): Pure black for emphasis
- **Ink** ({colors.ink} — #1A1A1A): Primary headlines and body text
- **Charcoal** ({colors.charcoal} — #2F2F2F): Body emphasis — Notion's signature warm-charcoal
- **Slate** ({colors.slate} — #4B4B4B): Secondary text
- **Steel** ({colors.steel} — #6B6B6B): Tertiary, footer links
- **Stone** ({colors.stone} — #8A8A8A): Muted labels
- **Muted** ({colors.muted} — #A8A8A8): Disabled, placeholders
- **On Dark** ({colors.on-dark} — #FFFFFF): White text on dark surfaces
- **On Dark Muted** ({colors.on-dark-muted} — rgba(255,255,255,0.7)): Reduced-opacity white

### Semantic
- **Success** ({colors.semantic-success} — #22C55E): Confirmation green
- **Warning** ({colors.semantic-warning} — #F97316): Mid-priority alerts (orange)
- **Error** ({colors.semantic-error} — #EF4444): Validation errors (red)

## Typography

### Font Family
**Notion Sans** (primary): Notion's custom Inter-based variable typeface. Fallbacks: Inter, -apple-system, system-ui, 'Segoe UI', Helvetica, sans-serif. Humanist-geometric character used across every UI surface.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.hero-display}` | 80px | 600 | 1.05 | -2px | Hero |
| `{typography.display-lg}` | 56px | 600 | 1.10 | -1px | Section openers |
| `{typography.heading-1}` | 48px | 600 | 1.15 | -0.5px | Page-level headlines |
| `{typography.heading-2}` | 36px | 600 | 1.20 | -0.5px | Subsection headlines |
| `{typography.heading-3}` | 28px | 600 | 1.25 | 0 | Card titles |
| `{typography.heading-4}` | 22px | 600 | 1.30 | 0 | Feature tile titles |
| `{typography.heading-5}` | 18px | 600 | 1.40 | 0 | FAQ questions |
| `{typography.subtitle}` | 18px | 400 | 1.50 | 0 | Hero subtitle |
| `{typography.body-md}` | 16px | 400 | 1.55 | 0 | Primary body text |
| `{typography.body-md-medium}` | 16px | 500 | 1.55 | 0 | Body emphasis |
| `{typography.body-sm}` | 14px | 400 | 1.50 | 0 | Secondary body |
| `{typography.body-sm-medium}` | 14px | 500 | 1.50 | 0 | Active sidebar, button labels |
| `{typography.caption-bold}` | 13px | 600 | 1.40 | 0 | Badge labels |
| `{typography.button-md}` | 14px | 500 | 1.30 | 0 | Button labels |

### Principles
- Tight hero leading (1.05) on 80px display
- Negative letter-spacing on display sizes (-2px to -0.5px)
- Generous body leading (1.55) for documentation readability
- 600 weight for headlines + 500 for buttons; 400 body

## Layout

### Spacing System
- **Base unit**: 4px (8px primary increment)
- **Tokens**: `{spacing.xxs}` (4px) through `{spacing.hero}` (120px)
- **Section rhythm**: Marketing pages use `{spacing.section-lg}` (96px); pricing tightens to `{spacing.section}` (64px)

### Grid & Container
- 1280px max-width with 32px gutters
- Pricing: 4-tier card row at desktop with dense comparison table
- Homepage: centered hero with workspace mockup below buttons; alternating colorful feature card sections

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow; `{colors.hairline}` border | Default cards, table rows |
| 1 (subtle) | `rgba(15, 15, 15, 0.04) 0px 1px 2px 0px` | Hover-elevated tiles |
| 2 (card) | `rgba(15, 15, 15, 0.08) 0px 4px 12px 0px` | Feature cards |
| 3 (mockup) | `rgba(15, 15, 15, 0.20) 0px 24px 48px -8px` | Hero workspace mockup card |
| 4 (modal) | `rgba(15, 15, 15, 0.16) 0px 16px 48px -8px` | Modals, dropdowns |

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Tag chips |
| `{rounded.sm}` | 6px | Type badges |
| `{rounded.md}` | 8px | **Buttons, inputs** |
| `{rounded.lg}` | 12px | **Cards, pricing tiers** |
| `{rounded.xl}` | 16px | Larger feature panels |
| `{rounded.full}` | 9999px | Status badges, pill tabs (NOT regular buttons) |

Notion's geometry is sober-editorial — `{rounded.md}` (8px) buttons, `{rounded.lg}` (12px) cards.

## Do's and Don'ts

### Do
- Use `{colors.primary}` (#6E56CF purple) as the dominant CTA across all surfaces
- Apply `{rounded.md}` (8px) to buttons — rectangles, not pills
- Apply `{rounded.lg}` (12px) to all card families
- Use pastel card tints (peach, rose, mint, lavender, sky, yellow) for section variety
- Use `{colors.charcoal}` (#2F2F2F) for warm body text — avoid pure black (#000) for readability

### Don't
- Don't use the purple for body text or large background surfaces
- Don't use pill-shaped buttons; Notion's geometry is rectangular-sober
- Don't mix link-blue with primary-purple — they have distinct roles
- Don't apply heavy shadows on flat documentation cards

## Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 480px | Single column. Hero 36px. Pricing 1-up. |
| Tablet | 768 – 1023px | 2-column feature grids. Hero 56px. |
| Desktop | 1024 – 1279px | 4-tier pricing card row. Hero 72px. |
| Wide | ≥ 1280px | Full 80px hero presentation. |

## Known Gaps

- Specific dark-mode token values not surfaced beyond hero bands
- Animation/transition timings not extracted; recommend 150–200ms ease
- Form validation success state not explicitly captured
- Pastel-tint mapping is observation-based — actual brand library may have more entries
