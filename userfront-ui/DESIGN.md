---
name: Serene Presence OS
colors:
  surface: '#fbf8ff'
  surface-dim: '#dad9e3'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fd'
  surface-container: '#eeedf7'
  surface-container-high: '#e8e7f1'
  surface-container-highest: '#e3e1ec'
  on-surface: '#1a1b22'
  on-surface-variant: '#464555'
  inverse-surface: '#2f3038'
  inverse-on-surface: '#f1effa'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#5f5e60'
  on-secondary: '#ffffff'
  secondary-container: '#e5e1e4'
  on-secondary-container: '#656466'
  tertiary: '#005338'
  on-tertiary: '#ffffff'
  tertiary-container: '#006e4b'
  on-tertiary-container: '#67f4b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#e5e1e4'
  secondary-fixed-dim: '#c8c6c8'
  on-secondary-fixed: '#1c1b1d'
  on-secondary-fixed-variant: '#474649'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#fbf8ff'
  on-background: '#1a1b22'
  surface-variant: '#e3e1ec'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies the calm, disciplined clarity of high-performance operating software (Linear, Notion, Superhuman). It intentionally rejects noisy dashboard paradigms, sensory overload, and speculative sci-fi neon aesthetics. Instead, it positions AI as an unobtrusive, hyper-competent Chief of Staff for brand presence and distribution.

### Core Visual Principles
- **Clarity Over Density:** White space serves as an active structural element, allowing critical marketing decisions to emerge effortlessly.
- **Human-Centric Transparency:** Complex algorithmic signals are translated into conversational, plain-English states (`Needs your approval`, `Things worth talking about`, `What your AI is learning`).
- **Tactile Restraint:** Depth is achieved through precise tonal transitions, razor-thin neutral outlines, and whisper-quiet elevation rather than loud drop shadows.
- **Velocity Through Stillness:** By eliminating ornamental borders and distracting graphics, interfaces feel instantaneous, deliberate, and calm.

## Colors

The system uses a luminous monochrome foundation paired with a sharp, disciplined indigo for focused intelligence and deliberate actions.

### Palette Architecture
- **Surface & Base:** Pure white (`#FFFFFF`) serves as the primary canvas, supported by subtle neutral washes (`#FAFAFA` for canvas backing, `#F4F4F5` for input and card sub-layers) and hairline borders (`#E4E4E7`).
- **Primary Ink & Structure (`#09090B`):** Deep charcoal/zinc anchors primary typography, navigation landmarks, and high-emphasis controls.
- **Action & Intelligence (`#4F46E5`):** Reserved strictly for actionable verbs, AI-generated insights, active states, and focal focus rings.
- **Semantic Indicators:**
  - *Healthy / Ready:* Muted emerald (`#059669` text, `#ECFDF5` container) for approved and published signals.
  - *Needs Attention:* Warm amber (`#D97706` text, `#FFFBEB` container) for pending reviews.
  - *Blocked / Alert:* Gentle rose (`#DC2626` text, `#FEF2F2` container) for disconnects and errors.
  - *Neutral / Inactive:* Slate gray (`#71717A`) for resting meta states.

Dark mode flips these values systematically: `#09090B` canvas, `#18181B` surface tiers, `#27272A` borders, with text shifting to crisp `#FAFAFA`.

## Typography

The typographic system relies on Plus Jakarta Sans across all levels to balance geometric precision with humanist approachability. It ensures microcopy reads conversationally, eliminating technical jargon.

### Editorial Guidelines
- **Headings:** Formatted in conversational phrasing rather than enterprise terminology (`Things worth talking about` over `Curated Content Feed`; `Needs your approval` over `Pending Asset Queue`).
- **Action Verb Alignment:** Primary interactions always open with direct verbs (`Approve draft`, `Publish now`, `Schedule update`).
- **Metadata Contrast:** Use `body-sm` and `label-sm` in secondary zinc tones to balance dominant headline hierarchies without visual weight competition.

## Layout & Spacing

Layouts follow a fluid 12-column grid capped at a maximum width of 1440px for single-pane command views, preventing excessive eye travel across ultra-wide monitors.

### Breakpoints & Adaptive Rules
- **Desktop (1024px+):** Full 12-column system, 32px margins (`space-xl`), 24px gutters (`gutter`). Permanent collapsible navigation rail (240px wide).
- **Tablet (768px – 1023px):** 8-column layout, 24px margins, 16px gutters. Collapses navigation rail into an overlay command drawer.
- **Mobile (< 768px):** 4-column layout, 16px margins, 12px gutters. Multi-column cards stack vertically into progressive review cards.

### Spacing Philosophy
Rhythm follows strict 4px/8px intervals. Vertical element separation favors generous internal padding over dense component packing, reinforcing a calm, unhurried workflow.

## Elevation & Depth

This design system avoids traditional heavy drop shadows, relying instead on structural boundaries and delicate ambient depth.

### Layering Hierarchy
1. **Base Floor (Canvas):** `#FAFAFA` — Receded canvas backdrop.
2. **Surface Tier (Panels & Cards):** `#FFFFFF` paired with a 1px border (`#E4E4E7`). No shadow in neutral resting state.
3. **Elevated Overlays (Command Palette & Flyouts):** Single hairline boundary (`#E4E4E7`) paired with an ultra-diffused atmospheric shadow: `0 10px 30px -10px rgba(0, 0, 0, 0.04), 0 4px 6px -2px rgba(0, 0, 0, 0.02)`.
4. **Interactive Hover States:** Elevation is expressed via border darkening (`#D4D4D8`) and a 1px vertical translation rather than multi-layered shadows.

## Shapes

The geometric framework balances friendly rounded corners with crisp internal alignment.

### Geometry Hierarchy
- **Base Surfaces & Cards:** Standard `rounded` (8px / `0.5rem`) keeps larger modules architectural and structured.
- **Large Panels & Modals:** `rounded-lg` (16px / `1rem`) balances expansive surface areas.
- **Interactive Controls (Inputs, Action Buttons):** `rounded` (8px / `0.5rem`) provides tactile, thumb-friendly touch targets.
- **Badges, Status Chips, & Metas:** Full pill treatment (`9999px`) distinctively sets non-actionable status metadata apart from interactive rectangular buttons.

## Components

### Buttons
- **Primary Action:** Solid charcoal (`#09090B`) text `#FFFFFF`, 8px radius, height 40px, padding `0 16px`. Active AI generation uses solid Indigo (`#4F46E5`).
- **Secondary Action:** White background with 1px border (`#E4E4E7`), text `#09090B`. Subtle hover to `#F4F4F5`.
- **Ghost / Tertiary:** No border, text `#71717A`, shifts to `#09090B` on hover with `#F4F4F5` backdrop.

### Status Chips & Pills
- Rendered in full pill shape with a 6px status dot.
- *Needs Approval:* `#FFFBEB` background, `#D97706` text and dot.
- *Published / Healthy:* `#ECFDF5` background, `#059669` text and dot.
- *Learning:* `#EEF2FF` background, `#4F46E5` text with pulsing dot indicator.

### Input Fields & Controls
- Height 40px, background `#FFFFFF`, border 1px `#E4E4E7`, radius 8px.
- Focus state eliminates heavy outer rings; uses a crisp 1px `#4F46E5` border with a 2px offset glow: `0 0 0 2px rgba(79, 70, 229, 0.1)`.
- Label placed outside above the input in `label-md` weight.

### Cards & Focus Boards
- White surface, 1px border (`#E4E4E7`), padding 24px (`space-lg`).
- Modular headers featuring plain-language subheaders (`body-sm`) immediately beneath section titles.

### Action Bar (Command Deck)
- Floating bottom-center utility dock for bulk approvals and instant publishing actions.
- Backdrop blur (`backdrop-blur-md` over `rgba(255, 255, 255, 0.85)`), hairline border (`#E4E4E7`), housing primary keyboard-shortcut-enabled verb buttons.