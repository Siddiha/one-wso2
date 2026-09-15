# Credit Card Expenses — functional specification

Ported from `digiops-finance/apps/cc-expenses/webapp` (13,764 lines) into
`webapp/src/features/finance/cc`. Written after reading the source in full; the port
had no specification and no tests, and its DTOs were mirrored from the *backend*
rather than from the running app, which is where the gaps below came from.

Routes: `/finance/cc/dashboard`, `/finance/cc/new`, `/finance/cc/pending`,
`/finance/cc/approve`, `/finance/cc/history`, `/finance/cc/settings`. Backend is
`ONE_WSO2_CC_EXPENSES_BACKEND_URL`.

**Under Finance, not Me.** Leave and claims are things every employee does, so they sit with
the person; a corporate card is not something everyone has, so the whole app sits with the
other finance operations instead. That includes the four screens a cardholder uses for their
own spend — the app is not split the way claims are, because the split there was about *who
the work is for*, and this one is about *who has a card at all*.

---

## 1. Purpose and users

A company credit-card transaction arrives from the bank statement uncategorised. The card
holder categorises it and submits it; a lead approves it; finance approves it again and it
is booked. Nothing here is a reimbursement — the money has already left the card.

Access comes from `GET /user-info` as **privilege names**, not numbers
(`ccTypes.ts:21`), and `ccHasAccess` tests membership:

| Privilege | Sees |
|---|---|
| `employee`, `cc_owner` | Dashboard, New Transactions, Pending Submissions, History |
| `lead` | the above, plus Approve Submissions |
| `finance` | all of the above, plus Statement ingestion |

## 2. Screens

### 2.1 Dashboard — `/finance/cc/dashboard`

What is still unsubmitted, how long it has been sitting, and what has been claimed.

A header stating both windows the screen covers ("As of" today, and the reporting window
the category table spans), then four tiles in a 2×2 grid — three stat cards and one table
— followed by two more tables. Three tables in all. Every figure is USD, and every amount
drops the cents, as the source's `formatCurrency(x).split(".")[0]` does throughout.

- **Three stat cards** — Total Amount Pending Submission (which links out to New
  Transactions), Total Transactions Pending Submission, and Avg. Days Taken to Submit
  (suffixed "days", "-" when the backend has no figure). All three follow a **period** —
  All time (the default), Last 6 months, Last year. "All time" sends no lower bound at all.
- **Pending by Age**, the fourth tile and the first of the three tables: one row per
  bucket, AGE / COUNT / VALUE, repeating "As of" today's date. The bucket labels come from
  the response; the port does not invent its own bands.
- **Cardholders Details** — per card holder, their outstanding total, transaction count,
  average days to submit, and how many of their transactions sit in each ageing band
  (0-7D / 8-14D / 15-30D / 30+D). The last two turn red when they are not empty. Lead and
  finance only.
- **Submitted Expenses by Category**, over a fixed six-month window ending today, shown
  **Monthly / Quarterly / Annually**. Widening the granularity collapses the same six
  months into fewer columns; it does not widen the window. Categories rank by total spend,
  with a Total row and a Total column.
- **View switch.** A lead or finance opens on **Admin view** and can narrow to **Employee
  view**; that also hides the cardholder table. An ordinary card holder has no switch —
  the backend already scopes them — so the request omits `ownedCardsOnly` rather than
  sending it as false.

### 2.2 Pending Submissions — `/finance/cc/new`

> **The name.** This screen answers to four: the route says `new`, the nav id is `cc-new`
> and `ccPaths.newTransactions` agrees, while the nav label, the page title and the source
> app all say **Pending Submissions** (`route.ts` maps `/new-transactions` to that label).
> Confusingly the source ALSO has a screen it labels "Pending Approvals" at
> `/pending-submissions`, which is §2.3 below. The source's labels win: this is Pending
> Submissions, §2.3 is Pending Approvals. The route keeps `new` because it is the URL people
> already have.

Uncategorised transactions from the last **seven days**, on whichever of the viewer's own
cards is selected. Each needs an expense type, a comment, and — depending on the category
— more:

| Category | Also required |
|---|---|
| Travel | a travel job number |
| Marketing (and any `Marketing - …` sub-category) | sub-region **and** product unit |
| anything else | product unit |

**Layout: the list on the left, the categorisation panel on the right.** The panel is live
against whichever row is highlighted, so the list stays readable while a row is filled in.
Rows that are ready carry a green tick, and the list is sorted with those first.

**Nothing on this screen scrolls** — not the page, not the list, not the panel. Both halves
are measured to the room left below them, so the grid's pagination sits on the bottom edge
and the panel's Save sits on its own. The form is kept short enough to fit instead: fields
are paired across two columns, there is no divider between them, the subtitle is one line,
and the funding-source table is behind a button rather than inline.

**The card picker is a dropdown** showing the selected card's name and full number, with a
rename button beside it. A card with no label of its own is called `Card 1`, `Card 2` by its
position in the list. Each option carries its bank's mark and how many transactions are
outstanding on it.

**Changing a field clears what it invalidates.** A new category drops the type, job number,
sub-region and units beneath it; a new type drops the job number and sub-region; a new job
number drops the sub-region. Without this a recategorised row carries values that no longer
belong to it.

**Travel job numbers carry their own units.** Picking one calls `GET /travels/{jobNumber}`
and fills the product and business unit from the job rather than asking; that is why they
are required. A job with **no funding sources** is refused rather than half-applied, and a
job missing units says so — a warning, not a block, because Travel is not asked for units.
The engagement is shown against the transaction, and its funding split — what the
transaction costs each share of the job — opens in a dialog, as in the source.

**Product units are chosen by index, not by name.** Product and business units arrive as
two index-aligned arrays and the same product-unit name can appear under more than one
business unit, so a row is matched back to its entry by the exact pair first and by product
unit alone only as a fallback.

**Saving.** Save writes that one row through `/save-draft`; an autosave five seconds after
the last change is the safety net behind it, so closing the tab mid-batch loses nothing.
Moving to another row, ticking a checkbox, or switching card with unsaved edits asks first —
save, discard, or stay. A travel job with **no funding sources is never written at all**, by
Save or by the autosave, since finance could not book the spend against it. A write the
backend refuses says so and is retried on the next change, rather than being reported as
saved.

**Ticking any row puts the panel into read-only.** Bulk selection and single-row editing are
separate modes; **Bulk Edit** then applies whichever fields you fill to every ticked row and
leaves the rest of each row alone. It has no confirmation step and does not clear the
selection, because the usual next action is to submit those same rows.

**Submit takes a whole selection or none of it.** If any ticked row is incomplete the button
stays disabled rather than quietly submitting the ready half.

Receipts and contracts attach per transaction, and can be viewed and removed from the panel.

### 2.3 Pending Approvals — `/finance/cc/pending`

The card holder's own submitted transactions on the selected card, still with a lead or
with finance. Same shape as §2.2 — the list on the left, the panel on the right, neither
of them scrolling the page — and the same columns, except that **Status** replaces the
completeness tick, because this queue mixes both stages. No checkboxes: nothing here acts
on a set of rows.

**The panel opens read-only**, drawn as values rather than as disabled controls, and stays
that way until the reader presses **Edit**. Edit is offered **only while the row is still
with the lead**; once finance has it there is no Edit button at all. Edit/Cancel appears
only while the row is clean — once there are changes the way out is **Discard** or **Save**,
so it is never ambiguous which the reader meant.

**Saving goes through `/save-edit`** and drops the row back to read-only. **Nothing is
autosaved here**: the correction is going straight back to an approver, so it is written
when the reader says so. For the same reason Save refuses a row that is no longer
complete — the source validates on save; this refuses before the round trip, as the
categorise dialog already does.

**Submission details** — who has had the row and when — sit behind an expander in the
header, collapsed by default: this screen is for correcting a row, not auditing it.

Attachments can be **viewed** on a submitted row but only replaced or removed while it is
being corrected.

### 2.4 Approve submissions — `/finance/cc/approve`

Lead and finance. Finance sees a queue spanning **both** stages, so work still sitting
with a lead is visible rather than absent until the lead acts — but they cannot select
what is not yet theirs. Finance may also correct a transaction that has reached them.

### 2.5 History — `/finance/cc/history`

Everything the viewer is entitled to see, over a chosen window (7 days by default).
Someone who can see other people's spend also gets **employee**, **card** and **lead**
filters. A card can carry several leads, so the lead filter matches within the list rather
than comparing the whole string.

Opening a transaction shows its categorisation and its **approval trail** — who had it and
when, and the report sequence number once booked.

### 2.6 Statement ingestion — `/finance/cc/settings`

Finance only. Upload a bank statement, then process it into transactions.

## 3. API contract

| Call | Notes |
|---|---|
| `GET /user-info` | `privileges: string[]` |
| `GET /credit-cards` | active cards only unless inactive are asked for |
| `PATCH /credit-cards/{id}?label=` | rename a card |
| `GET /transactions?dateFrom&dateTo&includeInactive` | **all three required**; window ends *tomorrow* |
| `POST /transactions/save-draft` · `/employee-submit` · `/save-edit` | |
| `POST /transactions/lead-approve` · `/finance-approve` | |
| `GET /transactions/new-transaction-summary` | `?dateFrom&ownedCardsOnly`, both omitted when falsy |
| `GET /transactions/submitted-transaction-summary` | `?dateFrom&dateTo&ownedCardsOnly` |
| `GET /transactions/card-holder-compliance-summary` | `?dateFrom&ownedCardsOnly`; not called at all unless shown |
| `GET /travels/job-numbers` · `GET /travels/{jobNumber}` | the job's units and funding sources |
| `GET /configurations/expense-types` · `/sub-regions` · `/product-and-business-units` | |
| `GET`/`DELETE`/`PUT /transactions/{id}/attachments` | note the backend's misspelled `fileExtenstion` query param on upload |
| `POST /transactions?bankCode&statementFileName` · `/transactions/process-statement` | statement ingestion |

## 4. Deviations from the source, and why

**Structural.** The source is a standalone app with its own shell, mobile drawers and a
Redux store; One WSO2 renders six routes inside its own shell with React Query. Mobile
layouts are the host's responsibility.

**Nothing dropped from the dashboard.** The source renders it as stat cards and three
tables, with no charting library; all of it is ported, including the ageing-band columns
and the "As of" date.

**Attachments.** The port accepts the same types the source does, bmp, gif and svg
included.

**Pending Submissions sorts on the server's copy of a row, not the edited one.** The
source's list re-sorts from its Redux store, which does not carry the edit panel's unsaved
changes, so the order holds still while a row is filled in. Sorting our live rows instead
would move a row to the top the instant its last required field was filled — and the panel,
which follows the first row until one is picked, would jump to whatever landed underneath.
The green tick still updates live; only the order waits.

**A bulk edit checks each row's own category before setting its units.** The source
checks the form's (`EditPaneModal.tsx:133-140`), which leaves a hole: pick a product unit
without picking a category and a Travel row in the selection is stamped with a unit its job
number is supposed to own. Whenever the form does name a category the two agree, so this is
narrower than it sounds. The unit field is also hidden when every selected row is Travel and
no category is being set, rather than offering a control that would apply to none of them.

**Pending Approvals guards an unsaved correction; the source does not.** Its grid has no
`editPaneRef` and no dialog, so clicking another row drops a half-typed correction on the
floor — and unlike the drafting screen there is no autosave behind it to catch the loss.
Ours asks: save, discard, or stay. The same screen also gained the **card picker** the
source has and the port was missing; it used to list every card's pending rows at once.

**Switching cards asks before discarding unsaved edits**, as switching rows already does.
The source lets a card change through unguarded; here the autosave would otherwise flush the
half-typed edit on the way out and the reader would never be offered the choice. The
selection is dropped with the card it belonged to — it holds transaction ids, and the list
is filtered by card, so carrying it over left Bulk Edit enabled and badged with rows it no
longer had.

**One guard the source does not have.** Approving is held while an edit saved from the
approve screen is still in flight. The source's `isApproveDisabled`
(`ApproveTransactionsDataGrid.tsx:189-191`) checks only the selection and the approval
request, so it can approve a row whose correction has not landed — booking the pre-edit
version. Invisible when nothing is in flight.

## 5. Source behaviour reproduced deliberately, though it looks wrong

Kept because the two apps run side by side during the migration and must agree. Each is
worth raising with the source's owners rather than diverging here.

- **The reporting window omits the start year.** `formatReportingWindow`
  (`utils.ts:47-52`) stamps `now.getFullYear()` on both ends, so from January to May the
  label reads e.g. "Aug - Jan 2026" for a window that begins in August 2025. The port
  reproduces it exactly.
- **A travel job with no product or business unit still saves.**
  `validateRequiredFields` (`utils.ts:59-64`) asks a Travel transaction only for a job
  number, a comment and an expense type — never the units — so
  `handleJobNumberChange` (`EditPane.tsx:591-598`) warns and lets the save through with
  them null. Only a job with **no funding sources** is refused, and that one is refused by
  never being applied at all. Pinned by a test, so it cannot be "fixed" by accident.

## 6. Test checklist

Covered in `cc/ccDashboard.test.ts`, `cc/ccPendingSubmissions.test.ts`,
`cc/ccWireFormat.test.tsx`, `cc/CcEditDialog.test.tsx`, `cc/components/CardMenu.test.tsx`
and `cc/pages/{CcApprovePage,CcDashboardPage,CcHistoryPage,CcNewTransactionsPage,CcPendingPage}.test.tsx`.
Every fix carries a test that fails against the previous behaviour, verified by reverting it.

Active-card filter, including case-insensitive status · the window ends tomorrow, not
today · the seven-day default, and a caller's own window overriding it · travel job
details fill the units, and the two refusal cases · `startsWith` matching for marketing
sub-categories · finance's two-stage queue and the selection lock · the card holder's
edit-while-with-lead affordance · the approval trail · the history person filters · the
dashboard's date arithmetic (period bounds with day-clamping, the six-month window,
monthly/quarterly/yearly bucketing, category ranking, out-of-window items dropped) · who
sees the view switch and the cardholder table, and that a card holder's browser never
issues the compliance request · the age table's three columns and the cardholder table's
eight · amounts rendered without cents · the "days" unit · falsy query parameters omitted
rather than sent as "false" · one lead named on the approval trail, not the whole assigned
list, and the source's "(not provided)" / "(not approved)" wording · reaching rename by
approving waits for an in-flight edit · a job missing units warns but still saves.

Pending Approvals adds: both stages listed with their own chip · the queue scoped to the
selected card · the panel opening read-only as values rather than controls · Edit offered on
a lead-stage row and withheld once finance has it · Edit revealing the controls and Cancel
hiding them again · Save posting one row to `/save-edit` and dropping back to read-only ·
Save refused on a row that is no longer complete · **nothing autosaved however long it is
left** · Discard putting the row back · the submission trail collapsed by default and naming
one lead rather than the whole assigned list · and the guard on both a row change and a card
change.

The card picker: the selected card's name and number · selecting a card · an unlabelled card
numbered by position · the outstanding count shown when there is one and not when there is
none · renaming the selected card, seeded with its current label · reaching rename by
keyboard does not also switch card.

Pending Submissions adds: complete rows sorted first, and the caller's array left alone ·
the product-unit index resolved by exact pair, by product alone, and not at all · each
field clearing what it invalidates, including a marketing sub-region not surviving a switch
to Travel · a bulk edit touching only the fields filled in, applied to every selected row,
in an order that lets a category and its type be set together · a bulk edit refusing to
stamp a hand-picked unit on rows it is switching to Travel · Save posting one row · the
five-second autosave, not the util's default second · a tick making the panel read-only and
taking Save away · Submit refusing a mixed selection · and all four ways out of the
unsaved-changes dialog · a travel job with no funding sources refused by both Save and the
autosave · a refused write reported as not saved rather than saved · switching cards showing
that card's transactions, asking first when there are unsaved edits, and dropping the
selection that belonged to the card being left.

Date expectations are built with local date fields, matching the helpers under test — a
UTC ISO string plus a fixed 86,400,000 ms offset names a different calendar day in the
evening of any negative-offset zone, and the suite would fail there and nowhere else.

One equivalent mutation is knowingly not covered: dropping `isAdminEligible` from
`ownedCardsOnly` changes nothing observable, because a card holder never gets the toggle
that could move `viewMode`. The guard mirrors `index.tsx:64` and stays.

## 7. Unverified — questions for a live tenant

Nothing here is asserted as fact:

- whether the backend treats an omitted `ownedCardsOnly` and an explicit `false`
  identically, or only the former (the source only ever omits it)
- which age-bucket labels the backend actually returns, and whether they are stable
- whether a travel job with no funding sources occurs in current data, or only in
  half-created records
- how often a travel job legitimately has funding sources but no units, given the source
  books those with null units
