# Design brief (input to docs/design-system.md in T2)

The T2 agent turns this into a one-page design system and waits for owner approval. "Female-friendly" here means calm, warm, clear and confidence-building, not pink or childish.

## Mood
Ajrakh-inspired: deep indigo, madder red, turmeric ochre on warm cream. Handcrafted and trustworthy, not corporate grey.

## Colour tokens (check every pair for WCAG AA contrast)
| Token | Hex | Use |
|---|---|---|
| indigo-900 | #16224A | headings, top bar |
| indigo-700 | #243B6B | primary buttons, links, active tab |
| madder-600 | #B23A48 | accent, key actions, alerts of care |
| ochre-400 | #E2A33B | highlights, badges (dark text only) |
| cream-50 | #FBF6EC | page background |
| sand-100 | #EFE5D2 | cards and subtle sections |
| border | #E3D9C6 | lines and dividers |
| sage-600 | #5E8C6A | success, paid |
| danger-700 | #B3261E | errors, cancelled |
| ink | #2B2A33 | body text |
| muted | #6B6872 | secondary text |
Dark mode: optional, same hues, darker surfaces.

## Type and spacing
- System fonts only (works offline, no downloads). Make sure Hindi and Gujarati render on Android; test early.
- Base 16 px; inputs at least 16 px; headings 20 and 24 px; numbers use tabular figures; amounts right-aligned in Indian grouping.
- 4 px spacing grid; generous padding; cards radius 14 px; inputs radius 12 px; tap targets at least 48 px.

## Layout
- Phone: bottom tab bar (Home, Sales, Stock, People, More) with a central "New sale" button; one-handed reach.
- Desktop: left sidebar, denser tables, keyboard-friendly.
- Photo-first lists: product and artisan cards show a large photo.
- Subtle ajrakh-style geometric pattern only on headers, empty states and the invoice border; never behind text.

## Core components (8)
Button, input (with label and error), list card with photo, table, modal or bottom sheet, bottom tab bar, empty state, toast with undo.

## Voice
- Plain, kind words: "Add a piece", "Money to receive", "Money to pay artisans". Avoid accounting jargon on main screens (use it only on invoices and reports).
- Confirmations in plain language and with undo where possible. Errors say what happened and what to do next.
- Hindi and Gujarati translations of all main screens; Hindi and Gujarati product names supported.

## Accessibility
Contrast AA, visible focus, labels on inputs, never colour alone for meaning, large text support, reduced-motion respected.

## Invoice
Looks like a proper Tally-style GST invoice (A5 first) with a warm, restrained touch: small logo, ajrakh border, clear HSN summary, tax in words, round-off.
