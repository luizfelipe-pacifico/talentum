# Talentum Brand and Interface Guidelines

## Purpose

This document defines the visual foundation for Talentum, a local-first personal finance system. It is the source of truth for product layout, interface styling, visual hierarchy, and future design decisions.

Talentum must communicate trust, clarity, stability, and depth. Its visual language combines the rigor required by financial information with a restrained classical aesthetic. Every design choice should improve comprehension, reinforce hierarchy, and reduce cognitive fatigue.

## Brand principles

### Order before decoration

Structure is part of the brand. Prefer clear hierarchy, predictable alignment, and deliberate spacing over ornamental elements.

### Classical authority, modern precision

Editorial typography and warm, archival colors provide historical depth. Geometric body typography, consistent grids, and functional components keep the system contemporary and technically precise.

### Restraint creates emphasis

Accent color, shadows, borders, and motion must be used sparingly. If everything is emphasized, nothing is emphasized.

### Information remains primary

The interface exists to help users understand their financial position and act with confidence. Visual styling must never compete with amounts, status, alerts, or available actions.

## Color system

### Core palette

| Role      | Name                  | Hex       | Primary use                                                                  |
| --------- | --------------------- | --------- | ---------------------------------------------------------------------------- |
| Dominant  | Alabaster / Parchment | `#F4F1EA` | Application background, large surfaces, content areas                        |
| Secondary | Ebony                 | `#1A110A` | Primary text, navigation, strong structural elements                         |
| Accent    | Classical Amber       | `#B8773D` | Primary actions, active states, meaningful status markers, selected dividers |
| Support   | Graphite              | `#4A4A4A` | Secondary text, captions, metadata, helper content                           |
| Support   | Walnut                | `#5C4033` | Depth, transitions, secondary emphasis, selected structural details          |

### The 60–30–10 rule

- **60% Alabaster:** use for the page background and most large surfaces. It provides calm, creates visual breathing room, and evokes archival paper.
- **30% Ebony:** use for primary typography and solid structural areas such as the main navigation or high-contrast panels.
- **10% Classical Amber:** reserve for actions and information that genuinely require attention.

The ratio is a composition guideline, not a requirement to measure every screen mathematically. A screen should still feel predominantly light, structurally dark, and selectively accented.

### Semantic colors

The brand accent must not represent every system state. Success, warning, error, and informational feedback require distinguishable semantic colors. Select accessible, muted tones that harmonize with the core palette and document them as tokens before implementation.

Never communicate state through color alone. Pair color with a label, icon, pattern, or position.

### Color tokens

```css
:root {
  --color-parchment: #f4f1ea;
  --color-ebony: #1a110a;
  --color-amber: #b8773d;
  --color-graphite: #4a4a4a;
  --color-walnut: #5c4033;

  --color-background: var(--color-parchment);
  --color-surface: #fffdf8;
  --color-text-primary: var(--color-ebony);
  --color-text-secondary: var(--color-graphite);
  --color-border: rgb(26 17 10 / 16%);
  --color-action-primary: var(--color-amber);
  --color-action-primary-hover: #9f6533;
  --color-focus: var(--color-amber);
}
```

The additional surface and hover values are implementation recommendations derived from the core palette. Validate all final foreground and background combinations against WCAG contrast requirements.

### Dark mode

Dark mode is a **minimal, deliberate swap**, not a second palette: only the off-white surfaces (background and card/surface) become an equivalent dark gray. The accent and the always-dark navigation are untouched.

| Token | Light | Dark | Why |
| --- | --- | --- | --- |
| `--color-background` (was Alabaster) | `#F4F1EA` | `#211E1A` | The one required change — off-white becomes a warm dark gray, same undertone family. |
| `--color-surface` (cards, topbar) | `#FFFDF8` | `#2A2622` | Slightly lighter than the new background, for the same elevation relationship as light mode. |
| `--color-text-primary` | `#1A110A` (Ebony) | `#F1ECE3` | Ebony-on-dark-gray would be unreadable, so primary text flips to a light tone. Ebony itself is unchanged and still used directly for the sidebar and other intentionally-always-dark elements. |
| `--color-text-secondary` (Graphite) | `#4A4A4A` | `#B7B2A9` | Lightened only enough to clear WCAG contrast on the new dark background. |
| Walnut | `#5C4033` | `#8A6A57` | Same reasoning as Graphite — lightened for presence, not redesigned. |
| `--color-action-primary` (Amber) | `#B8773D` | `#B8773D` | **Unchanged.** Amber's contrast against white text was already tuned for a mid-tone background; darkening the page doesn't require darkening the accent. |
| Sidebar / navigation (Ebony background) | Ebony | Ebony | **Unchanged.** The primary navigation is deliberately a fixed dark structural anchor regardless of theme (see "The 60–30–10 rule" above) — it does not participate in the light/dark toggle. |

Semantic status colors are lightened in dark mode only enough to remain legible against the new background; their meaning must remain unchanged. Exact values become normative only when the corresponding tokens are implemented and documented in the shared stylesheet.

Theme is user-selectable (Light / Dark / System) via the header's theme toggle, backed by `next-themes` with `attribute="class"` — selecting a theme adds/removes a `dark` class on `<html>`, which the tokens above key off.

## Typography

### Display typeface: Playfair Display

Use Playfair Display for:

- Page titles.
- Major section headings.
- Important numeric summaries when an editorial tone is appropriate.
- Short statements that establish hierarchy.

Avoid using it for dense tables, form controls, long paragraphs, or small interface labels.

### Functional typeface: Montserrat

Use Montserrat for:

- Body text.
- Navigation.
- Buttons and form controls.
- Tables, filters, labels, and metadata.
- Status indicators and operational content.

### Recommended type scale

| Token        |   Size | Line height | Typeface         | Suggested use                    |
| ------------ | -----: | ----------: | ---------------- | -------------------------------- |
| `display-lg` | `48px` |      `56px` | Playfair Display | Marketing or major landing title |
| `heading-xl` | `36px` |      `44px` | Playfair Display | Page title                       |
| `heading-lg` | `28px` |      `36px` | Playfair Display | Major section                    |
| `heading-md` | `22px` |      `30px` | Playfair Display | Card group or subsection         |
| `body-lg`    | `18px` |      `28px` | Montserrat       | Introductory copy                |
| `body-md`    | `16px` |      `24px` | Montserrat       | Default body text                |
| `body-sm`    | `14px` |      `20px` | Montserrat       | Metadata and table support text  |
| `label`      | `12px` |      `16px` | Montserrat       | Labels and compact status text   |

Use no more than three visibly different type sizes in a single component. Maintain generous line height and avoid long lines; body copy should generally remain between 55 and 75 characters per line.

### Font loading

Prefer self-hosted font files for predictable performance and privacy. Provide robust fallbacks:

```css
--font-display: "Playfair Display", Georgia, "Times New Roman", serif;
--font-body: "Montserrat", Inter, Arial, sans-serif;
```

## Layout and grid

### Grid foundation

Use a 12-column desktop grid, an 8-column tablet grid, and a 4-column mobile grid. Components should align to shared column and baseline boundaries rather than using isolated arbitrary positions.

Recommended layout constraints:

- Maximum content width: `1440px`.
- Reading width for long-form content: `720px` to `800px`.
- Desktop gutters: `32px` to `48px`.
- Tablet gutters: `24px`.
- Mobile gutters: `16px`.

### Spacing scale

Use a base unit of `4px`:

```text
4, 8, 12, 16, 24, 32, 48, 64, 96
```

Prefer `16px` and `24px` for component spacing, `32px` and `48px` between major groups, and `64px` or more between page sections.

### Page composition

A standard authenticated page should contain:

1. A stable primary navigation region.
2. A page header with title, concise context, and at most one primary action.
3. Optional filters or summary metrics.
4. The principal financial view, such as a transaction list, dashboard, reconciliation queue, or portfolio summary.
5. Contextual details or a secondary panel only when they support the active task.

Preserve symmetry at the page level, but allow controlled asymmetry when it clarifies priority or reading order.

## Geometry and surfaces

### Border radius

Use moderate radii between `4px` and `8px`:

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
```

- Use `4px` for compact controls, tags, and table elements.
- Use `6px` for buttons, inputs, and standard cards.
- Use `8px` for large panels, dialogs, and prominent containers.
- Avoid `0px` corners, which feel overly mechanical.
- Avoid radii above `12px`, pill-shaped containers, and playful bubble forms unless required for a compact status badge.

### Borders and depth

Favor subtle borders and tonal separation over large shadows. Surfaces should feel matte and materially grounded, inspired by parchment, polished wood, and leather-bound covers without imitating their textures literally.

Recommended elevation:

```css
--shadow-sm: 0 1px 2px rgb(26 17 10 / 8%);
--shadow-md: 0 8px 24px rgb(26 17 10 / 10%);
```

Do not use glossy gradients, glassmorphism, neon glows, or heavy drop shadows.

## Component guidance

### Navigation

- Use Ebony for the primary navigation when a dark structural anchor is needed.
- Keep labels concise and set them in Montserrat.
- Indicate the active location with Classical Amber and at least one non-color cue.
- Keep navigation placement stable across views.

### Buttons

- Use Classical Amber only for the primary action on a view.
- Use outlined or text buttons for secondary and tertiary actions.
- Use destructive styling only for destructive actions; never use the brand accent as an error color.
- Provide hover, focus, active, disabled, and loading states.

### Cards and panels

- Use cards only to group information that belongs together.
- Prefer a light surface, fine Ebony-tinted border, and minimal elevation.
- Use internal spacing rather than decorative separators whenever possible.
- Avoid nesting several card layers.

### Tables and financial lists

- Optimize for scanning: align labels consistently and align numbers by place value.
- Keep headers visible for long datasets when helpful.
- Use Graphite for supporting metadata and Ebony for primary values.
- Reserve Amber for selected rows, priority markers, or a single important state.
- Provide empty, loading, error, and no-results states.

### Forms and filters

- Place labels above controls for predictable scanning.
- Keep related fields together and separate unrelated sections with spacing.
- Explain validation errors next to the affected field.
- Use borders, icons, and text in addition to color for focus and error states.

### Status indicators

Every financial or operational status must have:

- A concise text label.
- A stable semantic meaning.
- An accessible visual treatment.
- A documented mapping to a design token.

Do not assign status colors ad hoc in individual screens.

## Iconography and imagery

- Use a single icon family with consistent stroke weight and optical size.
- Prefer simple line icons that reinforce actions or categories.
- Do not use icons as the only label for unfamiliar actions.
- Use illustrations or textures only when they add meaning; avoid decorative stock imagery.
- If a logo is introduced, preserve clear space and never distort, recolor, or add effects without updating this guide.

### Image asset formats

- Convert every photographic or illustrative image intended for the initial landing page to WebP before adding it to the production bundle.
- Export responsive image sizes and use the smallest dimensions and quality setting that preserve the intended appearance.
- Keep source files outside the runtime asset directory; production code should reference the optimized WebP derivative.
- Continue to use SVG for scalable interface symbols and ICO for the browser favicon when those formats are more appropriate.

## Motion

Motion should confirm cause and effect, not decorate the interface.

- Keep micro-interactions between `120ms` and `200ms`.
- Keep panel transitions between `200ms` and `300ms`.
- Prefer subtle opacity and position changes.
- Avoid bounce, elastic movement, parallax, and continuous ambient animation.
- Respect `prefers-reduced-motion` and ensure the interface remains understandable without animation.

## Accessibility

- Meet WCAG 2.2 AA contrast requirements for text and interactive elements.
- Maintain visible keyboard focus using a treatment distinct from the component border.
- Provide complete keyboard navigation and logical focus order.
- Use semantic HTML before adding ARIA attributes.
- Provide text alternatives for meaningful images and accessible names for controls.
- Do not rely on color, position, or motion alone to communicate information.
- Support text zoom up to 200% and responsive reflow without loss of functionality.

## Voice and terminology

Talentum copy should be precise, calm, and direct.

- Use concise sentences and concrete verbs.
- Prefer familiar product language over academic or technical jargon.
- Describe what happened and what the user can do next in error messages.
- Use consistent names for transactions, accounts, categories, statuses, amounts, and dates.
- Avoid playful language in critical, destructive, or operational workflows.

## Design review checklist

- [ ] The screen has one clear primary task.
- [ ] The composition follows the 60–30–10 color principle.
- [ ] Amber is restricted to meaningful emphasis and action.
- [ ] Playfair Display is limited to display hierarchy.
- [ ] Montserrat remains readable in operational content.
- [ ] Layout elements align to the shared grid and spacing scale.
- [ ] Border radii remain between `4px` and `8px` in normal components.
- [ ] Shadows and decoration are restrained and matte.
- [ ] Loading, empty, error, disabled, and success states are defined.
- [ ] Keyboard, contrast, zoom, and reduced-motion behavior were verified.
- [ ] The interface prioritizes financial information over decoration.

## Governance

- Treat the tokens and rules in this document as the default source of truth.
- Record exceptions with a reason and validate them during design review.
- Add new colors, typography styles, spacing values, and components centrally instead of introducing one-off values.
- Update this document whenever the visual system changes.
- Keep implementation tokens synchronized with the documented values.
