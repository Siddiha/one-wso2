# Org Chart — functional specification

**Status:** written ahead of the port, from the source implementation rather than from any prior
document. This is the reference for verifying the port and for writing test cases against it.

**Source of truth for behaviour:** originally the standalone org-chart app's source (`backend/service.bal` +
`backend/functions.bal` + `backend/types.bal` for the server rules, `webapp/src/view/*-org-chart/`
and `webapp/src/slices/treeSlice/` for the UI rules ported over) — that standalone backend was never
reachable for this port, though, so the data source changed: this now reads
`GET /employees/basic-info` on the **people-app backend** (people-ops-suite PR #345 widened that
endpoint into a full employee-directory listing for exactly this purpose). §7 still describes the UI
deviations from the original source app; §5 describes the contract actually in use.

**In One WSO2:** `/people-ops/org-chart`, under the People Ops perspective, on the overview page
(`PEOPLE_OPS_SECTIONS` in `@constants/perspectives.ts`). Unlike every other People Ops section
gated to admins, `/employees/basic-info` is open to any authenticated employee (see §4) — that part
of the original access model held even though the backend underneath it changed. Originally placed
under Me, next to Menu; moved here since it reads more as a People Ops tool than an everyday personal
app. Backend reached via `ONE_WSO2_PEOPLE_BACKEND_URL` — the same backend as every other People Ops
screen, not a separate deployment.

---

## 1. Purpose and users

A company-wide directory of who reports to whom — every employee, from the Chairman down, as a
single browsable hierarchy. Read-only.

Unlike People Ops → Org Structure (`/people-ops/master-data/org-structure`), which edits the
*entities* a person is assigned to (Business Unit, Team, Sub Team, Unit), this screen has nothing to
do with that data model. It renders *people* — one row per employee, connected to their manager.

**Who can open it:** any employee holding one of the people-app backend's three internal roles
(Employee, Admin, or Service Desk — see §4) — not an admin-only privilege, unlike most of that
backend's other endpoints. Everyone else gets a 403 on the one request this screen makes, surfaced
as one notice for the page.

---

## 2. Screens and features

One screen: a sidebar and a tree.

### 2.1 The tree

A collapsible indented outline — **not** the source app's pan/zoom SVG canvas (see §7 for why). Each
row shows:

- A chevron, present only when the person has direct reports; clicking it (or the row) toggles
  their children's visibility.
- An avatar — their photo, or their initials on a color tied to their department, if there's no
  photo or it fails to load.
- Name and job title.
- A second line: work email, then business unit and team.
- A "N reports" pill, N being **direct** reports only — an exact count, derived from the tree built
  in memory (see §2.2), not a field the backend sends.

Collapsing a branch never discards anything — the whole tree is already in memory (see §2.2), so
reopening it is instant with no request at all. There is no way to remove a person from the tree
entirely (the source app's "remove employee" button): collapsing is the replacement, and it doesn't
lose data.

### 2.2 Loading

One request, on open: `GET /employees/basic-info` returns every Active/Marked-leaver employee flat,
each with their own `managerEmail`. The whole tree is built from that single response (see
`util/buildOrgTree.ts`) — there is no per-manager lazy fetch the way the original source app (and an
earlier version of this port) worked; expand/collapse is purely a client-side view toggle over data
already in hand.

### 2.3 Sidebar

- **Stats** — total headcount and department count, from the full directory (department = the
  directory's `team` field — see `util/departmentColors.ts` for why).
- **Search** — a text field matching name or email against the full directory; a live dropdown
  lists up to 12 matches. Picking one **expands the tree to reveal them** (the ancestor chain is
  walked synchronously from data already in memory — no request of any kind) and scrolls to their
  row, highlighting it briefly. It never replaces or re-roots the tree — a material change from the
  source app, which replaced the whole canvas with the selected person as the new root, discarding
  anything already expanded.
- **Department legend** — one row per department (color dot, name, headcount). Single-select
  **isolate**: clicking a department hides every row that isn't a member of it or a Chairman-path
  ancestor leading to one — including an ancestor's *other* children in unrelated departments, not
  just rows outside the department entirely. Clicking the same department again (or "Show all")
  clears the filter. See §3 rule 4 for how the visible set is computed.
- **Expand all** — opens every row in the tree, including every stray section (§2.4/§8). No fetch
  of any kind, since it's all already in memory.
- **Reset view** — collapses back to just the root's first level, and clears the department filter
  and hide-interns toggle.
- **Hide interns** — a display-only filter (never fetches or discards data), replacing the source
  app's destructive "remove interns" action which deleted them from the loaded tree.
- **Download as HTML** — builds one self-contained HTML file of the **entire** company hierarchy
  (`util/exportOrgChartHtml.ts`) and downloads it client-side, no server round trip. Always the
  full tree — ignores whatever department filter or collapsed rows are on screen at the time,
  since the point is to hand the whole org chart to someone else. Employee photos ARE embedded —
  each one is fetched once at download time (while the exporter is still authenticated), downscaled,
  and inlined as a data: URI, so the file stays fully self-contained and works for a recipient with
  no access of their own. Anyone whose photo can't be fetched (wrong CORS policy, network error)
  falls back to the same initials-on-department-color avatar the live app already uses — a photo is
  a bonus, never a broken image link. Ships the same interactivity as the live page — search,
  department isolate, hide interns, expand all/reset — via a small embedded vanilla-JS block (no
  framework, no build step, no external requests); the tree markup itself is still pre-rendered, so
  a viewer with JavaScript disabled still sees the complete chart, just without the controls. Uses
  the app's real Oxygen UI "Acrylic Orange" theme tokens rather than generic colors.

### 2.4 Page states

| Condition | What the user sees |
|---|---|
| `ONE_WSO2_PEOPLE_BACKEND_URL` not set | A notice naming the missing key. No requests. |
| Directory still loading | A skeleton block. |
| Directory request failed | An error alert naming the reason. |
| Signed in, but the backend rejects the request | One warning alert for the page (a 403 on the one request this screen makes). |
| No employee in the directory has a "Chairman" designation | An error alert — the root can't be identified, so nothing renders. |

---

## 3. Business rules

1. **One request builds the whole tree.** `GET /employees/basic-info` returns the full
   Active/Marked-leaver directory, each row carrying its own `managerEmail`; `util/buildOrgTree.ts`
   builds the tree client-side from that in one pass. No per-manager fetch, no caching-vs-refetch
   concern — it's all already in memory.
2. **There is no "managerEmail is null" root signal.** Every row's `managerEmail` is non-empty,
   including the root's. A row is a root *candidate* when its `managerEmail` doesn't resolve to
   anyone else in the fetched directory; the real root is picked by an exact "Chairman" designation
   match. See item 1 in §8 for why there are multiple such candidates in practice.
3. **Expand/collapse is purely a view concern.** No data is ever discarded on collapse; no
   destructive "remove" action exists in this port.
4. **Department isolation hides, it doesn't dim.** Picking a department in the legend computes one
   set — every member of that department, plus everyone on their path back to whichever root they
   hang off (the Chairman, or their own stray root) — and renders only that set. An ancestor kept
   visible purely to preserve the path still shows their *other* children being cut, same as any
   unrelated branch. Single-select: picking a new department replaces the previous filter, and only
   one can be active at a time.
5. **Search-and-jump never re-roots the tree.** A picked search result's ancestor chain is resolved
   synchronously from the in-memory directory (following `managerEmail` upward) — there is nothing
   left to fetch by the time a search box exists on screen.

---

## 4. Role matrix

| Who | What they see |
|---|---|
| Any authenticated employee (Employee, Admin, or Service Desk internal role — see `JwtInterceptor`) | The full screen — the whole company, since nothing here is scoped to "your chain" the way My Team is. |
| Signed in, but none of those internal roles | One warning alert (a 403 on the one request this screen makes). |
| Not signed in | Never reaches this screen — `AuthGuard` handles that upstream. |

There is no admin mode and no lead-only gate — this is not scoped by who reports to whom, unlike
My Team. `GET /employees/basic-info` is deliberately **not** restricted to `ADMIN_ROLE` the way most
of the people-app backend's other endpoints are (people-ops-suite PR #345) — any of the three
internal roles is enough.

---

## 5. API contract

One endpoint, on the people-app backend (`ONE_WSO2_PEOPLE_BACKEND_URL`). The bearer token carries
through the gateway to `x-jwt-assertion`, which the service's `JwtInterceptor` reads — same as every
other people-app request.

| Endpoint | Purpose | Notes for testing |
|---|---|---|
| `GET /employees/basic-info` | The full employee directory: every `Active` and `Marked leaver` employee, flat, each with their own `managerEmail`. | The only request this screen makes. Any of the three internal roles (Employee/Admin/Service Desk) is enough — see §4. Cached 5 minutes client-side. |

**Response shape** (`EmployeeDirectoryInfo` — see
`apps/people-app/backend/modules/database/types.bal` in people-ops-suite):

```
employeeId, firstName, lastName, workEmail, employeeThumbnail (nullable),
designation (optional — omitted, not null, when unset), jobBand (nullable),
startDate, managerEmail, businessUnit, team, subTeam (nullable), unit (nullable),
employmentType, company, workLocation, employeeStatus ("Active" | "Marked leaver")
```

`Left` employees are excluded entirely — this endpoint only returns people still employed. See §8
for what that means for `managerEmail` resolution.

Server messages are shown as-is where they exist; raw response bodies are never surfaced (see
`@api/errors`'s `describeError`).

---

## 6. Test checklist

Executable by hand.

### Loading and access

- [ ] With the backend URL unset, the not-connected notice appears and no requests are made.
- [ ] Signed in but without any internal role: one warning alert, not a broken page.
- [ ] The whole tree appears after exactly one request (check the network tab — `GET
      /employees/basic-info`, nothing else).

### The tree

- [ ] Expanding and collapsing any row, at any depth, fires **no** network request — the whole tree
      is already in memory.
- [ ] A manager with zero direct reports shows no chevron and no pill.
- [ ] The people whose `managerEmail` doesn't resolve to anyone in the directory (other than the
      Chairman) appear in their own section below the main tree, each with their own subtree intact.
- [ ] A person without a photo shows their initials, tinted by department.
- [ ] Hide interns removes intern rows below the root but never hides the root itself, even if the
      root happens to be an intern (edge case, deliberately not hidden — see the row component's
      comment).

### Search

- [ ] Searching a name or email finds the right person among 12 shown results.
- [ ] Picking a result expands every unopened ancestor level and scrolls to their row, without
      collapsing or losing any branch you already had open elsewhere in the tree — no request fires
      for this, ever.
- [ ] Picking a result under a stray root (§8) expands correctly from that stray, not the Chairman.

### Filters and view controls

- [ ] Selecting a department hides everyone who isn't a member of it or an ancestor on the path
      back to the Chairman (or a stray root) — including an ancestor's other children in unrelated
      departments.
- [ ] Selecting the same department again (or "Show all") restores the full tree.
- [ ] Selecting a different department while one is already active replaces the filter — only one
      department is ever isolated at a time.
- [ ] Searching and picking a result while a department filter is active clears the filter, so the
      result is never hidden by it.
- [ ] Expand all opens every row, main tree and stray sections alike; it fires no requests.
- [ ] Reset view collapses back to root + first level and clears both filters.

---

## 7. Deviations from the source app

| # | Change | Why |
|---|---|---|
| 1 | The whole interaction model changed: a collapsible indented outline replaces a pan/zoom SVG canvas (`react-d3-tree`). | At ~900+ employees, panning and zooming to find someone doesn't scale; an outline scans top-to-bottom like a file tree and needs no drag gesture to navigate. Requested directly, from a reference mockup, rather than discovered as a defect. |
| 2 | Collapse is non-destructive. Fetched data stays cached; there is no "remove employee" action. | The source app could only get a person out of view by deleting them from the loaded tree, which then required a fresh fetch to bring them back. Collapsing already achieves "out of my way" without the round trip. |
| 3 | "Hide interns" is a display filter, not a data mutation. | Same reasoning as #2 — the source app's "remove interns" permanently deleted them from the loaded tree. |
| 4 | Search expands the existing tree and scrolls to the result, instead of replacing the tree with the result as its new root. | The source app's search discarded everything you had expanded every time you picked someone. This keeps your place. |
| 5 | The "walk up to your manager" gesture (re-rooting the whole canvas around your manager) is gone — every ancestor down to the root is reachable by expanding, and search reaches anyone directly. | It was a workaround for the canvas only ever showing one path's ancestors at a time; an outline rooted at the top doesn't need it. |
| 6 | A department legend with click-to-isolate filtering, and stat tiles (headcount, department count), are new — the source app had neither. | From the reference mockup; there was no equivalent in the source app to deviate from. |
| 7 | Orientation toggle (vertical/horizontal) and the zoom slider are gone. | Both existed to make the canvas usable at all; a scrolling outline needs neither. |

---

## 8. Known data characteristics

Not backend defects this time — `/employees/basic-info` behaves consistently — but real shapes in
the data that `util/buildOrgTree.ts` has to account for. Confirmed against a live (staging) copy of
the `people_ops_suite` database, 909 rows at the time of writing.

1. **~27 employees have a `managerEmail` that doesn't resolve to anyone else in the directory** —
   not a data error; it's `Left` employees being excluded from this endpoint (§5), so anyone who
   still reports (on paper) to someone who has since left shows up as an orphan. Only one of these
   orphans is the actual company root (designation exactly `"Chairman"`); the rest become
   `strayRoots` in `buildOrgTree`'s output, rendered as their own top-level sections below the main
   tree instead of being silently dropped. See §3 rule 2, and the "stray" note in §2.4/§6.
2. **`designation` is optional on the wire, not nullable** — it's simply absent from the JSON for a
   row where it's unset, rather than sent as `null`. Code reading it must not assume the key exists.
3. **Nullable fields, per the schema: `employeeThumbnail`, `jobBand`, `subTeam`, `unit`.** Every
   other field, including `managerEmail`, is guaranteed present.
4. **No subtree-size or "has reports" hint from the backend** (no `subordinateCount` field at all,
   unlike the original org-chart backend's unreliable one) — unnecessary here, since the whole tree
   is in memory and a report count is just `children.length`.
