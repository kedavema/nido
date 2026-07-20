# Settings design specification

This specification defines the M2 Settings experience for household categories and payment
sources. The implementation reuses the Nido v0.3 visual language without copying generated runtime
or inline styles from `design/nido-v0.3/`.

## Navigation

The existing **More** tab is the Settings entry point. It presents two household-scoped rows:

1. **Categories** — manage expense and income categories.
2. **Payment sources** — manage informational sources without balances.

Each row opens a dedicated route. Back navigation returns to More and preserves the active
household session.

## Shared screen anatomy

| Region   | Requirement                                                            |
| -------- | ---------------------------------------------------------------------- |
| Header   | Back action, concise title, optional primary add action                |
| Status   | Loading, recoverable error with Retry, or empty-state guidance         |
| Content  | Scrollable cards with 44 px minimum interactive targets                |
| Form     | Labelled controls, inline validation, Cancel and Save actions          |
| Feedback | Disable duplicate submission; expose errors as text, never color alone |

At 360, 390, and 412 px widths, content uses the existing spacing tokens, stays in one column, and
must not clip horizontally. Web content remains centered at the app's established maximum width.

## Categories

- Separate **Expenses** and **Income** sections.
- Render root categories in `sortOrder`, with their subcategories immediately below and visually
  indented.
- Each item exposes Edit and Archive. Archived items remain visible with an explicit Archived
  state and can be reactivated through Edit.
- Add/Edit fields: kind, parent (optional), name, icon, color, and order. Parent choices are roots of
  the same kind only.
- Empty state: explain that categories organize movements and offer **Add category**.

## Payment sources

- List active sources first and archived sources second; never display or imply balances.
- Show the human-readable type and optional owner name. The owner is informational.
- Each item exposes Edit and Archive/Delete using the API semantics; archived state is explicit.
- Add/Edit fields: name, type, optional active household member, and active state when editing.
- Empty state: explain examples (cash, account, card, wallet) and offer **Add payment source**.

## Accessibility and language

- Use semantic buttons, form labels, focus order matching visual order, and AA contrast.
- Icons reinforce text but never replace accessible names.
- UI copy follows the app's existing English runtime convention.
- Loading and error announcements use accessible live text where the platform supports it.

## Explicitly out of scope

Household profile editing, member administration, balances, movements, budgets, offline mutation
queues, and selectable category templates are not introduced by this batch.
