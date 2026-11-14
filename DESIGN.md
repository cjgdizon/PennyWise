# PennyWise design

The approved redesign replaces the former blue palette with a restrained finance workspace. The interface uses Tailwind utility classes, self-hosted Inter for text, and JetBrains Mono for numeric amounts. Figures use tabular numerals.

## Tokens

| Token | Light | Dark |
|---|---|---|
| Canvas | #F8FAFC | #09090B |
| Panel | #FFFFFF | #18181B |
| Text | #0F172A | #F4F4F5 |
| Supporting text | #536176 | #A1A1AA |
| Border | #E2E8F0 | #343439 |
| Hover surface | #F1F5F9 | #27272A |

Emerald marks healthy states, amber marks approaching limits, and rose marks exceeded limits or errors. Status text accompanies color. Focus uses a visible emerald outline. Category icons and muted badges help users scan entries without relying on color alone.

## Composition and behavior

Desktop uses a collapsible left navigation and a persistent Log transaction action. The overview has four KPI areas, weekly spending bars, a category donut with a toggleable legend, budget health, unpaid bills, and recent activity. On phones, KPI areas use two columns and the chart legend sits below the donut. Bottom navigation has a central add action and More exposes the remaining destinations.

Quick entry opens a right drawer on desktop and a full-height sheet on phones. Dialogs trap focus and restore it on close. Dirty input needs confirmation before dismissal. Buttons preserve touch space, page content clears the bottom navigation, and reduced-motion preferences disable unnecessary transitions.

Empty states guide account creation and budgeting. Without budgets, the allowance reads Not calculated. Amounts and underfunding warnings describe real stored records, not demonstration data.

## Verification scope

The integrated suite passes 45 tests and the production build. The latest production browser run passes 15 checks with no page errors, including desktop/phone screenshots in both themes. The finish review requested three visual fixes; those were applied and recaptured. The scoped screenshot confirmation returned ship: all three findings were resolved. Screenshots contain synthetic test records. The redesigned build has not been deployed.

The named Impeccable finish reviewer and engine were unavailable. A generic independent reviewer inspected the screenshots; no automated detector result is claimed. The confirmation reviewed the three reported fixes, with additional phone captures for budgets, savings, reports, settings and quick entry. Physical iPhone and 200% text enlargement remain unverified.
