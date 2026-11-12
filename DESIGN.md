# PennyWise design

The app supports quick daily check-ins. Amounts, due dates, and the primary entry action come first. Use the Daily Companion composition approved in the planning discussion.

## Tokens

- Background `#f7f8f3`. Panels `#fffefa`. Navigation `#fcfdf9`.
- Forest `#234b3b`. Main text `#293c31`. Secondary text `#637367`.
- Sage accents `#eaf0e3`. Borders `#e0e6dc`. Warning text `#9b4b31`.
- Body and section headings use self-hosted DM Sans. Page titles, dialog titles, and empty-state headings use self-hosted Lora.
- Panel radius is 12px. Buttons use 7px corners. Inputs and selects use 6px corners. Base spacing is 4px.

## Behavior

Use a fixed left navigation on desktop and a bottom navigation on phones. Preserve legible currency amounts and visible form errors. Dialogs protect focused financial entry. Empty screens explain the next action without inventing balances.

The balance band is inherited from the chosen Daily Companion sketch. Other content uses simple rows and separators. Motion is limited to the initial balance reveal and disabled for reduced-motion preferences.
