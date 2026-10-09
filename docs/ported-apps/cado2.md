# CadO2 — functional specification

**Status:** built. Every screen is in place behind the `cado2` preview flag. What remains is switching
the flag on per environment, and deleting it once CadO2 is released. This document records the
behaviour and what is deliberately done differently.

**In One WSO2:** a collapsible **CadO2** group under Sales, with **My Quotes**, **My Approvals** and
**Admin** under `/sales/cado2`. The backend is the CadO2 Go service, unchanged in shape, configured as
`ONE_WSO2_CADO2_BACKEND_URL`. The whole feature sits behind the `cado2` preview flag.

CadO2 (Cadence + WSO2) is WSO2's quote tool: an account manager builds a quote from a Salesforce
opportunity, prices it from the opportunity's price book, sends it through the approval rules, and
issues an order form.

---

## 1. Purpose and users

| Role (from CadO2 `/me`) | Gets |
|---|---|
| `SALES` | My Quotes: create, edit, submit, recall, revise, close and delete their own quotes |
| `ADMIN` | Admin only: the approval matrix, approval SLAs and the reference data. No quotes and no approvals |
| Any approver role (`approverRoles` non-empty: Deal Desk, Legal, Regional Director, Area GM, CRO, CFO, CEO, …) | My Approvals, and read access to the quotes waiting on their role |

Roles add up: a person can hold several and gets the sum. `ADMIN` is meant to be given on top of another
role, to the few people who also run the admin panel. Someone with none of them sees no CadO2 entries at
all (§4).

---

## 2. Route map

All paths below are relative to `/sales/cado2`. Paths are built in one place,
`features/sales/cado2/cado2Paths.ts`, so no component writes a CadO2 URL by hand.

### 2.1 Rail

| Rail item | Id | Target | Access |
|---|---|---|---|
| CadO2 (group) | `sec-app-cado2` | — | shown when any child is |
| My Quotes | `sales-cado2-quotes` | `/quotes` | `SALES` |
| My Approvals | `sales-cado2-approvals` | `/approvals` | any approver role |
| Admin | `sales-cado2-admin` | `/admin` | `ADMIN` |

The rows come from the `CADO2_APPS` registry (`constants/cado2Apps.ts`), spread into the Sales
sections only while the flag is on. The group uses `ReceiptTextIcon` (not the perspective's Radio or
Meetings' Video icon) and `alwaysGroup: true`, so a person who can open only one child still sees it
under **CadO2**.

`/sales/cado2` itself redirects to `/quotes` for a rep, otherwise to `/approvals` for an approver,
otherwise to `/admin`.

### 2.2 Quotes

| Target | Screen | Access |
|---|---|---|
| `/quotes` | My Quotes: the caller's own quotes (status filters, search) | `SALES` |
| `/quotes/new` | Quote wizard, new quote | `SALES` |
| `/quotes/:quoteId/versions/:version/edit` | Quote wizard, editing a draft version | `SALES` |
| `/quotes/:quoteId` → `/quotes/:quoteId/quote` | Quote page | the owner, or an approver on it |
| `/quotes/:quoteId/approvals` | Quote page, Approvals tab | as above |
| `/quotes/:quoteId/versions` | Quote page, Versions tab | as above |
| `/quotes/:quoteId/history` | Quote page, History tab | as above |

Opening a quote from My Approvals adds `?from=approvals`, which makes the back link read
"← My Approvals". Without it the back link is "← My Quotes". The screen itself is rebuilt from the URL
alone.

### 2.3 Approvals

| Target | Screen | Access |
|---|---|---|
| `/approvals` | My Approvals (steps waiting on the viewer's roles, with deadline states) | any approver role |

### 2.4 Admin

Admin is one rail item. Inside it, a **section list** on the left picks the section; each section is
its own route. The list is grouped, and on narrow screens it collapses into a select above the
content.

| Group | Section | Target |
|---|---|---|
| Approvals | Approval matrix | `/admin/approval-matrix` |
| | Approval SLAs | `/admin/approval-slas` |
| Reference data | Legal entities | `/admin/legal-entities` |
| | Currencies | `/admin/currencies` |
| | Product categories | `/admin/product-categories` |

`/admin` and any unknown section → `/admin/approval-matrix` (an absolute redirect: a relative one from
the catch-all route would resolve under itself and loop). Adding a section is one entry in
`features/sales/cado2/admin/adminSections.ts` and one route. The frame is `Cado2AdminLayout`; each
section renders its own heading, and the tab title reads "Currencies · CadO2 Admin".

### 2.5 Routing rules

- Code lives in `features/sales/cado2/`; routes are exported as a `cado2Routes` fragment rooted at
  `sales/cado2` and mounted in `App.tsx` only while `isPreviewEnabled("cado2")`.
- Every leaf is wrapped in the CadO2 shell (§4), which runs the gate ladder before rendering. A hidden
  item is refused at its URL too.
- Heavy leaves are lazy with a `Skeleton` fallback: the wizard, the quote page and the approval
  diagram.
- Every page sets its title with `useDocumentTitle` ("My Quotes · One WSO2", "Q-26-00042 · One
  WSO2").

---

## 3. Screens (scope summary)

Behaviour is kept as it is today unless §7 says otherwise.

- **My Quotes** — KPI filter chips by status, search, rich rows (customer, opportunity, totals,
  status, approval deadline), row menu (open, edit, delete draft). "New quote" button.
- **Quote wizard** — Overview (Salesforce account with its sales region, an open opportunity tagged First Sale /
  Renewal / Expansion, legal entity, start date; a renewal picks the closed-won opportunities it renews and starts the
  day after they end, with a warning if the AM picks another day; an account with no sales region in Salesforce stops the quote here, with Next and Save draft disabled) → Products
  & Pricing (the opportunity's currency and price book, locked; add lines from that price book only, searched by name or product code;
  discounts; subscription term; partner commission) → Commercial (payment terms, contacts, bill-to
  and ship-to, special terms, justification) → Review (summary, approval preview, submit). The draft
  is saved when moving between steps and on "Save draft". The live pricing and approval previews are
  debounced. A save that hits a newer version (409) offers to reload; a refused save (422) lists the
  issues with links to their step.
- **Quote page** — the quote as a read-only sheet (customer band, deal, order-form table, deal
  figures, yearly schedule, terms, addresses with their contacts (as in the order form's section 01), justification), status panel with the actions the
  backend allows (`quote.actions`: recall, revise, close, delete draft, approve, request changes,
  reject), documents panel (order form preview, issue, download), and the Approvals, Versions and
  History tabs. Above the tabs, a header card names the quote: the quote number and version, the
  account as the page title, the opportunity, the partner, the status and the page's buttons. The deal type, sales
  region and sub-region are facts in the Deal section, beside the currency and what a renewal renews. The deal below doesn't
  repeat it. When it's the viewer's turn, the Quote tab opens with a full-width
  "Your decision" section, set apart from the deal below it (several roles' cards sit side by
  side). Each card ("Your approval · CFO") says which role they act as and why it's asked (that step's reasons as rows: line, product
  group, discount and the limit it passes; the first three, then "Show N more"). Deal Desk, who
  reviews every quote, sees "What's non-standard": lines whose category the rep chose (the only place besides the
  line's own "Category chosen by rep" tag), then every point from the approvals still to come,
  once each, with the approvals it needs ("· needs CRO and CFO"). Who approves is left to the
  Approvals tab. After a decision a line in
  the same place confirms it ("Approved as CRO."). Approve, Request changes and
  Reject sit at the foot of each role's card, next to its reasons; the header only has a "Your
  approval" link (or "Your approvals (2)") that jumps there from any tab.
- **My Approvals** — inbox of steps for the viewer's roles, deadline chips, opens the quote.
- **Approval diagram** — the approval workflow drawn with React Flow, in the Approvals tab and the
  submit preview.
- **Admin sections** — approval matrix (discount groups and ladders, product mapping, commercial
  rules, change log; saving shows which quotes in approval would be recalled first, as plain text since
  Admin gives no access to quotes), approval SLAs,
  legal entities (master–detail with an edit drawer), currencies, product categories.

---

## 4. Access

one-wso2 has no backend; the UI mirrors what the CadO2 backend enforces. The backend checks every
call itself and keeps doing so against one-wso2's token (§6).

- **Source of truth:** CadO2 `GET /me` → `{sub, email, roles: ("SALES"|"ADMIN")[], approverRoles:
  string[]}`. Roles come from the caller's groups on the backend.
- **Rail:** a new `cado2` adapter in `components/side-rail/visibilityFold.ts`, claiming
  `CADO2_ITEM_IDS` (the group and its three children) and in play for the Sales perspective only
  (`useCado2RailGate`). `SALES_ITEM_IDS` is pinned to Meetings alone, so the two adapters never answer
  the same item.
  - flag off → no CadO2 sections exist, the adapter is not in play, and `/me` is never called;
  - flag on, `ONE_WSO2_CADO2_BACKEND_URL` unset → the items are shown and every page says "not
    connected", naming the key (same as Meetings);
  - configured → `/me` decides each child as in §2.1; the group follows its children.
- **Shell:** `features/sales/cado2/components/Cado2Shell.tsx` runs the gate ladder from
  `docs/conventions.md` for every route: not configured → resolving → failed (Retry) → denied (the
  shared "Nothing here for you yet" card) → allowed. A route that needs a role the person lacks
  (`Cado2Requires`) redirects to CadO2's landing, which always has a page for anyone the shell let in.
- Quote-level actions are never decided in the UI: buttons follow `quote.actions` and each approval
  step's own permissions, as returned by the backend.

---

## 5. API contract

Base: `ONE_WSO2_CADO2_BACKEND_URL` (for example `https://api.example.wso2.com/cado2/v1`), trailing
slashes stripped. Every call uses `authedGet/Post/Put/Delete` (Bearer access token). Service URLs are
built in `cado2ServiceUrls` in `src/config/apiConfig.ts`.

| Area | Endpoints |
|---|---|
| Identity | `GET /me` |
| Salesforce lookups | `GET /accounts?nameContains&limit`, `GET /accounts/{id}/opportunities[?status=open\|won]`, `GET /accounts/{id}/contacts`, `GET /products?currency&pricebookId&limit&offset[&search]`, `GET /pricebooks?currency` |
| Reference data | `GET /legal-entities[?active=true]`, `GET /currencies`, `GET /quote-settings` |
| Pricing | `POST /pricing/preview` |
| Quotes | `GET /quotes?limit&status&scope=all`, `POST /quotes`, `GET /quotes/{id}`, `POST /quotes/{id}/revise`, `POST /quotes/{id}/close`, `GET /quotes/{id}/audit-events`, `GET/PUT/DELETE /quotes/{id}/versions/{v}`, `POST …/submit`, `POST …/recall` |
| Documents | `GET/POST /quotes/{id}/versions/{v}/documents` (list, issue), `POST …/documents/preview` (PDF), `GET /quotes/{id}/documents/{docId}/file` (PDF) |
| Approvals | `POST /approvals/preview`, `GET …/versions/{v}/approval-preview`, `GET …/versions/{v}/approval`, `POST …/approval/steps/{stepId}/approve\|reject\|request-changes`, `GET /approvals/inbox` |
| Admin | `GET/PUT /admin/approval-matrix`, `GET /admin/approval-matrix/changes`, `GET/PUT /admin/approval-slas`, `GET /admin/approval-slas/changes`, `GET/POST /admin/currencies`, `PATCH /admin/currencies/{code}`, `GET /admin/product-categories`, `GET /admin/product-categories/search?q`, `PUT/DELETE /admin/product-categories/{productId}`, `POST /legal-entities`, `PATCH /legal-entities/{id}` |

Writes that change a draft or a version send `expectedUpdatedAt`; a newer copy on the server answers
409. A refused save or submit answers 422 with `{message, issues: [{field, message}]}`.

PDFs are fetched with `cado2Pdf` (over `fetchWithReauth`), which refuses any response that is not
`application/pdf`.

Salesforce record links use the shared `ONE_WSO2_SALESFORCE_BASE_URL`; no CadO2-specific key.

Query keys: `["cado2", <userSub>, <domain>, …]`, one shared `QueryClient`.

---

## 6. Backend prerequisites

Tracked with the CadO2 backend, outside the frontend changes.

1. **Subscription.** one-wso2's application is subscribed to the CadO2 API on the gateway, per
   environment. The backend verifies the gateway assertion (`AUTH_TOKEN_HEADER=x-jwt-assertion`).
2. **Claims.** The verified token carries `sub`, `email` and `groups` for one-wso2's users
   (confirmed). Roles and approver roles are read from `groups`.
3. **Audience.** If `AUTH_AUDIENCE` is set on the CadO2 backend, it must accept one-wso2's client too.
4. **CORS.** `CORS_ALLOWED_ORIGINS` (or the gateway) allows one-wso2's origin and the
   `Authorization` header, and exposes `Content-Disposition` for PDF file names.
5. **Host.** The API is published on a `*.wso2.com` host; the production CSP allows no other API
   domain.

---

## 7. Deliberate differences

- **Shell.** No own header, side menu, sign-in, token renewal, session-expired dialog, theme or theme
  picker: one-wso2's shell owns all of them. CadO2 follows the active one-wso2 theme in light and dark,
  with theme tokens only.
- **Navigation.** The rail replaces CadO2's own menu; Admin's five pages become a section list (§2.4).
- **Tabs are routes** on the quote page (§2.2).
- **Back link** comes from `?from=approvals`, not router state, so a shared link rebuilds the same
  screen.
- **Unsaved changes.** The rail does not know about the wizard's form. When the wizard closes with
  unsaved changes for any reason (rail click, sign-in again after expiry), they are kept in
  `sessionStorage` (`useLeaveGuard`: on unmount and on `pagehide`), and reopening that draft says "You
  left this draft with unsaved changes. Restore them?". The wizard's own Close asks first, and a browser
  reload or tab close still warns first.
- **HTTP and errors.** CadO2's own fetch wrapper and `QueryClient` are replaced by `@api/http` and
  the shared client; messages via `describeError`, never a raw body. 4xx and mutations are not
  retried.
- **Feedback.** Issues, conflicts, refusals and results the person must read ("Saved. 3 quotes were
  recalled for resubmission.") stay inline, as does the wizard's "Saved" marker beside its Save button.
- **Wording.** Screens say **CadO2** wherever they named the tool.
- **New dependency:** `@xyflow/react` 12.12.0 (pinned) for the approval diagram. It is lazy-loaded:
  its own chunk, fetched the first time a graph is shown.

---

## 8. Phases

Built in five steps, in one pull request.

| # | Phase | Lands |
|---|---|---|
| 1 | Foundations | this document; `cado2` preview flag; `ONE_WSO2_CADO2_BACKEND_URL` (Window type, `config.js.example`, README, `apiConfig`); rail group; `cado2` adapter + tests; `cado2Paths`; `Cado2Shell` with the gate ladder; route fragment; data layer on `@api/http` |
| 2 | Quotes | My Quotes, quote page with routed tabs, wizard, unsaved-changes stash |
| 3 | Approvals | My Approvals, approval graph (`@xyflow/react`) |
| 4 | Admin | section-list frame and the five sections; on-screen wording |
| 5 | Finish | review against the surroundings (theme tokens only, tables in scroll containers, layouts as before beside the rail); remaining tests (Salesforce links, Close with unsaved changes); this document final |

---

## 9. Risks

- **Token path (§6):** if the gateway subscription or claims are missing in an environment, every
  call fails or every person resolves to no roles.
- **Unsaved changes (§7):** the stash covers leaving the wizard; it does not stop the navigation.
- **Wide content:** the order-form table and the approval matrix are wide; check them beside the rail
  at laptop widths.
- **Fail-closed rail:** an id in `CADO2_ITEM_IDS` without a case in the adapter is hidden from
  everyone.
