# SPEC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** _your name_ (drafted with `/spec`)
**Status:** built and verified — `npm test` (41 passed), `tsc`, lint, route checks, and browser checks done

## Problem

Ops exports the payments table several times a day for merchant queries, month-end reconciliation, and Finance requests, and every file contains every column, including card last-four. Dana's team spends 3–4 hours a month hand-cleaning spreadsheets before they go to merchants, and an unedited file nearly went to the wrong merchant last quarter. Ops needs to choose what goes in the file before it leaves the console.

## Current state

All paths are relative to `build-battle/merchant-console/`.

- `src/app/payments/page.tsx:68-76` — the Export button is a plain `<a href="/api/payments/export?{query}">` that passes the page's URL params through. There is no dialog and there are no options.
- `src/app/api/payments/export/route.ts:11-25` — calls `parseFilters` → `filterPayments` → `sortPayments` and skips `paginate`, so the export already covers **every row matching the filter**, not just the visible page. It writes the response with `toCsv(rows)` and `exportFilename()`.
- `src/data/queries.ts:18-36` — `parseFilters` is the allowlist for status, sort, direction, and page. `queryPayments` (`:102`) is the one builder, and `GET /api/payments` (`src/app/api/payments/route.ts`) returns its `{ rows, total, page, pageCount }`.
- `src/lib/csv.ts:13-24` — `EXPORT_COLUMNS` and the `ExportColumn` type already act as the column allowlist. `toCsv(payments, columns)` (`:58`) **already accepts a column subset**, in order. `cell()` formats `amount` with `formatMoney` (`:52`), and `currency` is already its own column.
- `src/lib/csv.ts:69` — `exportFilename(date)` returns `payments-YYYY-MM-DD.csv` and has no scope.
- `src/lib/csv.test.ts` — pins escaping, the column-subset order, `"$250.00"` amounts, and the filename. The file header says these tests "should still pass afterwards".
- **Mismatch with the rules:** before this session's fix, `.claude/rules/components.md` said a Dialog component exists. There is no Dialog and no Checkbox. `src/components/Drawer.tsx` wraps `@radix-ui/react-dialog` and is the pattern to follow.
- **Mismatch noted, not fixed:** `payments/page.tsx:36-43` builds filters by hand instead of calling `parseFilters`. The visible row count on the page and the export's count can therefore disagree for params the page ignores (`sort`, `from`, `to`).

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store." | `merchant-console/CLAUDE.md` | Arbitrary column names or filename text reach the response |
| "Column names arrive from the client, so validate them server-side." | Ticket notes | Client-only checks get bypassed with a hand-written URL |
| "One query builder. Payment filtering goes through the builder behind `GET /api/payments`." | `CLAUDE.md`, ticket notes | Export and table disagree about which rows match |
| "Building this in the browser exports the current page only." | Ticket notes | We would ship a 20-row export as the feature |
| "Money is integer minor units… Format once, at the edge, next to its currency code." | `CLAUDE.md` | Amounts get re-parsed or double-formatted |
| "Card last-four is **off** by default." | Ticket AC | The near-miss the ticket exists to prevent |
| "Dialogs and forms must be operable. Every input has a label… focus moves into it and returns on close, Escape closes it." | `.claude/rules/components.md` | The dialog is unusable by keyboard |

## Approach

The export stays server-side. `GET /api/payments/export` gains two validated params: `columns`, a comma-separated list checked against `EXPORT_COLUMNS` (unknown or empty → 400, absent → the default set without `last4`), and `scope` (`filter` | `all`, default `filter`). For `scope=all` the route ignores the incoming filters and runs the same builder with none. The filename is built from the validated scope and status only, never from raw input such as the search text. On `/payments`, the Export link becomes a client-component options dialog built on the Radix dialog primitive, following `Drawer.tsx`. It shows one labelled checkbox per column with `last4` unchecked, a scope choice, and the row count. The count comes from `GET /api/payments` called with the same query, so it is computed by the same builder as the file. Download is disabled when no column is checked. The column list is passed to the dialog as a prop from the server page, so the client bundle does not import `src/lib/csv.ts`. **Amount format is unchanged:** cells stay `"$250.00"` via `formatMoney`, with currency in its own column, as decided in review.

**Considered and rejected:** building the CSV in the browser from the table's rows. It only sees the current page of 20, and the ticket names that as the bug we would ship. Also rejected: counting rows on the server page and passing them down. That count comes from the page's hand-built filters (see Current state), not from the export's `parseFilters`, so the two could disagree.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | Change | Add the default column set (without `last4`), a column-param parser that validates against `EXPORT_COLUMNS`, and a scope-aware `exportFilename`. `toCsv`'s signature and default stay as they are |
| `src/lib/csv.test.ts` | Change | Extend with tests for the parser, the default set, and the scoped filename. Existing tests stay untouched |
| `src/app/api/payments/export/route.ts` | Change | Parse and validate `columns` and `scope`, return 400 on bad input, pass the columns to `toCsv` and the scope to the filename |
| `src/app/payments/export-dialog.tsx` | Add | Client component for the options dialog: checkboxes, scope, row count, disabled Download |
| `src/app/payments/page.tsx` | Change | Replace the `<a>` Export button with the dialog and pass the current query and column list as props |

## Plan

1. **Column and filename helpers in `csv.ts`, with tests first** — done when: `npm test` passes the new cases for unknown, empty, duplicate, and valid columns, a default set without `last4`, and `payments-disputed-2026-08-13.csv` / `payments-all-2026-08-13.csv`.
2. **Route accepts `columns` and `scope`** — done when: `curl` against `/api/payments/export` returns 400 for `columns=bogus` and `columns=`, a header without `last4` when `columns` is absent, and more rows for `scope=all&status=disputed` than for `status=disputed`.
3. **Options dialog on `/payments`** — done when: clicking Export opens a labelled dialog with `last4` unchecked and "Current filter" selected, the row count matches the table footer's total, and Escape closes it with focus back on Export.
4. **Wire Download** — done when: Download fetches the export URL built from the dialog state, the downloaded file name and header match the selections, and unchecking every column disables Download.
5. **`npm test`, `npm run lint`, `/ship-ready`** — done when: all three are clean.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Columns choosable, last-four off by default | Unit test on the default set; in the browser, the dialog opens with `last4` unchecked and the downloaded header has no `last4` |
| Scope choosable, current filter default, row count visible | `curl` comparison from plan step 2; dialog count equals the `/payments` footer total for a filtered view |
| Filename reflects scope and date | Unit tests on `exportFilename`; check the downloaded file name |
| Amounts in minor units, formatted once, currency in its own column | Existing `csv.test.ts` amount tests still pass untouched; the `currency` column is present by default |
| No columns → Download disabled | In the browser, uncheck all columns and confirm the button is disabled; the route also returns 400 for `columns=` |
| Column serializer unit-tested, `npm test` passes | `npm test` output pasted into the PR |

## Risks

- **Filename injection** through the scope label. Mitigation: build the label only from the allowlisted status value or the literal `all`, never from `search` or `merchantId`.
- **The count and the file disagree** if they are computed by different code. Mitigation: both come from `parseFilters` + `filterPayments` via the two API routes.
- **Client bundle pulls in data modules** if the dialog imports `csv.ts`. Mitigation: pass the columns as props from the server page.
- **No local run yet:** Node is not installed on this machine, so nothing above has been executed.

## Out of scope

- Fixing the lexicographic amount sort in `sortPayments` (`src/data/queries.ts:81`) — a separate bug.
- Switching `payments/page.tsx` to `parseFilters` — noted above. This change does not depend on it.
- Date-range scope, saved column presets, and XLSX output.
- Changing the amount format to plain decimals — decided against in review.

## Decisions made while building

- **Filename with no status filter:** `payments-filtered-<date>.csv` when a merchant, search, or date filter is set, and `payments-all-<date>.csv` when no filter is set at all.
- **Error body:** `{ message }` with status 400, since no existing route returns an error to match.
- **Dialog:** built on the existing `Drawer` (a Radix dialog), so no new Dialog primitive was added.

- **Drawer close button:** it had no accessible name, so it now carries `aria-label="Close"` in `src/components/Drawer.tsx`. This affects every drawer.

## Verification results

- `npm test`: 3 files, 41 tests passed (22 in `csv.test.ts`, 13 of them new). `npx tsc --noEmit` and `npm run lint` are clean.
- Route: `columns=bogus`, `columns=`, and `scope=everything` each return 400 `{ message }`. With no params the header has no `last4` and the filename is `payments-all-<date>.csv`. `status=disputed` gives 33 rows in `payments-disputed-<date>.csv`, and `scope=all` gives 1,658. `columns=amount,id,last4` keeps that order.
- Browser, on `/payments?status=disputed`: the dialog is named "Export payments", every input has a label, "Current filter" is preselected with a count of 33 that matches the footer, and "Card last four" is unchecked. Switching to "All payments" shows 1,658. Unchecking every column disables Download and shows a hint. Escape closes the dialog and focus returns to Export. No console errors.
