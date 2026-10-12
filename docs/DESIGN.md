# PulsePoint design system

PulsePoint turns developer conversations into a weekly intelligence briefing. The interface should feel like a carefully edited document on a desk, not a wall of widgets: calm, precise, and honest about what is known.

## Principles

1. **The brief is a document.** The workspace is an ivory sheet laid on a slate frame. The Friday brief reads top to bottom like an editorial page: headline, summary, the one change that matters most, then supporting analysis.
2. **Numbers by code, words by AI, and you can always tell which is which.** Violet is reserved for interactive controls and AI interpretation. Every AI passage carries the "AI reading" mark; source material is never tinted violet.
3. **Colour carries meaning, never decoration.** More complaints is bad news, so *rising* is vermilion, not green. Colour is always paired with an icon or word.
4. **One focal point per screen.** The single dark charcoal panel marks what matters most (the lead signal on the brief, the run log on System health). Never more than one dark panel per screen.
5. **Precision over ornament.** 1px borders, controlled radii, almost no shadow, no gradients. Premium comes from alignment, spacing and typography.

## Reference synthesis

| Reference | Taken | Left behind |
|---|---|---|
| Circle | Workspace sheet inset on a muted slate-teal frame; navigation lives on the frame; compact analytical panels | Illustrations, peach gradient hero |
| DoDo | Warm ivory surfaces, generous grouping, one high-contrast dark card for emphasis, restrained accent for primary actions | Lime accent everywhere, playful illustrations, greeting headline |
| Crextio | Large light-weight numerals, thin rounded "lollipop" bars, segmented and hatched progress bars, charcoal focus panel, pill controls | Yellow wash background, photo cards, calendar widgets |
| Verification stats | Bold confident page titles, thin borders, mostly monochrome base with soft teal, rounded data marks | Lilac/mint everywhere, decorative 3D artwork |

## Tokens (`tailwind.config.ts`)

### Colour

| Token | Value | Use |
|---|---|---|
| `frame` | `#1E2A30` (2: `#273740`, 3: `#33454E`) | App frame, sidebar |
| `frame-text` / `frame-muted` | `#D5DDDC` / `#8FA2A4` | Text on the frame |
| `paper` | `#F5F3EE` | The sheet (page background) |
| `panel` | `#FFFEFC` | Panels and cards on the sheet |
| `sunk` | `#EFECE5` | Recessed areas, neutral tags, empty tracks |
| `line` / `line-strong` | `#E5E1D8` / `#D3CEC2` | 1px borders and dividers |
| `ink` / `ink-2` | `#17191E` / `#3B4049` | Primary and secondary text |
| `ink-muted` / `ink-faint` | `#5A5F68` / `#666B74` | Metadata. Both pass 4.5:1 on panel and paper |
| `coal` (2, 3, text, muted) | `#1B1D21` … | The single focal dark panel; primary buttons |
| `violet` / `violet-ink` / `violet-soft` | `#5B4FE0` / `#4337C9` / `#ECE9FD` | Interactive elements, links, AI interpretation |
| `teal` / `teal-soft` / `teal-ink` | `#7FA6A2` / `#E3EEEC` / `#3F6B67` | Neutral data (volume, history, previous periods) |
| `rise` (text) / `rise-fill` | `#B03D22` / `#C4472A` | Rising pain points, unresolved, failures |
| `fall` (text) / `fall-fill` | `#25684F` / `#2E7D63` | Easing pain points, success |
| `fresh` (text) / `fresh-fill` | `#7E5306` / `#E3B33E` | Newly observed, warnings, backfill pending |

Text variants are darkened to meet WCAG AA on their soft backgrounds (all ≥ 5:1). Fill variants are for bars, dots and marks only (≥ 3:1 non-text contrast).

### Type
Geist Sans, loaded locally via the `geist` package. Tabular figures throughout (`font-feature-settings: 'tnum'`).

| Role | Size / weight |
|---|---|
| Brief headline | 30 → 38 px, 600, −0.025em, max 26ch |
| Page title | 34 px, 600, −0.025em |
| Key metric numerals | 40 px (lead panel 56 px), **300**, −0.03em |
| Panel heading (`.h-panel`) | 15 px, 600 |
| Body | 15–16 px, line-height 1.6 |
| Table / list text | 14 px |
| Metadata (`.meta`) | 12–13 px, `ink-muted` |

Sentence case everywhere. No all-caps eyebrows.

### Space, shape, depth
- Spacing on a 4 px grid; panels pad 20–24 px; sections separate by 24 px; page gutters 20 / 32 / 40 px.
- Radii: sheet 28 px, panels 18 px, inner controls 10 px, pills fully rounded. Nothing else.
- Shadows: only the sheet (soft, low) and floating layers (popovers, drawer). Panels use borders, not shadows.

### Motion
- Colour and hover transitions only; the evidence drawer slides in over 180 ms.
- All motion is disabled under `prefers-reduced-motion`.

## Components

- **Shell:** slate frame + sidebar (9 sections) + ivory sheet. Top bar has search, week selector, "vs previous week" switch, data freshness, Generate report.
- **Metric:** light numeral, label, one line of context. Never a number without a label saying what it counts.
- **TrendTag:** icon + deterministic percentage (or "New"); colour by meaning; screen-reader text names the trend.
- **PainTable:** compact (dashboard) and full (Pain points) variants; sortable headers with `aria-sort`; rows open the evidence drawer.
- **EvidenceDrawer:** modal dialog, focus moves in and returns on close, Escape closes; shows weekly history, workarounds, and original posts with verified quotes only.
- **LeadSignal:** the charcoal focal panel with the biggest rise or newly observed problem and its 8-week lollipop history.
- **SegmentBar:** proportional segments with gaps; hatched = pending/unknown.
- **VolumeChart:** lollipop bars; full height = discussions collected, dark core = discussions describing pain.
- **AiMark:** the violet "AI reading" pill. Required on every AI-generated passage.

## Data-visualisation rules
- Every chart answers one named question in its panel subtitle.
- Show counts of unique discussions; keyword mentions are labelled as such and never mixed in.
- A week with no stored report is a hatched gap, not a zero.
- Previous-period values use outline or teal; the current period uses solid ink or the trend fill.
- Every chart has a text alternative (`aria-label` listing values) and hover titles.

## Voice
- Plain, specific, calm. "4 of 5 discussions unresolved", not "High severity".
- Recommendations are things to investigate, never instructions.
- Empty and error states say what happened and what to do next.
