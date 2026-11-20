# Talentum Design System

This document is the source of truth for Talentum's visual identity and interface design: brand principles and voice, marks and assets, color, typography, layout, geometry, iconography, motion, components, state illustrations, accessibility, and the visual QA process with its dated log. It covers the local application in `src/` (Next.js UI rendered in the browser and in Electron) and the public landing page in `apps/web/`. Every statement of state is marked **Current**, **Planned**, or **Open**; values marked Current were verified against the stylesheets and scripts in the repository.

## Table of contents

- [Brand principles and voice](#brand-principles-and-voice)
- [Logo, marks and generated assets](#logo-marks-and-generated-assets)
- [Color system](#color-system)
- [Typography](#typography)
- [Layout, grid and spacing](#layout-grid-and-spacing)
- [Geometry and surfaces](#geometry-and-surfaces)
- [Iconography and imagery](#iconography-and-imagery)
- [Motion](#motion)
- [Components and layout patterns](#components-and-layout-patterns)
- [State illustrations](#state-illustrations)
- [Accessibility](#accessibility)
- [Visual QA process](#visual-qa-process)
- [Visual QA log](#visual-qa-log)
- [Design review checklist](#design-review-checklist)
- [Governance](#governance)
- [Open items](#open-items)

## Brand principles and voice

Status: **Current** (normative guidance).

Talentum is a local-first personal finance system. It must communicate trust, clarity, stability and depth. Its visual language combines the rigor required by financial information with a restrained classical aesthetic. Every design choice should improve comprehension, reinforce hierarchy and reduce cognitive fatigue.

### Order before decoration

Structure is part of the brand. Prefer clear hierarchy, predictable alignment and deliberate spacing over ornamental elements.

### Classical authority, modern precision

Editorial typography and warm, archival colors provide historical depth. Geometric body typography, consistent grids and functional components keep the system contemporary and technically precise.

### Restraint creates emphasis

Accent color, shadows, borders and motion must be used sparingly. If everything is emphasized, nothing is emphasized.

### Information remains primary

The interface exists to help users understand their financial position and act with confidence. Visual styling must never compete with amounts, status, alerts or available actions.

### Voice and terminology

Talentum copy should be precise, calm and direct.

- Use concise sentences and concrete verbs.
- Prefer familiar product language over academic or technical jargon.
- Describe what happened and what the user can do next in error messages.
- Use consistent names for transactions, accounts, categories, statuses, amounts and dates.
- Avoid playful language in critical, destructive or operational workflows.
- Never render internal documentation, local paths, diagnostics, infrastructure metadata or staff identities in public UI (CLAUDE.md rule).

The full writing rules, glossary and copy checklists are in [UX writing and copy](#ux-writing-and-copy).

## Design principles

Status: **Current** (normative). CLAUDE.md requires every interface change to be validated against all of these principles before it is called done, and any principle a change does not meet to be reported.

Each principle has an ID, a one-line rule, how it applies to Talentum, and a check that a reviewer can perform. The sources are listed under [References](#references); the principles distill them, they do not replace them. Where a rule already exists elsewhere in this document, the principle points to it instead of restating it.

### Conventions first

**P1. Follow the conventions people already know (Jakob's law).**

- **Rule.** People spend most of their time in other products and expect yours to work the same way. Base interaction, navigation and layout on patterns from large, widely used products and from the platform guidelines (Apple HIG, Material Design), not on invention.
- **In Talentum.** A bank-statement list behaves like the transaction list of a mainstream banking app; a sheet closes with Esc, the scrim, a visible close button and (on touch) a downward swipe; swipe gestures do what they do in mainstream mobile apps and are never the only way to act (HIG, Gestures). The pattern catalog under [Responsiveness and viewport validation](#responsiveness-and-viewport-validation) names the reference for each pattern.
- **Check.** For every new or changed pattern, name the reference product or guideline it follows. Justify any deviation in the change description; an unjustified deviation fails review.

### Usability heuristics (NN/g)

**P2. Visibility of system status.**

- **Rule.** Always show what the system is doing and what state the data is in, promptly.
- **In Talentum.** Loading, empty, error and confirmed-zero are different states and look different (State illustrations rule 1; dashboard rule R-29 in [PRODUCT.md](PRODUCT.md)). A value is never shown before the backend confirms it.
- **Check.** Throttle the network or the local backend and verify that each area shows a loading state, then the real state, and never a zero or "none" while the query is pending.

**P3. Match the real world.**

- **Rule.** Use the words, units and order people already use outside the product.
- **In Talentum.** Money in `R$ 1.234,56`, dates written out in Portuguese, terms from the [glossary](#glossary-of-core-terms) rather than database or engineering terms.
- **Check.** Read every visible string aloud; no technical term (backend, ID, SQLite, persistir) remains unless the [glossary](#glossary-of-core-terms) allows it.

**P4. User control and freedom.**

- **Rule.** Every action has a clearly marked way out or back.
- **In Talentum.** Dialogs and drawers close with Esc, the scrim and a close button (Breakpoints of the local app); an import batch can be undone (`Desfazer lote`).
- **Check.** From every overlay and every step of a flow, reach the previous state with the keyboard alone and with touch alone.

**P5. Consistency and standards.**

- **Rule.** One name, one look and one position for one thing, throughout the product.
- **In Talentum.** Tokens, components and the glossary are the standard; status colors map to tokens (Status indicators).
- **Check.** Search the code for every new label and component variant; if a synonym or an equivalent component already exists, reuse it.

**P6. Error prevention.**

- **Rule.** Prevent the error before it happens: constrain input, warn early, confirm only what is serious.
- **In Talentum.** Amount fields must accept only valid decimal input (the layout guide uses `inputMode="decimal"`); destructive or irreversible actions (undoing an import, deleting data) name their consequence before running.
- **Check.** Try to submit each form with empty, malformed and extreme values; the form blocks the invalid ones next to the field and keeps the rest of the input.

**P7. Recognition rather than recall.**

- **Rule.** Keep options, context and previous choices visible.
- **In Talentum.** The active period and the active account stay visible next to the figures they qualify (for example `Saldo Livre de Risco · 1 a 30 de setembro`).
- **Check.** On every screen with figures, verify that the period, account and unit of each figure can be read without opening anything.

**P8. Flexibility and efficiency of use.**

- **Rule.** Accelerators for frequent users, never at the cost of the basic path.
- **In Talentum.** Keyboard operation of every control in the Electron app; shortcuts, if added, duplicate a visible control.
- **Check.** Complete the main task of the screen with the keyboard only; no action exists only as a shortcut or only as a gesture.

**P9. Aesthetic and minimalist design (restraint).**

- **Rule.** Every element must earn its place; remove what does not help the current task. This is also Dieter Rams's tenth principle, "good design is as little design as possible".
- **In Talentum.** Brand principles "Restraint creates emphasis" and "Information remains primary"; 60–30–10; no ornament on the landing page (Landing page surfaces).
- **Check.** For each element, ask what breaks if it is removed. If nothing, remove it.

**P10. Help users recognize, diagnose and recover from errors.**

- **Rule.** Say what happened, why, and what to do next, in plain language, at the place of the error.
- **In Talentum.** Error strip inside the affected component; State illustrations rule 3; error copy rules under [UX writing and copy](#ux-writing-and-copy).
- **Check.** Force each error path and verify the message names the problem and offers an action (retry, edit, go back), with no code, stack trace or internal detail.

**P11. Help and documentation in context.**

- **Rule.** Explain at the moment of need, briefly, next to the thing explained.
- **In Talentum.** The layout guide defines an `Entender o cálculo` link for derived figures such as `Saldo Livre de Risco`; the dashboard does not render it yet (**Open**). Internal documentation is never rendered in public UI (CLAUDE.md rule).
- **Check.** Every computed figure has an explanation reachable in one step from the figure itself.

### Perception (Gestalt)

**P12. Proximity.**

- **Rule.** Things that belong together sit together; space separates groups.
- **In Talentum.** A label sits closer to its own value than to the next value; the spacing scale sets the group gaps (16–24 px inside components, 32–48 px between groups).
- **Check.** At every viewport class, verify that stacked layouts did not move a label away from its value or a button away from the content it acts on.

**P13. Similarity.**

- **Rule.** Same appearance means same meaning; different meaning needs a different appearance.
- **In Talentum.** Only interactive text is styled as a link; status chips use one style per status token.
- **Check.** No non-interactive element shares the style of an interactive one, and no two meanings share a style.

**P14. Common region.**

- **Rule.** A bounded area groups its contents.
- **In Talentum.** Cards group only information that belongs together (Cards and panels); no nested card layers.
- **Check.** Each card answers one question; split a card that answers two.

**P15. Continuity and alignment.**

- **Rule.** Elements on a shared line or column are read as related and in sequence.
- **In Talentum.** Amounts align by place value; labels align on a common edge (Tables and financial lists).
- **Check.** In every list and table, decimal commas of the amounts line up vertically.

**P16. Figure and ground.**

- **Rule.** The foreground (overlay, focused item, primary figure) must separate clearly from the background.
- **In Talentum.** Overlays use the scrim and `--shadow-md`; the dark theme keeps the same elevation relationship (Dark mode).
- **Check.** In both themes, an open dialog or drawer is unmistakably above the page, and the page behind it is clearly inactive.

### Laws of UX

**P17. Fitts's law.**

- **Rule.** Frequent and important targets are large and close to where attention already is; dangerous targets are not next to frequent ones.
- **In Talentum.** At least 44 px targets on coarse pointers; the primary action sits next to the content it affects; destructive buttons are separated from the primary one.
- **Check.** Measure every interactive target on touch viewports; verify that no destructive control is adjacent to a primary control.

**P18. Hick's law and choice overload.**

- **Rule.** Decision time grows with the number and complexity of choices; offer fewer, clearer choices.
- **In Talentum.** At most one primary action per view (Page composition); secondary options move into menus or progressive disclosure.
- **Check.** Count the visible actions on the screen; more than one primary action, or a menu longer than a screen on a phone, fails.

**P19. Chunking and working memory (Miller).**

- **Rule.** People hold few items in working memory; group information into meaningful chunks.
- **In Talentum.** Amounts are grouped by thousands (`formatCents`); transactions are grouped by date; long forms are split into labeled sections.
- **Check.** No list, number or form presents an unbroken run that the reader must parse unaided.

**P20. Doherty threshold.**

- **Rule.** Keep system responses under about 400 ms, or show progress so the person is never left waiting without feedback.
- **In Talentum.** Buttons respond on press (Motion); local queries should answer within the threshold, and imports must show progress.
- **Check.** Measure the response time of each interaction; anything above 400 ms shows a loading or progress state.

**P21. Tesler's law (conservation of complexity).**

- **Rule.** Some complexity cannot be removed, only moved; move it into the system, not onto the person.
- **In Talentum.** The system parses CSV and OFX, computes `Saldo Livre de Risco` and suggests matches; decisions that only the person can make (confirming a reconciliation) stay with the person, explained.
- **Check.** For each step a person performs, ask whether the system already has the information to do it; if so, the step is a defect.

**P22. Aesthetic-usability effect.**

- **Rule.** Attractive interfaces are perceived as easier to use, which can hide real usability problems.
- **In Talentum.** Visual polish never substitutes for task testing.
- **Check.** Validate by task completion (can the person do X?), not by impressions of the screenshot.

**P23. Von Restorff effect (isolation).**

- **Rule.** The item that differs is the one remembered; use difference for the one thing that matters.
- **In Talentum.** Amber is the 10% accent, reserved for the primary action or a single important state (The 60–30–10 rule).
- **Check.** Each screen has at most one Amber emphasis competing for attention.

**P24. Serial position effect.**

- **Rule.** First and last items in a sequence are remembered best.
- **In Talentum.** The most important figure leads the dashboard; the most used navigation items are at the start of the list.
- **Check.** In every list, menu and row of cards, the item placed first is the most important one for the screen's task.

### Accessibility (WCAG 2.2 AA)

The [Accessibility](#accessibility) section holds the requirements; these principles add the measurable thresholds.

**P25. Contrast (1.4.3, 1.4.11).**

- **Rule.** Text contrast at least 4.5:1, or 3:1 for large text (18 pt, or 14 pt bold); non-text contrast (control boundaries, focus indicators, chart marks, state indicators) at least 3:1 against adjacent colors.
- **In Talentum.** Tokens are tuned per theme; `--lp-amber-text` exists because pure Amber fails as small text.
- **Check.** Measure every new foreground and background pair in the light theme and in the dark theme.

**P26. Target size (2.5.8).**

- **Rule.** Pointer targets are at least 24 × 24 CSS px, or spaced so that a 24 px circle around each does not touch another target. Talentum's own floor on coarse pointers is 44 px.
- **Check.** Measure the smallest target on each screen at the touch viewport classes.

**P27. Focus visible and not obscured (2.4.7, 2.4.11).**

- **Rule.** The keyboard focus is always visible, and a focused element is never hidden behind sticky headers, drawers or toasts.
- **In Talentum.** The global `:focus-visible` Amber outline.
- **Check.** Tab through each screen at Desktop S and at Mobile M; every focused element stays at least partially visible and its outline is visible in both themes.

**P28. Reflow (1.4.10) and text spacing (1.4.12).**

- **Rule.** Content works at 320 CSS px wide without two-dimensional scrolling (data tables and charts excepted), and survives line height 1.5, paragraph spacing 2 em, letter spacing 0.12 em and word spacing 0.16 em without clipping or overlap.
- **Check.** Render at Mobile S (320 px) and apply the four text-spacing overrides; nothing is cut, overlapping or reachable only by horizontal scroll.

### Composition

**P29. Visual hierarchy.**

- **Rule.** Importance is visible through size, weight, position and contrast, in that order of preference; color is the last resort.
- **In Talentum.** Type scale and three-sizes-per-component rule (Typography); the currency symbol takes less weight than the value (R-24 in [PRODUCT.md](PRODUCT.md)).
- **Check.** Blur a screenshot of the screen: the first thing still readable is the most important thing on it.

**P30. Progressive disclosure.**

- **Rule.** Show the few most important options first and reveal the rest on request, with no more than two levels of disclosure.
- **In Talentum.** Advanced filters, calculation details and secondary settings start collapsed.
- **Check.** No disclosure is nested more than two levels deep, and every collapsed control has a label that says what it reveals.

**P31. Honest data.**

- **Rule.** The interface never presents a figure, state or claim that the system has not confirmed. This applies Rams's principle that good design is honest to financial data.
- **In Talentum.** No fake zeros, no placeholder figures, no demo data presented as real (State illustrations rule 1; dashboard rule R-29).
- **Check.** Every number on the screen traces to a backend response; every "none" traces to a confirmed zero.

### Principles validation checklist

Copy into the review of every interface change and mark each item; report the failed ones.

- [ ] P1 The reference product or guideline for each pattern is named; deviations are justified.
- [ ] P2 Loading, empty, error and confirmed-zero states are distinct; no value before confirmation.
- [ ] P3, P5 Copy follows the glossary; no technical term or synonym drift.
- [ ] P4 Every overlay and flow step can be left with keyboard and with touch.
- [ ] P6, P10 Invalid input is blocked at the field; errors say what, why and what next.
- [ ] P7 Period, account and unit of every figure are visible.
- [ ] P8 The main task works with the keyboard only.
- [ ] P9 Every element earns its place.
- [ ] P11 Every computed figure is explained in one step.
- [ ] P12–P16 Grouping, similarity, regions, alignment and figure/ground hold at every viewport class and in both themes.
- [ ] P17, P26 Targets meet 24 px (WCAG) and 44 px on coarse pointers; destructive controls are separated.
- [ ] P18, P23, P24 One primary action, one Amber emphasis, most important item first.
- [ ] P19 Numbers, lists and forms are chunked.
- [ ] P20 Responses above 400 ms show progress.
- [ ] P21 No step asks the person for information the system already has.
- [ ] P22 Validated by task completion, not by appearance.
- [ ] P25 Contrast measured in both themes.
- [ ] P27 Focus visible and not obscured.
- [ ] P28 Reflow at 320 px and text-spacing overrides pass.
- [ ] P29, P30 The hierarchy survives the blur test; disclosure is at most two levels.
- [ ] P31 Every figure and every "none" traces to the backend.

## Logo, marks and generated assets

Status: **Current**.

### Marks

The marks are true vectors (about 1.2 KB each), drawn once in `scripts/gerar-marca.mjs` on a 620 × 545 coordinate grid; the previous files were PNGs wrapped in SVG. Run `pnpm marca:gerar` after any change to the mark. The script writes:

| Output | Use |
| --- | --- |
| `icon-talentum-light.svg`, `icon-talentum-dark.svg` (repository root) | Lockups. `icon-talentum-dark.svg` is the high-contrast lockup used in the app sidebar (imported by `src/components/app-shell.tsx`), because that structural surface remains Ebony in both themes. `icon-talentum-light.svg` is reserved for light surfaces. |
| `public/marca/talentum-clara.svg`, `public/marca/talentum-escura.svg` and the same pair in `apps/web/public/marca/` | Marks served by the local app and by the landing page. |
| `icon-badge.svg` (repository root) | The rounded badge used for the window icon and favicons. |
| `icon-badge.ico`, `src/app/favicon.ico`, `apps/web/src/app/favicon.ico` | Multiresolution ICO files (16, 24, 32, 48, 64, 128 and 256 px), rasterized with the `sharp` copy installed with Next. |

The frameless Electron window uses `icon-badge.ico` as its native Windows window and taskbar icon (`electron/main.cjs`). `tests/regression/brand-vectors.test.mjs` guards the vector marks.

If the logo is used anywhere new, preserve its clear space and never distort it, recolor it or add effects without updating this document.

### Other generated brand assets

| Command | Script | Output |
| --- | --- | --- |
| `pnpm lp:lut` | `scripts/gerar-lut.mjs` | `talentum-archive.cube` (17³ LUT) in `public/lut/` and `apps/web/public/lut/`. Same grade as the CSS `.lp-lut` filter and the SVG `#lut-talentum` filter: slight desaturation, midtones warmed toward Classical Amber, shadows settled into Ebony, gentle S-curve contrast. Usable in photo, video and design tools. |
| `pnpm lp:telas` | `scripts/redimensionar-telas-lp.mjs` | 640 px `-640.webp` variants of the app screenshots in `apps/web/public/telas/`, used in the landing page `srcset`. |
| `pnpm lp:icones` | `scripts/gerar-icones-lp.mjs` | Inline SVG icon map for the landing page (see Iconography). |
| `pnpm estados:gerar` | `scripts/gerar-estados.mjs` | Themed state illustrations (see State illustrations). |

## Color system

### Core palette

Status: **Current**.

| Role | Name | Hex | Primary use |
| --- | --- | --- | --- |
| Dominant | Alabaster / Parchment | `#F4F1EA` | Application background, large surfaces, content areas |
| Secondary | Ebony | `#1A110A` | Primary text, navigation, strong structural elements |
| Accent | Classical Amber | `#B8773D` | Primary actions, active states, meaningful status markers, selected dividers |
| Support | Graphite | `#4A4A4A` | Secondary text, captions, metadata, helper content |
| Support | Walnut | `#5C4033` | Depth, transitions, secondary emphasis, selected structural details |

### The 60–30–10 rule

- **60% Alabaster:** the page background and most large surfaces. It provides calm, creates breathing room and evokes archival paper.
- **30% Ebony:** primary typography and solid structural areas such as the main navigation or high-contrast panels.
- **10% Classical Amber:** reserved for actions and information that genuinely require attention.

The ratio is a composition guideline, not a requirement to measure every screen mathematically. A screen should still feel predominantly light, structurally dark and selectively accented.

### Local app tokens (light and dark)

Status: **Current**. Defined in `src/app/globals.css`: light values in `:root`, dark overrides in `html.dark`. Tokens not overridden in `html.dark` keep their light value in both themes.

| Token | Light (`:root`) | Dark (`html.dark`) | Role |
| --- | --- | --- | --- |
| `--parchment` | `#f4f1ea` | (unchanged) | Brand primitive |
| `--ebony` | `#1a110a` | (unchanged) | Brand primitive; sidebar and other always-dark elements |
| `--amber` | `#b8773d` | (unchanged) | Accent, primary action, focus ring, links |
| `--graphite` | `#4a4a4a` | (unchanged) | Brand primitive |
| `--walnut` | `#5c4033` | `#8a6a57` | Secondary emphasis; lightened for presence in dark, not redesigned |
| `--bg` | `var(--parchment)` | `#211e1a` | Page background |
| `--surface` | `#fffdf8` | `#2a2622` | Cards, topbar, chart surfaces |
| `--ink` | `var(--ebony)` | `#f1ece3` | Primary text |
| `--ink2` | `var(--graphite)` | `#b7b2a9` | Secondary text |
| `--line` | `rgb(26 17 10 / 16%)` | `rgb(241 236 227 / 14%)` | Borders and dividers |
| `--line-strong` | `rgb(26 17 10 / 30%)` | `rgb(241 236 227 / 28%)` | Stronger borders, scrollbar thumb |
| `--sunken` | `#eee9dd` | `#1d1a16` | Recessed areas |
| `--amber-hover` | `#9f6533` | (unchanged) | Primary action hover, link hover |
| `--on-amber` | `#fffdf8` | (unchanged) | Text on Amber |
| `--ok` / `--ok-s` | `#4a6741` / `#e9efe6` | `#8fb283` / `#2d372a` | Success foreground / soft background |
| `--warn` / `--warn-s` | `#8a6d1b` / `#f5eeda` | `#d9a93e` / `#3a3120` | Warning foreground / soft background |
| `--err` / `--err-s` | `#8b1e1e` / `#f6e7e7` | `#e08c8c` / `#3a2727` | Error foreground / soft background |
| `--info` / `--info-s` | `#3e5c76` / `#e7edf3` | `#8fb4ce` / `#26313a` | Informational foreground / soft background |
| `--shadow-sm` | `0 1px 2px rgb(26 17 10 / 8%)` | (unchanged) | Minimal elevation |
| `--shadow-md` | `0 8px 24px rgb(26 17 10 / 10%)` | `0 8px 24px rgb(0 0 0 / 34%)` | Overlay elevation |
| `--radius-sm` / `--radius-md` / `--radius-lg` | `4px` / `6px` / `8px` | (unchanged) | See Geometry |
| `--data-1` | `#2a78d6` | `#3987e5` | Chart single-series and primary-series mark |
| `--data-recessive` | `#898781` | (unchanged) | De-emphasized chart groups |

Font tokens (`--font-display`, `--font-body`, `--font-mono`) are listed under Typography.

Additional global rules in `globals.css` (**Current**): `:focus-visible` draws a 2 px `--amber` outline with 3 px offset; `::selection` uses Amber at 24% opacity; `caret-color` and `accent-color` follow `--amber`; under `@media (prefers-contrast: more)` both themes set `--line` to `--line-strong`, the overlay scrim darkens to 70% and dialogs and drawers take an `--ink2` border.

The semantic status values are still treated as proposals in the stylesheet header comment ("validate contrast before treating them as normative"). See Open items.

### Dark mode

Status: **Current**.

Dark mode is a minimal, deliberate swap, not a second palette: the off-white surfaces (`--bg`, `--surface`) become warm dark grays in the same undertone family, and text and supporting tones are lightened only as needed.

- `--bg` `#211e1a` is the one required change; `--surface` `#2a2622` is slightly lighter to keep the same elevation relationship as light mode.
- `--ink` flips to `#f1ece3` because Ebony on dark gray would be unreadable. Ebony itself is unchanged and still used directly for the sidebar and other intentionally always-dark elements.
- `--ink2` and `--walnut` are lightened only enough to clear WCAG contrast on the dark background.
- `--amber` is **unchanged**: its contrast against light text was already tuned for a mid-tone background, so darkening the page does not require darkening the accent.
- The primary navigation (Ebony background) is **unchanged**: it is a fixed dark structural anchor regardless of theme and does not participate in the toggle.
- Semantic status colors are lightened in dark mode only enough to remain legible; their meaning does not change.

The theme is user-selectable through a dropdown in the header and in Settings, with the options `Claro`, `Escuro` and `Sistema`. The preference is persisted in browser storage under the key `talentum:tema` (`src/components/app-state.tsx`), and an inline bootstrap script in `src/app/layout.tsx` adds the `dark` class to `<html>` before first paint when the stored value is `Escuro`, or `Sistema` with a dark system preference. The tokens above key off that class.

### Data visualization tokens

Status: **Current** for `--data-1`, `--data-recessive`, `--data-gain` and `--data-loss`; **Open** for the full categorical palette.

The core palette is warm and near-monochrome. That is an asset for the interface and a liability for charts: measured against the product surfaces, Walnut and Amber fail the categorical checks in both themes, and in dark mode they fall below the normal-vision separation floor — two adjacent browns that even full-color-vision readers struggle to tell apart. Chart marks therefore take their own tokens, and the brand accent stays in the chrome.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--data-1` | `#2a78d6` | `#3987e5` | Single-series and primary-series mark |
| `--data-recessive` | `#898781` | `#898781` | De-emphasized groups such as `Outros` and `Sem categoria` |
| `--data-gain` | `#157f52` | `#4fbf85` | Financial gain: income bars above the zero line |
| `--data-loss` | `#b32d22` | `#dd5d50` | Financial loss: expense bars below the zero line |

All four clear 3:1 against the light (`#FFFDF8`) and dark (`#2A2622`) chart surfaces. Classical Amber remains the **emphasis** color — one highlighted series against grey — and is never a categorical slot.

#### Ratifying a data token

Run the validator before adding any mark color. It is versioned at `scripts/validate-palette.mjs` and its verdicts are locked by `tests/palette.test.mjs`:

```bash
node scripts/validate-palette.mjs "#2a78d6,#157f52,#b32d22,#898781" \
  --mode light --surface "#FFFDF8" --neutral "#898781" --pairs all
```

`--data-gain` and `--data-loss` were ratified on 2026-09-12 this way, in both themes and in the strictest pairing mode: all five checks pass, with a worst color-vision-deficiency ΔE of 13.6 in light and 12.2 in dark, above the target of 8.

They exist as their own tokens because R-14 of the dashboard specification in [PRODUCT.md](PRODUCT.md) forbids reusing the semantic tokens as series fills: `--ok` and `--err` mean *state*, and measured against each other they collapse under deuteranopia. Gain and loss are **quantities**, not states.

Color is never the only channel for them: the diverging chart anchors income above and expense below the zero line, and every value carries a sign.

The full eight-slot categorical palette is **not ratified**; it remains an open dashboard decision recorded in [PRODUCT.md](PRODUCT.md). Introduce it only after validating it against these surfaces.

### Semantic colors

Status: **Current** (rules); token values above.

- Semantic tokens mean *state* and are never used as chart series colors: measured against each other they collapse under deuteranopia.
- Every semantic use ships with an icon and a label. Never communicate state through color alone; pair color with a label, icon, pattern or position.
- The brand accent must not represent every system state. Success, warning, error and informational feedback use the distinguishable `--ok`, `--warn`, `--err` and `--info` tokens.
- Never use the brand accent as an error color.

### Landing page tokens

Status: **Current**. `apps/web/src/styles/lp.css` defines its own `--lp-*` tokens scoped to `.lp-root`, so the sheet can be imported inside the local app (as `src/app/lp/page.tsx` does) without affecting product screens. The sheet's header comment requires that a token changed here also be changed in `globals.css` and vice versa.

| Token | Value | Notes |
| --- | --- | --- |
| `--lp-parchment`, `--lp-ebony`, `--lp-amber`, `--lp-graphite`, `--lp-walnut` | Same as the core palette | |
| `--lp-bg`, `--lp-surface`, `--lp-ink`, `--lp-ink2` | `var(--lp-parchment)`, `#fffdf8`, `var(--lp-ebony)`, `var(--lp-graphite)` | |
| `--lp-line`, `--lp-line-strong`, `--lp-sunken` | `rgb(26 17 10 / 16%)`, `rgb(26 17 10 / 30%)`, `#eee9dd` | |
| `--lp-amber-hover` | `#8a5629` | Differs from the app's `--amber-hover` (`#9f6533`) |
| `--lp-on-amber` | `#fffdf8` | |
| `--lp-amber-text` | `#8f5a24` | Pure Amber fails WCAG AA as small text on parchment; this variant passes |
| `--lp-amber-strong` | `#9f6533` | Amber button background that passes AA with light text |
| `--lp-ok`, `--lp-warn`, `--lp-info`, `--lp-warn-s`, `--lp-info-s` | Same as the light app values | No error tokens on the LP |
| `--lp-radius-sm/md/lg`, `--lp-shadow-sm/md` | Same as the app | |
| `--lp-ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Strong ease-out |
| `--lp-page` | `1200px` (`1440px` at 1600 px and wider) | Page width |
| `--lp-prose` | `68ch` | Reading width |

The landing page is **light-only** (**Current**): `.lp-root` and `apps/web/src/styles/base.css` set `color-scheme: light`, the site does not follow the operating system theme, and `lp.css` defines no dark tokens. See Open items.

## Typography

Status: **Current**.

### Display typeface: Playfair Display

Use Playfair Display for page titles, major section headings, important numeric summaries when an editorial tone is appropriate, and short statements that establish hierarchy. Avoid it for dense tables, form controls, long paragraphs and small interface labels. Large Playfair titles (`.page-title`, `.h-display-lg`, `.figure-hero`) use `letter-spacing: -0.01em`; body text stays neutral.

### Functional typeface: Montserrat

Use Montserrat for body text, navigation, buttons and form controls, tables, filters, labels and metadata, and status indicators and operational content.

### Type scale

| Token | Size | Line height | Typeface | Suggested use |
| --- | ---: | ---: | --- | --- |
| `display-lg` | `48px` | `56px` | Playfair Display | Marketing or major landing title |
| `heading-xl` | `36px` | `44px` | Playfair Display | Page title |
| `heading-lg` | `28px` | `36px` | Playfair Display | Major section |
| `heading-md` | `22px` | `30px` | Playfair Display | Card group or subsection |
| `body-lg` | `18px` | `28px` | Montserrat | Introductory copy |
| `body-md` | `16px` | `24px` | Montserrat | Default body text (the `body` default in `globals.css`) |
| `body-sm` | `14px` | `20px` | Montserrat | Metadata and table support text |
| `label` | `12px` | `16px` | Montserrat | Labels and compact status text |

Use no more than three visibly different type sizes in a single component. Maintain generous line height and avoid long lines; body copy should generally stay between 55 and 75 characters per line. No product text goes below 12 px, and no landing page reading text goes below 13 px.

### Font tokens and loading

The local app self-hosts the fonts through `@fontsource` packages imported in `src/app/layout.tsx` (Montserrat 400/500/600/700, Playfair Display 600/700), with no external font request.

```css
--font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
--font-body: 'Montserrat', 'Segoe UI', Arial, sans-serif;
--font-mono: ui-monospace, 'Cascadia Mono', 'Consolas', 'Liberation Mono', monospace;
```

`--font-mono` is a documented exception: the system monospace stack is used only for code excerpts in the layout guide (`/layout-guide`); no product screen uses it.

### Font fallbacks on the landing page

`apps/web/src/styles/lp.css` declares `Playfair Display Fallback` (local Times New Roman) and `Montserrat Fallback` (local Arial) with `size-adjust` and ascent, descent and line-gap overrides computed with Next's `calculateSizeAdjustValues`. While the brand fonts load, text occupies the same space, so the swap causes no layout shift.

```css
--lp-display: 'Playfair Display', 'Playfair Display Fallback', Georgia, serif;
--lp-body: 'Montserrat', 'Montserrat Fallback', 'Segoe UI', Arial, sans-serif;
```

## Layout, grid and spacing

### Grid foundation

Status: **Current** (guidance).

Use a 12-column desktop grid, an 8-column tablet grid and a 4-column mobile grid. Components align to shared column and baseline boundaries rather than isolated arbitrary positions.

- Maximum content width: `1440px`.
- Reading width for long-form content: `720px` to `800px`.
- Desktop gutters: `32px` to `48px`; tablet gutters: `24px`; mobile gutters: `16px`.

### Breakpoints of the local app

Status: **Current**. The Electron window opens at 1024 px or wider, but the layout serves any width.

| Width | Behavior |
| --- | --- |
| above 900 px | Fixed sidebar (248 px, or 76 px collapsed) and a one-row header; below 1180 px the header is tightened so it still fits on one row at the 1024 px Electron minimum |
| 900 px and below | The sidebar becomes a drawer opened by a menu button; the closed drawer is `inert`; Esc, the scrim and navigation close it; window controls are hidden outside Electron; the quick-cash button keeps only its icon |
| 600 px and below | 16 px side gutters, the header title truncates, the theme selector moves to Settings only, tabs scroll horizontally, dialogs take the full width |
| touch pointers (`pointer: coarse`) | Interactive targets are at least 44 px |

Rules live in `src/app/globals.css` (the responsive section) and their regression tests in `tests/regression/responsive.test.mjs`.

### Landing page breakpoints

Status: **Current**. Below 1000 px the header navigation collapses into the `Seções` menu; below 560 px the repository link becomes an icon; below 1100 px the five steps become rows with the icon on the left; grids use explicit column counts per width range so that four items never wrap as three plus one, nor three as two plus one; at 1600 px and wider `--lp-page` widens to 1440 px.

### Spacing scale

Status: **Current** (guidance). Base unit `4px`:

```text
4, 8, 12, 16, 24, 32, 48, 64, 96
```

Prefer `16px` and `24px` for component spacing, `32px` and `48px` between major groups, and `64px` or more between page sections. Card inner padding follows a consistent scale: 16 px for compact cards, 18 px for standard cards and 20 px for highlighted cards. Native heading and paragraph margins are normalized; separation belongs to components, and inner headers do not duplicate padding and borders inside already-padded cards.

### Page composition

A standard page contains:

1. A stable primary navigation region.
2. A page header with title, concise context and at most one primary action.
3. Optional filters or summary metrics.
4. The principal financial view, such as a transaction list, dashboard, reconciliation queue or portfolio summary.
5. Contextual details or a secondary panel only when they support the active task.

Preserve symmetry at the page level, but allow controlled asymmetry when it clarifies priority or reading order.

## Responsiveness and viewport validation

Status: **Current** (normative process). CLAUDE.md makes this section mandatory for every interface change.

Responsiveness is adapting the experience to the context, not fitting the same layout into a smaller box. For each layout and each viewport class, choose the pattern that best serves the task there: filters that sit side by side on a desktop become a `Filtrar` button that opens a sheet on a phone; a table becomes a list; hover becomes an explicit control. Shrinking, wrapping and hiding are tools, not the goal.

Two guidelines frame the decision. Material's window size classes are defined by the space available, not by device type (compact below 600 dp, medium 600–839, expanded 840–1199, large 1200–1599, extra-large 1600 and above). Apple's HIG says to keep functionality the same when the size class changes and change only how much of it is visible at once, for example a tab bar that becomes a sidebar with more room.

### The twelve viewport classes

Every interface change is validated at the twelve classes below, in the light theme and in the dark theme. Sizes are CSS px (width × height) in the browser or Electron window. The representative devices are examples of what produces that viewport, not a device list to support.

| Class | Test size | Representative devices | Why this size | Local app CSS that applies | Landing page CSS that applies |
| --- | --- | --- | --- | --- | --- |
| Mobile S | 320 × 568 | iPhone SE (1st generation); any 1280 px desktop window at 400% zoom | WCAG 1.4.10 reflow width | ≤ 600 phone rules, ≤ 720 category bars, ≤ 900 drawer | below 560: one column, repository link as icon |
| Mobile M | 390 × 844 | iPhone 12 to 15 class; spot-check 360 × 800 for common Android phones | Among the most used mobile resolutions on StatCounter (August 2026); already the project's phone QA width | Same as Mobile S | below 560 |
| Mobile L | 414 × 896 | iPhone 11 and XR class, large Android phones | Most used mobile resolution on StatCounter (August 2026) | Same as Mobile S | below 560 |
| Tablet S | 600 × 960 | 7 to 8 inch Android tablets in portrait | Lower bound of Material's medium class | Exactly 600 still takes the ≤ 600 phone rules; drawer | 560 to 719: two-column pillar grid |
| Tablet M | 768 × 1024 | iPad in portrait | Material medium; already the project's tablet QA width | 601 to 900: drawer, one-row header | 720 to 999: two-column grids, `Seções` menu |
| Tablet L | 1180 × 820 | iPad Air or 10th-generation iPad in landscape, touch | Material expanded class with a coarse pointer | ≤ 1180 tightened header, fixed sidebar, 44 px targets on touch | 1100 to 1599: header navigation, five-column steps |
| Desktop S | 1024 × 700 | Electron minimum window; small laptops | Documented Electron minimum | ≤ 1040 single-column grids, ≤ 1180 tightened header, fixed sidebar | 1000 to 1099: three-column grids, header navigation |
| Desktop M | 1536 × 864 | 1920 × 1080 laptops at 125% scaling | Second most used desktop resolution on StatCounter (August 2026); spot-check 1366 × 768 for short laptop screens | No rule above 1280; content capped at 1440 | 1100 to 1599 |
| Desktop L | 1920 × 1080 | Full HD monitors | Most used desktop resolution on StatCounter (August 2026) | No rule above 1280; content capped at 1440 | 1600 and above: page width 1440 |
| TV S | 960 × 540 | 1080p TV browser at a device pixel ratio of 2 | Android TV design canvas (960 × 540 dp) | 901 to 1040: fixed sidebar, single-column grids | below 1000: `Seções` menu, parallax off |
| TV M | 1280 × 720 | 720p TV, or 1080p TV at a device pixel ratio of 1.5 | HD canvas between the Android TV and tvOS references | ≤ 1280: two-column settings grid | 1100 to 1599 |
| TV L | 1920 × 1080 | 1080p TV at a device pixel ratio of 1; 4K TV at 2 | tvOS layout canvas (1920 × 1080 pt) | Same as Desktop L | 1600 and above |

The StatCounter figures are monthly snapshots read from search results in November 2026 and change every month; review the classes when the leading resolutions change. TV widths coincide with desktop widths on purpose: what makes a TV different is distance and input, not width, so the TV classes are tested with the TV checks below, not only with a resized window.

### Gaps in the current CSS

Status: **Open**. Recorded here and in [Open items](#open-items); the CSS is not changed by this document.

- **No TV adaptation.** No rule responds to viewing distance or remote input. At TV L the body text is 16 px, about 1.5% of the screen height, below the tvOS minimum of 23 pt on a 1080 pt canvas (about 2.1%); there is no 5% safe-area inset and no directional focus model.
- **No hover capability query.** Only `pointer: coarse` exists; there is no `hover: none` or `any-hover` rule, so a hover-only affordance would go unnoticed on touch and on TV.
- **No height-based rule.** Nothing adapts to short viewports (Desktop S at 700 px, 1366 × 768 laptops, TV S at 540 px, phones in landscape).
- **No safe-area handling.** Neither stylesheet uses `env(safe-area-inset-*)`; content can sit under a notch or home indicator in a full-screen mobile browser.
- **Tablet S boundary.** At exactly 600 px the `max-width: 600px` rules apply, so a 600 px tablet gets the phone layout. Decide whether that is intended.
- **Mobile S not yet measured.** The QA log measured 390 px and wider; 320 px has never been measured.

### TV and the 10-foot interface

Status: **Current** as validation rules; **Open** as implementation (see the gaps above). Talentum has no TV build; the TV classes cover a browser or casting on a television.

- **Distance.** Android TV assumes about 3 m (10 ft) between viewer and screen; Apple says people sit "often 8 feet or more" away. Text, targets and focus must read from there.
- **Minimum type size.** Apple's tvOS minimum is 23 pt and default 29 pt on a 1920 × 1080 pt canvas. Express it as a share of the viewport height so it holds at any density: body text at least about 2.7% of the viewport height and no text below about 2.1% (29 px and 23 px at TV L; 15 px and 12 px at TV S).
- **Safe area.** Keep primary content inside a 5% inset: Android TV uses 48 dp left and right and 27 dp top and bottom on 960 × 540; tvOS uses 80 pt left and right and 60 pt top and bottom on 1920 × 1080. Backgrounds may bleed to the edges.
- **Focus navigation.** People move with the D-pad (up, down, left, right, select). Every interactive element is reachable that way, focus moves predictably along rows and columns, the focused item is unmistakable from across the room, and focus never moves on its own. Leave space around focusable items so a focused item that grows does not cover its neighbours (HIG, Layout).
- **No hover, no pointer.** tvOS advises against showing a pointer; anything revealed by hover needs a focus or select equivalent.
- **Shared screen.** Android TV notes that the TV is a communal device. Financial values on a living-room screen are visible to everyone in the room; a TV layout must offer a way to hide amounts (**Open**).

### Pattern catalog: the best form per context

For each pattern: the form per context, what Talentum does today, and the reference it follows (P1). "Guideline" references are pages read for this section; "observed product" references describe the current public versions of widely used products and should be rechecked against the current app before being cited in a review.

**Navigation.**

- Desktop and Tablet L: persistent sidebar (Gmail and YouTube on the web; Apple HIG sidebars). **Current:** fixed sidebar above 900 px, collapsible to 76 px.
- Tablet S and M: the sidebar becomes an off-canvas drawer opened by a menu button (Luke Wroblewski's off-canvas pattern). **Current:** drawer at 900 px and below, `inert` when closed, closes with Esc, scrim and navigation.
- Mobile: Apple HIG and Material both recommend a bottom tab bar for three to five top-level destinations, visible on every section and with a text label on every tab (Instagram and YouTube use one). Talentum has seven destinations (`Início` plus six areas), more than a tab bar holds without an overflow tab, which the HIG advises against. **Current:** the drawer is kept on mobile. **Open:** decide whether a bottom bar with the four most used areas plus the drawer would serve better.
- TV: a top or left menu reached with the D-pad, with content in rows below (tvOS tab bar; Android TV browse and left-overlay templates; Netflix and YouTube TV apps). **Open:** not implemented.

**Filters and period selectors.**

- Desktop: filters visible inline beside the results as segmented controls, chips or selects, so each change shows its effect at once.
- Tablet and mobile: one labeled `Filtrar` button with a count of active filters opens a sheet (bottom sheet on phones, side drawer on tablets) with `Limpar` and an apply button that states the result, such as `Ver 42 lançamentos`. NN/g found that filters on a separate page hide their effect on the results; an overlay on the same screen keeps the context (Amazon and eBay mobile, cited by NN/g). One or two high-value filters can stay as a horizontally scrolling chip row above the list (Google Maps category chips).
- TV: filters as a focusable row at the top of the content.
- **Current:** the header uses segmented buttons that drop their text labels at 1180 px and below, keeping the icons; tabs scroll horizontally at 600 px and below. **Open:** no sheet-based filter pattern exists yet; build it the first time a screen has more than two filters.

**Tables and financial lists.**

- Desktop: a real table with frozen headers, amounts aligned by place value, monetary values that never wrap (Tables and financial lists).
- Tablet: keep the table but drop low-priority columns to an expandable row or a detail view (prioritized columns).
- Mobile: a list, one row per transaction: description and amount on the first line, date or category on the second, grouped under date headings. This is how mainstream banking apps (for example Nubank and Itaú) present a statement (observed product). NN/g: on phones, only about two columns of wordy content fit; horizontal scrolling is acceptable only for large comparison tables, with a visible cue and a frozen first column.
- TV: read-only summaries, not dense tables.
- **Current:** the category bar table lets its row labels wrap and its tracks take the full width at 720 px and below. **Open:** the transaction list does not exist yet; build it with the mobile pattern above from the start.

**Charts.**

- Desktop: the full chart with direct labels.
- Mobile: horizontal bars instead of vertical columns or pies, because long labels fit and values read left to right; fewer series; the legend replaced by direct labels; the exact value in text next to each bar.
- TV: the single most important figure large, with the chart secondary.
- **Current:** spending by category is already a horizontal bar table with values in text (`CategoryChart`). Data visualization tokens apply.

**Forms and inputs.**

- All contexts: a single column, with labels above the fields (Forms and filters).
- Mobile: the right keyboard for each field (`inputmode="decimal"` for amounts, `type="date"` or a date picker for dates, `autocomplete` where it applies); the primary button full width and close to the last field; no placeholder used as a label.
- TV: avoid text entry; offer choices instead.
- **Current:** the layout guide shows `inputMode="decimal"` with a `R$ 0,00` placeholder and a native date input.

**Dialogs and sheets.**

- Desktop: a centered modal for short, focused tasks.
- Mobile: a full-width or full-screen sheet with a visible close button at the top. The HIG uses a full-height sheet for content creation such as composing in Mail and Messages, and advises one sheet at a time; NN/g warns against stacked sheets and against relying on the grabber or swipe alone to close. Swipe down to dismiss is supported in addition to the button, and asks for confirmation when there are unsaved changes (HIG).
- TV: a center overlay for decisions only (Android TV center-overlay template).
- **Current:** dialogs take the full width at 600 px and below; drawers enter from their edge.

**Touch targets and gestures.**

- Coarse pointers: at least 44 px (**Current**, `pointer: coarse`). Never below 24 px anywhere (WCAG 2.5.8).
- Gestures do what users expect from mainstream apps: swipe to reveal actions on a list row (Apple Mail and Gmail), swipe down to dismiss a sheet, pull to refresh at the top of a list. A gesture is always a shortcut for a visible control, never the only path (HIG, Gestures). **Current:** Talentum defines no custom gestures.

**Hover-only interactions.**

- Never put information or actions behind hover alone. Tooltips also open on focus and on tap; row actions shown on hover on the desktop are always visible, or reachable from a menu button, on touch and TV.
- **Open:** there is no `hover: none` rule to enforce this (see the gaps above).

**Density.**

- Desktop: compact rows and more columns for scanning.
- Touch: taller rows and more spacing for targets.
- TV: few items per screen, large and spaced for focus growth (tvOS grids keep at least 40 pt between items).
- **Current:** density changes only through the coarse-pointer target rule.

**Typography scale.**

- Phone to desktop: the same type scale (Typography); reading width stays at 55–75 characters. Never scale body text below 16 px on phones.
- TV: scale relative to the viewport height as described under TV and the 10-foot interface (**Open**).

### Reference products by pattern

| Pattern | Reference products or guidelines | Basis |
| --- | --- | --- |
| Bottom tab bar on phones, three to five labeled destinations | Apple HIG tab bars; Material navigation bar; Instagram, YouTube | Guideline; observed product |
| Sidebar on wide screens that collapses or becomes a drawer | Apple HIG (tab bar adapts to sidebar); Material navigation rail; Gmail and YouTube on the web | Guideline; observed product |
| Off-canvas drawer for secondary navigation | Luke Wroblewski, multi-device layout patterns | Pattern literature |
| Filters in an overlay on the results screen | NN/g mobile faceted search (Amazon, eBay) | Research |
| Horizontally scrolling filter chips | Google Maps category chips | Observed product |
| Bottom sheet for details and short tasks | Apple HIG sheets; NN/g bottom sheets; Google Maps place details | Guideline; research; observed product |
| Transaction list grouped by date instead of a table | Nubank and Itaú statement screens | Observed product |
| Swipe on a list row to reveal actions | Apple Mail; Gmail | Observed product |
| Browse rows navigated with the D-pad | Android TV browse template; Netflix and YouTube TV apps | Guideline; observed product |
| Center overlay on TV for decisions | Android TV center-overlay template | Guideline |

### Test procedure

For every interface change:

1. List the screens and states the change touches (empty, loading, error, filled, overlays open).
2. For each of the twelve classes, in the light theme and then in the dark theme, render each screen and state. Use the browser's device emulation or the taste-skill inspector for widths and heights; for TV classes, also navigate with the arrow keys and Enter only, from at least 2 m from the screen or at an equivalent zoom-out.
3. At each class and theme, check:
   - **Task completion:** the main task of the screen can be completed.
   - **Pattern fit:** the pattern used is the one the catalog assigns to the context, or the deviation is justified (P1).
   - **Hierarchy:** the most important information is still first and most prominent (P29).
   - **Reachability:** every control can be reached by touch on touch classes, by keyboard everywhere, and by D-pad on TV classes; nothing depends on hover.
   - **No horizontal scroll:** the document and the main area do not scroll sideways (data tables excepted, P28). Do not rely on `overflow-x: hidden` (it hides leaks).
   - **Legibility:** no text below 12 px (or below the TV minimum on TV classes); monetary values do not wrap; contrast holds.
   - **Focus order:** follows the visual order; focus is visible and not obscured (P27).
   - **Illustrations and states:** the theme-specific illustration renders in each theme.
4. Record the result in the table below, attach evidence in ignored directories only (Visual QA process), and fix or report every failure.

Results table template, to copy into reports:

```text
| Class      | Size        | Light theme       | Dark theme        | Notes |
| ---        | ---         | ---               | ---               | ---   |
| Mobile S   | 320 × 568   | Pass / Fail: ...  | Pass / Fail: ...  |       |
| Mobile M   | 390 × 844   |                   |                   |       |
| Mobile L   | 414 × 896   |                   |                   |       |
| Tablet S   | 600 × 960   |                   |                   |       |
| Tablet M   | 768 × 1024  |                   |                   |       |
| Tablet L   | 1180 × 820  |                   |                   |       |
| Desktop S  | 1024 × 700  |                   |                   |       |
| Desktop M  | 1536 × 864  |                   |                   |       |
| Desktop L  | 1920 × 1080 |                   |                   |       |
| TV S       | 960 × 540   |                   |                   |       |
| TV M       | 1280 × 720  |                   |                   |       |
| TV L       | 1920 × 1080 |                   |                   |       |
```

The landing page is light-only today, so its dark-theme column is recorded as "not applicable (light-only, see Open items)" until that decision is made.

## Geometry and surfaces

Status: **Current**.

### Border radius

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
```

- `4px` for compact controls, tags and table elements.
- `6px` for buttons, inputs and standard cards.
- `8px` for large panels, dialogs and prominent containers.
- Avoid `0px` corners, which feel overly mechanical.
- Avoid radii above `12px`, pill-shaped containers and playful bubble forms unless required for a compact status badge.

### Borders and depth

Favor subtle borders and tonal separation over large shadows. Surfaces should feel matte and materially grounded, inspired by parchment, polished wood and leather-bound covers without imitating their textures literally.

```css
--shadow-sm: 0 1px 2px rgb(26 17 10 / 8%);
--shadow-md: 0 8px 24px rgb(26 17 10 / 10%); /* dark: 0 8px 24px rgb(0 0 0 / 34%) */
```

Do not use glossy gradients, glassmorphism, neon glows or heavy drop shadows.

### Landing page surfaces

The landing page separates sections and surfaces by a step in tone, not by 1 px rules or outlined boxes. Headings carry no label above them, ordered lists carry no decorative numbering, all-caps letter-spaced labels are not used, no surface casts a shadow at rest, and informative cards that are not links do not lift on hover.

## Iconography and imagery

### Icon family

Status: **Current**. Interface icons use **Bootstrap Icons** (`bootstrap-icons` package) everywhere (CLAUDE.md rule); any exception must be documented here.

- Use the single icon family with consistent stroke weight and optical size.
- Prefer simple line icons that reinforce actions or categories.
- Do not use icons as the only label for unfamiliar actions.

The local app and the Electron renderer load the Bootstrap Icons font stylesheet (`bootstrap-icons/font/bootstrap-icons.css`, imported in `src/app/layout.tsx`).

### Icon delivery on the landing page

The landing page in `apps/web` renders Bootstrap Icons as inline SVG instead of the icon font. `scripts/gerar-icones-lp.mjs` (`pnpm lp:icones`) scans the LP components for every `bi-<name>` in use and copies only those icons from the official `bootstrap-icons` package (MIT license) into `apps/web/src/components/lp/icons.tsx`; it rejects any icon whose `viewBox` is not `0 0 16 16`. `apps/web/src/components/lp/icon.tsx` wraps each one in `<i class="bi">`, so size and color still follow `font-size` and `color`. The family is unchanged; only the delivery is lighter (42 icons at the time of writing, instead of a 131 KB font and a stylesheet with over two thousand classes). Run `pnpm lp:icones` after using a new icon; `tests/web-seo.test.mjs` fails when one is missing.

### Imagery

- Use illustrations or textures only when they add meaning; avoid decorative stock imagery. The landing page has no photography or video: its engravings were drawn for the project.
- Convert every photographic or illustrative raster image intended for the landing page to WebP before adding it to the production bundle.
- Export responsive sizes and use the smallest dimensions and quality setting that preserve the intended appearance (for example, the 640 px screenshot variants from `pnpm lp:telas`).
- Keep source files outside the runtime asset directory; production code references the optimized WebP derivative.
- Use SVG for scalable interface symbols and ICO for favicons when those formats are more appropriate.

## Motion

Status: **Current**.

Motion should confirm cause and effect, not decorate the interface.

- Keep micro-interactions between `120ms` and `200ms`.
- Keep panel transitions between `200ms` and `300ms`.
- Prefer subtle opacity and position changes.
- Avoid bounce, elastic movement, parallax and continuous ambient animation, with the single landing page exception below.
- Respect `prefers-reduced-motion` and ensure the interface remains understandable without animation.

### Local app motion

Implemented in `src/app/globals.css`:

| Element | Motion |
| --- | --- |
| Buttons (`.btn`, `.icon-button`, `.close-button`, `.sidebar-import`, `.sidebar-account`) | Color transitions at 160 ms; on press, `transform: scale(0.97)` over 100 ms so the button responds on touch without waiting for the click |
| Overlay scrim | Fade in, 200 ms ease-out |
| Dialog | Emerges in place (8 px rise, 0.98 scale), 240 ms `cubic-bezier(0.16, 1, 0.3, 1)` |
| Drawer | Enters from its edge (24 px), 260 ms `cubic-bezier(0.16, 1, 0.3, 1)` |

Under `prefers-reduced-motion: reduce`, all transitions and animations are disabled globally and the press scale is removed.

### Landing page motion

- Reveal on scroll: blocks reveal once and stay revealed; the server HTML is visible and only blocks outside the viewport are hidden after hydration, so content is never invisible without JavaScript. A blur variant (`.lp-reveal-blur`) exists for image blocks.
- The hero renders statically (no reveal) so it does not delay LCP.
- No continuous ambient animation (the `Role para ler` cue does not loop), no pointer-following radial glow and no grain texture.
- Under `prefers-reduced-motion: reduce`, transitions and animations inside `.lp-root` are disabled, reveals are shown immediately, and parallax and tilt are reset to `transform: none`.

### Documented exception: landing page parallax

Status: **Current** exception, LP-only.

The general rule above forbids parallax, but the landing page deliberately uses it on its engravings, and the 25 October 2026 polish kept it on purpose:

- `Parallax` in `apps/web/src/components/lp/motion.tsx` sets `--lp-shift` on `.lp-parallax` from the block's position relative to the viewport (`speed` 0.14 by default), clamped to ±72 px, updated once per animation frame and only when the block is within 400 px of the viewport. It does nothing when the user prefers reduced motion.
- `PointerScene` publishes the pointer position as `--lp-tilt-x/y` and `--lp-drift-x/y`; the hero engraving combines the scroll shift with a small pointer drift (220 ms transition).
- In `apps/web/src/styles/lp.css`, parallax is turned off (`transform: none`) below 1000 px, where the columns stack, because the shift pushed the engraving over the text of the same section; it is also off under reduced motion.

The exception does not extend to the local app or Electron renderer, which use no parallax. Confirming this exception is listed under Open items.

## Components and layout patterns

Status: **Current** (guidance).

### Navigation

- The primary navigation (sidebar) uses Ebony as a dark structural anchor in both themes and shows the mark with symbol and name (`icon-talentum-dark.svg`).
- Keep labels concise and set them in Montserrat.
- Indicate the active location with Classical Amber and at least one non-color cue.
- Keep navigation placement stable across views.

### Header and window controls

The profile and the Electron window controls share the header. Window controls are intentionally compact and talk to the Electron main process only through the isolated preload bridge (see the Electron layer in [ARCHITECTURE.md](ARCHITECTURE.md)). They remain visible in browser development previews wider than 900 px so their proportions can be reviewed, but only the Electron preload bridge makes them operational. The theme selector has its own width, arrow and hit area so the native control does not overlap it.

### Buttons

- Use Classical Amber only for the primary action on a view.
- Use outlined or text buttons for secondary and tertiary actions.
- Use destructive styling only for destructive actions; never use the brand accent as an error color.
- Provide hover, focus, active, disabled and loading states.
- Buttons respond on touch (see Motion); on the landing page, arrows, tabs and carousel dots have a minimum target of 24 px (dots) to 44 px (buttons).

### Cards and panels

- Use cards only to group information that belongs together.
- Prefer a light surface, a fine Ebony-tinted border and minimal elevation.
- Use internal spacing rather than decorative separators whenever possible.
- Avoid nesting several card layers.
- Cards and images without a destination do not lift on hover.

### Tables and financial lists

- Optimize for scanning: align labels consistently and align numbers by place value.
- Keep headers visible for long datasets when helpful.
- Use Graphite (`--ink2`) for supporting metadata and Ebony (`--ink`) for primary values.
- Reserve Amber for selected rows, priority markers or a single important state.
- Monetary values never wrap.
- Provide empty, loading, error and no-results states.

### Forms and filters

- Place labels above controls for predictable scanning.
- Keep related fields together and separate unrelated sections with spacing.
- Explain validation errors next to the affected field.
- Use borders, icons and text in addition to color for focus and error states.

### Status indicators

Every financial or operational status must have a concise text label, a stable semantic meaning, an accessible visual treatment and a documented mapping to a design token. Do not assign status colors ad hoc in individual screens.

### Error strip

An in-component error strip (`.error-strip` in `globals.css`) shows a failure inside the affected component rather than replacing the page; see the dashboard rules in [PRODUCT.md](PRODUCT.md).

## State illustrations

Status: **Current**. This is the map of every place in the local app and the landing page that can appear without information, surveyed in the manual test of 26 October 2026, with the flat illustration for each.

### Rules

1. "None" appears only when the backend has confirmed zero (dashboard rule R-29 in [PRODUCT.md](PRODUCT.md)). Area screens query `GET /api/local-summary` before asserting absence; showing zeros without backend confirmation is forbidden.
2. Every empty state has a sentence that explains the absence and, when one exists, an action.
3. An error never shows a value or technical detail; it offers a retry or a way back.
4. The illustration is an accessory: the text stands on its own and the image has `alt=""`.

### Pipeline

- **Origin:** flat illustrations generated with Gemini and supplied by the maintainer as 1024 × 1024 JPEGs. The JPEGs stay outside Git in `design/estados-fonte/` (ignored), because they are not needed to build or run.
- **Vector masters:** `design/estados-vetor/<key>.svg` (20 files), vectorized with a median filter against JPEG noise, separation into flat color layers and Bézier tracing (potrace), stacked from lightest to darkest color so no gaps open. They are the source of truth. New illustrations enter as masters in `design/estados-vetor/` with the paper in `#F4F1EA`, and the variants are always produced by the script.
- **Variants:** `pnpm estados:gerar` (`scripts/gerar-estados.mjs`) generates `public/estados/claro/` and `public/estados/escuro/` (20 files each) and, for the landing page keys, `apps/web/public/estados/` (`erro-tela`, `nao-encontrada`, `sem-versoes`). The plate is removed and the paper areas take the exact color of the surface where the illustration appears (`#FFFDF8` light, `#2A2622` dark, `#F4F1EA` on the LP), so it looks integrated. In dark, neutrals invert to the warm tone of light text and browns rise in luminance; light neutrals become muted cream instead of disappearing into the background.
- **Behavior:** `StateArt` (`src/components/state-art.tsx`) renders both variants and CSS shows only the one for the active theme (`.state-art-escuro` hidden by default, `.state-art-claro` hidden under `html.dark`), with no JavaScript needed and no visible swap on load. Sizes: `sm` 112 px, `lg` 200 px, and 128 px for default and `lg` at 600 px and below. The image is decorative (`alt=""`), cannot be dragged (`draggable={false}`, `dragstart` cancelled, `-webkit-user-drag: none`) or selected (`user-select: none`), and lets clicks pass through (`pointer-events: none`). The landing page uses its own light-only component, `apps/web/src/components/lp/state-art.tsx`, reading `/estados/<key>.svg`.
- **Validation:** always in both themes (CLAUDE.md rule). Tests in `tests/regression/state-art.test.mjs`.
- **Integrity (27 October 2026):** all illustrations were reviewed in both themes against the originals. The background is removed only where the color is practically that of the paper, so light objects without an outline are not swallowed (the card in `sem-cartoes` and the sheet in `importar-extrato` used to come out clipped). The sheet in `importar-extrato` was redrawn in the master, because its cream was indistinguishable from the original's paper. The ground in `nao-encontrada`, cut straight by the edge of the generated image, closes as a half-moon: elliptical clip, sand fill and outline. Tests in `tests/regression/state-art-integrity.test.mjs`.
- `nova-versao` was drawn directly as a vector for the planned update notice (see [PRODUCT.md](PRODUCT.md)). It is generated in both themes but not yet used by any component and is not in the `StateArtName` union (**Planned**).

### Map

| Place | Route or component | When it appears | Illustration key |
| --- | --- | --- | --- |
| Empty financial base | `/dashboard` · `EmptyState` | No profile or no stored data | `base-vazia` |
| Indicators unavailable | `/dashboard` · `ErrorState` and area screens | The local database query failed | `falha-consulta` |
| Empty spending by category | `/dashboard` · `CategoryChart` | Backend confirmed zero spending in the period | `sem-gastos` |
| Transactions | `/extratos` | No stored transaction | `sem-lancamentos` |
| Cards | `/extratos/cartoes` and detail | No card; nonexistent ID | `sem-cartoes` |
| Import | `/extratos/importar`, batch and import dialog | No file; nonexistent batch | `importar-extrato` |
| Obligations | `/extratos/recorrencias` | No open obligation | `sem-obrigacoes` |
| Reconciliation | `/conciliacao` | No pending transaction | `nada-a-conciliar` |
| Statement check | `/conciliacao/faturas` | No statement | `sem-faturas` |
| Net worth and contributions | `/patrimonio`, `/patrimonio/aportes` | No registered asset | `sem-patrimonio` |
| Goals | `/patrimonio/metas` and detail | No goal; nonexistent ID | `sem-metas` |
| News | `/invest` and article | Integration not configured; nonexistent ID | `sem-noticias` |
| History | `/historico` | No event | `historico-vazio` |
| Profile | `/perfil` | Onboarding not completed | `perfil-vazio` |
| Notifications | Notifications drawer | No alert generated | `sem-notificacoes` |
| Accounts | Account selector dialog | No account | `sem-contas` |
| Page not found | `src/app/not-found.tsx`, `apps/web/src/app/not-found.tsx` | Nonexistent route | `nao-encontrada` |
| Screen error | `src/app/error.tsx`, `apps/web/src/app/error.tsx` | Rendering failure | `erro-tela` |
| Downloads | `/downloads` on the LP | No published version | `sem-versoes` |
| New version notice | Not yet rendered | Planned update notice | `nova-versao` (**Planned**) |

### Illustration direction

Flat, with no gradient, shadow or texture; a warm palette consistent with the brand; geometric strokes; no text, financial data, real person or third-party logo.

## Accessibility

Status: **Current** (requirements).

On the landing page the native scrollbar is hidden, with no track, buttons or arrows (`apps/web/src/styles/base.css`). A fixed Ebony indicator (`.lp-scroll-position`) represents the position and size of the viewport proportionally; scrolling by mouse, touch and keyboard stays native.

- Meet WCAG 2.2 AA contrast requirements for text and interactive elements. Validate every final foreground and background combination; on the LP use `--lp-amber-text` for small Amber text and `--lp-amber-strong` for Amber buttons with light text.
- Maintain visible keyboard focus using a treatment distinct from the component border (the global `:focus-visible` Amber outline).
- Provide complete keyboard navigation and a logical focus order. The mobile drawer traps focus while open and is `inert` while closed.
- Use semantic HTML before adding ARIA attributes.
- Provide text alternatives for meaningful images and accessible names for controls; decorative state illustrations use `alt=""`.
- Do not rely on color, position or motion alone to communicate information.
- Support text zoom up to 200% and responsive reflow without loss of functionality.
- Respect `prefers-reduced-motion` and `prefers-contrast: more`.
- Touch targets are at least 44 px on coarse pointers.

## Visual QA process

Status: **Current**.

Visual QA records reviews executed on the running interface. It does not replace accessibility testing, usability testing with real users, or validation of the packaged Electron build.

### Both themes, always

Every layout change is validated in the light theme **and** in the dark theme, never in only one (CLAUDE.md rule). Render both, compare contrast, legibility, borders, illustrations and states, and report the result for each theme. Theme-specific assets, such as the state illustrations, must exist for both themes and be checked in both. The landing page is currently light-only, so its checks cover the light theme; see Open items.

### Method

- **Widths:** check at least 390 px (phone), 768 px (tablet), 1024 px (Electron minimum), 1280 px, 1440 px and 1920 px. Measure elements outside the visible area, header height, content width and text below 12 px. Do not rely on `overflow-x: hidden` on containers: it hides leaks.
- **Overlays:** open dialogs and drawers and measure them after their entry animation finishes.
- **Console:** no errors or warnings during the reviewed flows.
- **Inspector:** the taste-skill inspector at `.claude/skills/taste-skill/scripts/inspect.mjs` opens a production build in real Chrome via CDP at 390, 768, 1280, 1440 and 1920 px. Its screenshots go to `.taste-skill/`, which is ignored by Git. Design skills (Impeccable, taste-skill, `emil-design-eng`) are described in [BEST_PRACTICES.md](BEST_PRACTICES.md); this document prevails over the skills on palette and typography.
- **Performance:** Lighthouse with the default mobile emulation and the desktop preset.
- **Evidence:** working screenshots stay in ignored directories (for example `temp/ui-audit/` or `.taste-skill/`) and are never committed. Screenshots must not contain real personal or financial data.
- **Regression tests:** layout rules that were fixed get a test in `tests/regression/` (for example `responsive.test.mjs`, `state-art.test.mjs`, `state-art-integrity.test.mjs`, `brand-vectors.test.mjs`, `ui-shell.test.mjs`, `error-pages.test.mjs`).

## Visual QA log

Dated entries, oldest first. Entries are historical records of what was observed at that date; later changes are noted inline.

### Historical: desktop layout QA against the HTML prototype (before 5 September 2026)

Status: **historical**, superseded by the later entries. Kept only for what is unique to it.

- Source of visual truth: an HTML desktop prototype supplied as a zip archive (not in the repository). Implementation: the local Next.js app on port 3000. Target viewport 1440 × 900 CSS px; documented minimum 1024 × 700. Light theme, synthetic data.
- The shell, prototype routes, overlays, synthetic data and interactive states were converted to Next.js/React and compared structurally (tokens, routes, copy, components, states and interactions), without claiming visual fidelity. `pnpm typecheck` and `pnpm build` passed.
- Rendered full-view and region comparisons were **blocked** because the integrated browser was unavailable in that session. Findings (P2): no rendered evidence of the dashboard, navigation, modals, dark theme or minimum viewport; primary interactions and the console could not be exercised.
- Final result: blocked. The rendered checks it lacked were covered by the audits below.

### Audit of 5 September 2026

Scope: walked in Chrome, end to end, the routes `/`, `/extratos`, `/extratos/cartoes`, `/extratos/cartoes/aurora`, `/extratos/importar`, `/extratos/importar/lote-demo`, `/extratos/recorrencias`, `/conciliacao`, `/conciliacao/faturas`, `/patrimonio`, `/patrimonio/aportes`, `/patrimonio/metas`, `/patrimonio/metas/viagem`, `/invest`, `/invest/fundos-logistica`, `/historico`, `/perfil`, `/perfil/privacidade`, `/configuracoes` and `/onboarding`.

Adjustments made:

- Montserrat became the interface font and Playfair Display the display font, with no external loading.
- The sidebar brand again shows symbol and name, always with `icon-talentum-dark.svg` on the dark sidebar.
- Profile and window controls were organized in the same header.
- Cards received a consistent inner padding scale: 16 px compact, 18 px standard, 20 px highlighted.
- Native heading and paragraph margins were normalized; separation now belongs to components.
- Inner headers stopped duplicating padding and borders inside already-padded cards.
- Indicator, net worth and settings grids were reorganized to keep hierarchy and legibility at smaller widths.
- Profile missions and achievements were aligned as vertical lists.
- The card detail route gained its own summary and transactions.
- The contextual title of `/onboarding` was corrected to `Primeiro acesso`.
- The root route was named `Dashboard` and started with zeroed values and clear calls to onboarding or import.
- The theme selector received its own width, arrow and hit area to avoid overlapping the native control.

Observed result: none of the 20 routes showed horizontal scrolling in the document or main area; the reviewed flows emitted no console errors or warnings; responsive behavior was inspected at 1536, 1180 and 1024 px; the light and dark themes preserved contrast and hierarchy. Working screenshots stayed in `temp/ui-audit/`, ignored by Git.

> **Superseded note (20 November 2026):** the root-route and zero-value items above no longer describe the code. `/` now renders the `Início` home page (`HomePage`), the dashboard lives at `/dashboard`, and showing zeroed values without backend confirmation is forbidden (see State illustrations rule 1 and the dashboard rules in [PRODUCT.md](PRODUCT.md)). The `aurora`, `lote-demo`, `viagem` and `fundos-logistica` IDs were demo data of that time.

### Landing page polish, 25 October 2026

Method: refinement of the LP in `apps/web`, guided by the Impeccable (`polish`, `adapt`), taste-skill and Emil Kowalski (`emil-design-eng`) skills. It was refinement, not redesign: identity, copy and behavior were preserved, and this design system (then the branding guide) prevailed over the skills on palette, typography and the Amber second line of the title. Responsiveness was measured with the taste-skill inspector (`.claude/skills/taste-skill/scripts/inspect.mjs`) on the production build in real Chrome via CDP at 390, 768, 1280, 1440 and 1920 px; screenshots went to `.taste-skill/` (ignored). The Chrome extension was not enabled in the session, so the inspector used installed Chrome in headless mode.

Defects fixed:

- Header: on phone and tablet the navigation took two fixed rows (about 170 px). Below 1000 px it becomes the collapsible `Seções` menu, and the repository link becomes an icon below 560 px.
- Hero: the engraving rendered at one third of its size because the parallax wrapper had no width. The title now takes the full width and fits on two lines from 768 to 1920 px.
- Hero: the title and text started invisible inside the revealer, delaying LCP. The hero now renders statically.
- Grids: four items became three plus one on desktop and three became two plus one on tablet. Columns are now explicit per width range.
- Five steps: five narrow columns squeezed 13 px text. Below 1100 px they become rows with the icon on the left.
- Reading: running text of 13 to 14 px went up to 15 to 16 px; no reading text is below 13 px.
- Phone: parallax pushed the hourglass over the quote of the same section, and the risk-free balance (`Saldo Livre de Risco`) table broke monetary values. Parallax is turned off when columns stack, and values do not wrap.
- Navigation: `O problema` showed as active while still in the hero.
- Affordance: cards and engravings without a destination lifted on hover. Hover was removed from them; buttons gained touch response.
- Reveal: blocks collapsed when leaving the screen and replayed the entrance on every scroll, and were invisible without JavaScript. They now reveal once and always appear when there is no script.
- Touch: carousel arrows, tabs and dots gained a minimum area of 24 px (dots) to 44 px (buttons).
- Ornaments forbidden by the skills and the branding rules were removed: labels above headings, 01 to 05 numbering, letter-spaced all-caps labels, a radial glow following the pointer, grain texture over the page, the continuous `Role para ler` animation and shadows at rest. 1 px outlines were replaced by tone steps.

Performance and search: Lighthouse 13.5.0 (the same engine as PageSpeed Insights), default mobile emulation and desktop preset. The public PageSpeed Insights API had exhausted its daily quota (HTTP 429) at the time.

| Measurement | Performance | Accessibility | Best practices | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| Published, mobile | 89 | 97 | 100 | 92 | 3.2 s | 0.001 |
| Published, desktop | 100 | 97 | 100 | 92 | 0.7 s | 0.028 |
| Polished, mobile | 94 | 100 | 100 | 100 | 2.9 s | 0 |
| Polished, desktop | 100 | 100 | 100 | 100 | 0.7 s | 0 |

The polished version was measured on a local `next start`, without the hosting CDN; the published one was measured on the public domain. What changed the result: metadata always in `<head>` (`htmlLimitedBots`), CSS inlined in the HTML (`experimental.inlineCss`), Bootstrap Icons as inline SVG instead of the 131 KB font, fallback fonts with adjusted metrics (zero CLS), 640 px screenshot variants in `srcset`, and an underline on the in-sentence link.

Later fix, invisible content in development: under `next dev`, the CSP blocked the `eval` React uses in development, the page did not hydrate and the 78 blocks with entrance animation stayed invisible. The policy now allows `'unsafe-eval'` and `ws:` only in development (see [SECURITY.md](SECURITY.md)), and the animation was inverted: the HTML starts visible and only off-screen blocks are hidden after hydration. Verified in Chrome via CDP: zero hidden blocks and no console errors after scrolling; with the server HTML, no block ships hidden. In the same investigation, another local project occupying the port on IPv6 answered on the LP's development URL; see the shared-ports guidance in [BEST_PRACTICES.md](BEST_PRACTICES.md).

Accepted pending items:

- The hero title takes four lines at 390 px. It is the brand motto and was not shortened.
- There is no photography or video: stock imagery is rejected, and the engravings were drawn for the project.
- The caption of the `Início` screenshot says the indicators show zero. The image predates the current dashboard, which shows an empty state. Replacing the screenshot and caption depends on a maintainer decision (see Open items).
- 43 KB of unused JavaScript and 12 KB of legacy JavaScript remain, coming from the framework.

### Local app responsiveness, 26 October 2026

Measured in Chrome through iframes at 390, 768, 1280, 1440 and 1920 px on nine routes, counting elements outside the visible area, header height, content width and text below 12 px. The first measurement revealed that `.content` used `overflow-x: hidden`, which hid leaks from the previous sweep, done only at 1440 px.

| Width | Before | After |
| --- | --- | --- |
| 390 px | 248 px sidebar, 89 px of content, header up to 442 px, controls off-screen | Closed drawer, 339 to 358 px of content, 84 px header, nothing off-screen |
| 768 px | Sidebar taking a third, header on three rows (171 px) | Drawer, content of 705 to 724 px, 84 px header |
| 1280, 1440 and 1920 px | No defects; content capped at 1440 px | Unchanged |

Also fixed: the `Conta ativa` label was 9 px at every width and went to 12 px. The drawer was verified opening from the menu button, with focus trapped inside it, and closing via the scrim, Esc and navigation.

Full measurement (second round): the 22 app routes and the four dialogs and drawers opened from `Início`, at 390, 768, 1024, 1280, 1440 and 1920 px (156 measurements). Nothing leaks from the visible area. The only new defect was the header at 1024 px, the Electron minimum, which wrapped to two rows (132 px) with the fixed sidebar; below 1180 px it now fits on one row. The notifications drawer appeared to leak at 390 and 768 px, but a repeated measurement after the entry animation showed it takes exactly the screen width.

### State illustrations in both themes, 26 October 2026

Verified in Chrome on `/patrimonio/metas`, a nonexistent route and the notifications drawer, in the light and dark themes. Without the plate and with the paper in the surface color, the illustrations sit on the card without forming a square in either theme. The image does not start a drag (`dragstart` cancelled), does not enter selection and does not intercept clicks. The integrity review of 27 October 2026 is described under State illustrations.

## Design review checklist

- [ ] The screen has one clear primary task.
- [ ] The composition follows the 60–30–10 color principle.
- [ ] Amber is restricted to meaningful emphasis and action.
- [ ] Playfair Display is limited to display hierarchy.
- [ ] Montserrat remains readable in operational content.
- [ ] Layout elements align to the shared grid and spacing scale.
- [ ] Border radii remain between `4px` and `8px` in normal components.
- [ ] Shadows and decoration are restrained and matte.
- [ ] Loading, empty, error, disabled and success states are defined.
- [ ] Empty states assert absence only after backend confirmation.
- [ ] Icons come from Bootstrap Icons (on the LP, `pnpm lp:icones` was run).
- [ ] Keyboard, contrast, zoom and reduced-motion behavior were verified.
- [ ] The change was rendered and checked in the light theme and in the dark theme.
- [ ] The interface prioritizes financial information over decoration.

## Governance

Status: **Current**.

- Treat the tokens and rules in this document as the default source of truth.
- Record exceptions here with a reason and validate them during design review (current exceptions: `--font-mono` in the layout guide, LP parallax).
- Add new colors, typography styles, spacing values and components centrally, as tokens in `src/app/globals.css` (and the mirrored `--lp-*` token in `apps/web/src/styles/lp.css` when the LP needs it), instead of introducing one-off values.
- Update this document whenever the visual system changes, and keep implementation tokens synchronized with the documented values.
- Regenerate derived assets with their scripts (`pnpm marca:gerar`, `pnpm estados:gerar`, `pnpm lp:icones`, `pnpm lp:telas`, `pnpm lp:lut`) instead of editing outputs by hand.

## Open items

- **Open — LP parallax exception.** The motion rule forbids parallax, but the landing page uses scroll parallax and pointer drift/tilt (`apps/web/src/components/lp/motion.tsx`, `lp.css`), disabled when columns stack and under reduced motion. It is recorded here as a Current LP-only exception; the maintainer should confirm it (or remove the parallax) and, if kept, record the rationale in an ADR.
- **Open — semantic status token ratification.** `--ok`, `--warn`, `--err`, `--info` and their soft backgrounds exist in both themes, but the `globals.css` header still calls them proposals pending contrast validation. Validate all combinations in both themes and then mark them normative.
- **Open — categorical chart palette.** The eight-slot categorical palette is not ratified (dashboard decision in [PRODUCT.md](PRODUCT.md)).
- **Open — LP hover token divergence.** `--lp-amber-hover` is `#8a5629` while the app's `--amber-hover` is `#9f6533`, although `lp.css` says the tokens mirror each other. Decide whether the divergence is intended (AA on the LP) and align or document it.
- **Open — LP dark theme.** The landing page is light-only, while the interface-validation rule requires both themes. Decide whether the LP gets a dark theme or is formally exempt.
- **Open — orphan stylesheet.** `src/app/styles.css` is tracked but not imported anywhere; it defines unrelated tokens (`--background`, `--foreground`, `--accent`, `--muted`) and styles (system-ui font, 1.25rem radius, uppercase eyebrow) that contradict this system. Confirm it is dead and remove it, or document its purpose.
- **Open — LP `Início` screenshot caption.** The LP screenshot and caption still describe indicators showing zero, which no longer matches the dashboard's empty state; replacement awaits a maintainer decision.
- **Planned — `nova-versao` illustration.** Generated in both themes for the planned update notice but not used by any component yet.
