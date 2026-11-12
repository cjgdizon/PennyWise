# PennyWise design

The blue Daily Companion uses the user-supplied Color Hunt palette across all screens and install icons.

## Tokens

- Workspace and phone navigation: #F9F7F7.
- Balance summary, icons, borders, and selected phone navigation: #DBE2EF.
- Primary actions, active desktop navigation, and progress: #3F72AF.
- Desktop rail and main text: #112D4E.
- Supporting text: #4E6380. Panels: #FFFFFF. Semantic warning colors remain for errors and overdue records.
- Self-hosted DM Sans is used for titles, sections, controls, and body text. Lora remains registered but is not the active display face.
- Panels use 14px corners, balance band 13px, notes 12px, primary actions and navigation 8px, and inputs 6px.

Palette source: https://colorhunt.co/palette/f9f7f7dbe2ef3f72af112d4e. Automated retrieval returned 403; exact hex values come from the supplied URL.

## Layout and behavior

A fixed navy rail anchors desktop navigation. The summary separates the pale-blue total balance from white income and expense sections. Clear blue actions and larger row labels lead the interface.

Phone navigation stays at the bottom. Summary sections stack, panels become one column, and footer content clears the navigation. Keep keyboard focus, form errors, and reduced-motion behavior.

The design applies to activity, accounts, budgets, bills, settings, dialogs, backup conflicts, and PWA assets. Financial storage and commands retain the reviewed architecture.

## Verification

25 finance tests and 12 production browser scenarios pass. Independent screenshot review approved contrast, amount legibility, phone navigation clearance, and desktop hierarchy. The Impeccable engine failed to download, so no automated detector result is claimed.
