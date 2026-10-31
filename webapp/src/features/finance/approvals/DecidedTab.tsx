/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { useDebouncedValue } from "@hooks/useDebouncedValue";
import { describeError } from "../util/financeError";
import { formatNice, money } from "../util/financeFormat";
import { useExpenseAppData, useExpenseClaims, useExpenseEmployees } from "../expense/useExpense";
import { useOpdClaims, useOpdEmployees, useOpdUserInfo } from "../opd/useOpd";
import { useExpenseSubsidiaries } from "../expense/dashboard/useExpenseDashboard";
import { OPD_ROLE, opdHasRole } from "../opd/opdTypes";
import type { ExpenseClaim } from "../expense/expenseTypes";
import type { OpdClaim } from "../opd/opdTypes";
import { ExpenseApprovalReview } from "../expense/approvals/ExpenseApprovalReview";
import { makeNameResolver } from "../expense/approvals/expenseApprovalTypes";
import {
  buildEntityOptions,
  EMPTY_CLAIM_FILTERS,
  hasActiveClaimFilters,
  matchesClaimSearch,
  showsKind,
  type ClaimApprovalDraftFilters,
} from "./claimSearch";
import { ClaimApprovalFilters } from "./ClaimApprovalFilters";
import { OpdApprovalReview } from "../opd/approvals/OpdApprovalReview";
import { ClaimGroupHeading, useCollapsedGroups } from "./ClaimGroupHeading";

// Claims in this person's scope that already have a decision.
//
// Called "Decided", not "Decided by you", and the distinction is the data's
// rather than a stylistic one: both DTOs record `financeApproverEmail`, so a
// finance decision can be attributed — but the lead side carries only
// `leadApprovedDate` and `leadRejectedDate`, with no lead approver. A lead's own
// decisions cannot be told from a co-lead's on the same card. Rows say who
// decided wherever the backend knows, and say nothing where it does not.

export default function DecidedTab() {
  const expenseAppData = useExpenseAppData();
  const opdUserInfo = useOpdUserInfo();

  const canLead = Boolean(expenseAppData.data?.enableLeadView);
  const canExpenseFinance = Boolean(expenseAppData.data?.enableFinanceView);
  const canOpd = opdHasRole(opdUserInfo.data, OPD_ROLE.FINANCE_APPROVER);
  const myEmail = expenseAppData.data?.userInfo?.workEmail ?? undefined;

  // For the review screen's name display — falls back to the bare email until
  // this arrives, same as the standalone Lead/Finance Approvals screens do.
  const employees = useExpenseEmployees();
  const nameFor = useMemo(() => makeNameResolver(employees.data), [employees.data]);
  // Also the "Filter by email" dropdown's options, merged with OPD's own
  // directory: an OPD claimant may never have touched expense claims, and the
  // other way round, so neither list alone would offer everyone this queue
  // could actually show.
  const opdEmployees = useOpdEmployees(canOpd);
  const employeeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(employees.data ?? []).map((e) => e.workEmail),
          ...(opdEmployees.data ?? []).map((e) => e.workEmail),
        ]),
      ),
    [employees.data, opdEmployees.data],
  );
  const employeesLoading = employees.isLoading || opdEmployees.isLoading;

  // Claimant -> legal entity. The HRIS calls it `company` and returns a
  // subsidiary CODE; the master data turns that into the legal name Finance
  // reads. Built from the expense directory alone: it is the one that carries
  // `company`, and an OPD-only claimant simply has no entity to filter on.
  const subsidiaries = useExpenseSubsidiaries();
  const entityByEmail = useMemo(
    () => new Map((employees.data ?? []).map((e) => [e.workEmail, e.company ?? ""])),
    [employees.data],
  );
  const entityOptions = useMemo(
    () => buildEntityOptions(entityByEmail.values(), subsidiaries.data),
    [entityByEmail, subsidiaries.data],
  );

  // FilterHolder.tsx-style narrowing: a claim of a known employee or id,
  // without which the only way to find one is to scroll the whole company's.
  // Same split as Needs You: a draft the panel edits, and the applied set the
  // queues read, because `employee` and `claimId` are query parameters.
  const [draft, setDraft] = useState<ClaimApprovalDraftFilters>(EMPTY_CLAIM_FILTERS);
  const [applied, setApplied] = useState<ClaimApprovalDraftFilters>(EMPTY_CLAIM_FILTERS);
  const { employee } = applied;
  const [search, setSearch] = useState("");
  // Debounced before it reaches the queries: they key on the whole payload, so
  // the raw value would fire a search per keystroke.
  const claimIdFilter = useDebouncedValue(applied.claimId.trim());
  const ids = claimIdFilter ? [claimIdFilter] : undefined;

  // A lead's decided queue is the claims they forwarded or turned down, so it is
  // scoped to their reports the same way their pending queue is.
  //
  // Someone holding BOTH flags gets a narrowed version rather than none. The
  // finance list below covers what they settled as finance and nothing else, so
  // a claim they only forwarded — still PENDING_FINANCE — or turned down as
  // lead was in neither query and simply vanished from Decided. The two status
  // lists are kept disjoint, or the same claim would appear twice.
  const leadDecided = useExpenseClaims(
    {
      leadEmail: myEmail,
      status: canExpenseFinance
        ? ["PENDING_FINANCE", "LEAD_REJECTED"]
        : ["PENDING_FINANCE", "APPROVED", "FINANCE_REJECTED", "LEAD_REJECTED"],
      email: employee ?? undefined,
      ids,
    },
    canLead && Boolean(myEmail),
  );
  const financeDecided = useExpenseClaims(
    { status: ["APPROVED", "FINANCE_REJECTED"], email: employee ?? undefined, ids },
    canExpenseFinance,
  );
  const opdDecided = useOpdClaims(
    { status: ["APPROVED", "REJECTED"], email: employee ?? undefined, ids },
    canOpd,
  );

  const [expenseTarget, setExpenseTarget] = useState<ExpenseClaim | null>(null);
  const [opdTarget, setOpdTarget] = useState<OpdClaim | null>(null);
  const { isCollapsed, toggleGroup } = useCollapsedGroups();
  // Splits this already-decided set by outcome, the same "Pending / Approved /
  // Rejected" tabs Claim Approval's OPD tab offers — minus Pending, since
  // nothing here is still pending by definition. A lead's forwarded claim
  // (PENDING_FINANCE) is not rejected, so it sorts under Approved alongside
  // the Outcome chip's own "Sent to finance" label — every decided row lands
  // in exactly one tab, none of them hidden.
  const [outcome, setOutcome] = useState<DecidedOutcome>("approved");

  // Someone without the OPD role never sees an OPD claim, so offering to filter
  // by type would be a dead choice — and a hidden control must stop narrowing,
  // or they would be stuck on "OPD claims" with nothing to clear it with.
  // An unset filter matches everything. A claimant the directory has no entry
  // for is NOT dropped when no entity is chosen, but cannot match a specific
  // one — there is nothing to match them on.
  // The entity LABEL for a claimant, so the search box matches the same words
  // the Entity dropdown shows ("WSO2 Lanka (Pvt) Ltd"), not the HRIS code.
  const entityFor = useCallback(
    (email: string) => {
      const code = entityByEmail.get(email);
      if (!code) return "";
      const option = entityOptions.find((o) => o.code === code);
      // Both, so the code still matches for anyone typing "WSO2 - SRI LANKA".
      return option ? `${option.label} ${code}` : code;
    },
    [entityByEmail, entityOptions],
  );

  const entityCode = applied.entityCode;
  const matchesEntity = useCallback(
    (email: string) => entityCode === "" || entityByEmail.get(email) === entityCode,
    [entityCode, entityByEmail],
  );

  const showsTypeFilter = canOpd;
  const effectiveKind = showsTypeFilter ? applied.kind : "all";

  const expenseRows = useMemo(
    () =>
      !showsKind(effectiveKind, "expense")
        ? []
        : [...(financeDecided.data ?? []), ...(leadDecided.data ?? [])].filter(
            (c) =>
              isRejectedOutcome(c.statusDetails.status) === (outcome === "rejected") &&
              matchesClaimSearch(c, search, nameFor, entityFor) && matchesEntity(c.employeeEmail),
          ),
    [financeDecided.data, leadDecided.data, outcome, effectiveKind, search, nameFor, entityFor, matchesEntity],
  );
  const opdRows = useMemo(
    () =>
      !showsKind(effectiveKind, "opd")
        ? []
        : (opdDecided.data ?? []).filter(
            (c) =>
              isRejectedOutcome(c.statusDetails.status) === (outcome === "rejected") &&
              matchesClaimSearch(c, search, nameFor, entityFor) && matchesEntity(c.employeeEmail),
          ),
    [opdDecided.data, outcome, effectiveKind, search, nameFor, entityFor, matchesEntity],
  );

  // `isLoading`, not `isPending`. React Query leaves a DISABLED query pending
  // for good — it never fetches, so it never resolves — and every queue here is
  // disabled for someone lacking that role. Waiting on `isPending` meant the
  // screen spun forever for anyone holding less than all three, which is most
  // people. `isLoading` is pending AND fetching, so a disabled query reads as
  // not loading, which is what it is.
  //
  // Split from the queues' own loading: `email`/`ids` are part of every query
  // KEY below, so typing a filter starts a brand new query and this would
  // otherwise blank the whole tab — the Approved/Rejected tabs and the filter
  // fields themselves included — losing focus mid-keystroke. Only
  // identity/role resolution gates the whole tab; a queue reloading after a
  // filter change shows its loading state in place of the list, below still-
  // mounted controls.
  const identityLoading = expenseAppData.isLoading || opdUserInfo.isLoading;
  const queuesLoading = leadDecided.isLoading || financeDecided.isLoading || opdDecided.isLoading;

  if (identityLoading) return null;

  // Same review screen Needs You opens, `pending={false}`: Approve/Reject are
  // replaced by the status chip, which opens the activity trail instead — the
  // decision already made, not offered again. `stage` still matters here even
  // read-only, because only it decides whether Print shows.
  if (expenseTarget) {
    const decidedAtFinance =
      expenseTarget.statusDetails.status === "APPROVED" ||
      expenseTarget.statusDetails.status === "FINANCE_REJECTED";
    return (
      <ExpenseApprovalReview
        claim={expenseTarget}
        stage={decidedAtFinance ? "FINANCE" : "LEAD"}
        pending={false}
        nameFor={nameFor}
        viewerEmail={myEmail}
        onBack={() => setExpenseTarget(null)}
        onDecided={() => {}}
      />
    );
  }

  // Same takeover for a decided OPD claim, `pending={false}` — the activity
  // trail rather than Approve/Reject.
  if (opdTarget) {
    return (
      <OpdApprovalReview
        claim={opdTarget}
        pending={false}
        onBack={() => setOpdTarget(null)}
        onDecided={() => {}}
      />
    );
  }

  const failure =
  // The two calls that decide WHICH queues run belong here too. When either
  // fails its flags read false, so the queues are disabled rather than failing
  // — and a disabled query reports no error. Without these the screen would
  // tell an approver nothing is waiting when nothing had loaded.
    (expenseAppData.isError && describeError(expenseAppData.error)) ||
    (opdUserInfo.isError && describeError(opdUserInfo.error)) ||
    // `canLead` alone is not enough to run the lead-decided query — it also
    // needs `myEmail` to scope to this person's own reports. A required
    // TypeScript field is not a runtime guarantee: `userInfo` can come back
    // without a `workEmail`, silently disabling the query rather than
    // failing it, which reads as "nothing decided" for someone who
    // genuinely holds the role.
    (canLead && !myEmail &&
      "Your account is missing a work email, so your lead queue can't be scoped to your reports.") ||
    (leadDecided.isError && describeError(leadDecided.error)) ||
    (financeDecided.isError && describeError(financeDecided.error)) ||
    (opdDecided.isError && describeError(opdDecided.error)) ||
    null;

  return (
    <Box>
      {failure && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Some queues couldn&apos;t be loaded. {failure}
        </Alert>
      )}

      <Tabs
        value={outcome}
        onChange={(_e, v) => setOutcome(v as DecidedOutcome)}
        sx={{ mb: 2, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none", fontSize: 13, fontWeight: 600 } }}
      >
        <Tab value="approved" label="Approved" />
        <Tab value="rejected" label="Rejected" />
      </Tabs>


      {/* Same Advanced Filter as Needs You and the Expense dashboard; search
          stays outside it, applied live. */}
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ mb: 2, flexWrap: "wrap", rowGap: 1.5 }}
      >
        <TextField
          size="small"
          label="Search"
          placeholder="Claim ID, name, email, entity or amount"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 320 }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <ClaimApprovalFilters
          draft={draft}
          applied={applied}
          onDraftChange={setDraft}
          onApply={() => setApplied(draft)}
          onClear={() => {
            setDraft(EMPTY_CLAIM_FILTERS);
            setApplied(EMPTY_CLAIM_FILTERS);
          }}
          employeeOptions={employeeOptions}
          employeesLoading={employeesLoading}
          showsKindFilter={showsTypeFilter}
          entityOptions={entityOptions}
        />
      </Stack>

      {/* "Nothing has been decided" is a claim about the data, so it is only
          made when the data actually arrived — a failure stands alone,
          saying both at once tells the reader two different things.
          A Skeleton here, unlike `identityLoading` above: that one guards
          the WHOLE tab, which flips between "tabs" and "nothing" as identity
          resolves, so a skeleton there would be one more thing to blink on
          the way to a final answer. This one guards only the list rows below
          still-mounted tabs and filters, whose shape never changes between a
          fresh page load and a filter change — so with nothing here, a page
          load and "nothing was ever decided" looked identical. */}
      {queuesLoading ? (
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1.5 }} />
      ) : expenseRows.length === 0 && opdRows.length === 0 ? (
        !failure && (
          <Typography sx={{ fontSize: 13, color: "text.secondary", py: 3 }}>
            {hasActiveClaimFilters(applied) || search
              ? "No claims match these filters."
              : `Nothing ${outcome} yet.`}
          </Typography>
        )
      ) : (
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableBody>
            {opdRows.length > 0 && (
              <ClaimGroupHeading
                label="OPD claims"
                count={opdRows.length}
                colSpan={7}
                collapsed={isCollapsed("opd")}
                onToggle={() => toggleGroup("opd")}
              />
            )}
            {!isCollapsed("opd") && opdRows.map((claim) => (
              <TableRow key={claim.id} hover>
                <TableCell sx={ID}>{claim.id}</TableCell>
                <TableCell sx={CELL}>{claim.employeeEmail}</TableCell>
                <TableCell sx={CELL}>
                  {decidedOn(claim.statusDetails.financeApprovedDate, claim.statusDetails.financeRejectedDate)}
                </TableCell>
                <TableCell align="right" sx={CELL}>{money(claim.totalAmount, "LKR")}</TableCell>
                <TableCell sx={CELL}>{claim.statusDetails.financeApproverEmail ?? "—"}</TableCell>
                <TableCell sx={CELL}>
                  <Outcome status={claim.statusDetails.status ?? null} />
                </TableCell>
                <ViewCell onClick={() => setOpdTarget(claim)} />
              </TableRow>
            ))}

            {expenseRows.length > 0 && (
              <ClaimGroupHeading
                label="Expense claims"
                count={expenseRows.length}
                colSpan={7}
                collapsed={isCollapsed("expense")}
                onToggle={() => toggleGroup("expense")}
              />
            )}
            {!isCollapsed("expense") && expenseRows.map((claim) => (
              <TableRow key={claim.id} hover>
                <TableCell sx={ID}>{claim.id}</TableCell>
                <TableCell sx={CELL}>{claim.employeeEmail}</TableCell>
                <TableCell sx={CELL}>
                  {decidedOn(
                    claim.statusDetails.financeApprovedDate ?? claim.statusDetails.leadApprovedDate,
                    claim.statusDetails.financeRejectedDate ?? claim.statusDetails.leadRejectedDate,
                  )}
                </TableCell>
                <TableCell align="right" sx={CELL}>
                  {money(claim.totalAmount, claim.currencyCode ?? "LKR")}
                </TableCell>
                {/* Blank for a lead-stage decision: the backend records no lead
                    approver, so naming one would be a guess. ALSO blank for a
                    lead-only viewer on a row finance decided: `leadDecided`
                    includes APPROVED/FINANCE_REJECTED for exactly that
                    person — claims they forwarded, that finance went on to
                    settle — so without this a lead with no finance role of
                    their own still saw which finance colleague decided it.
                    `canExpenseFinance` is the one thing that tells rows
                    apart here without tagging each one by its query: a
                    reader holding both roles stays able to see it, same as
                    today, because they are finance too, not only a lead. */}
                <TableCell sx={CELL}>
                  {canExpenseFinance ? (claim.statusDetails.financeApproverEmail ?? "—") : "—"}
                </TableCell>
                <TableCell sx={CELL}>
                  <Outcome status={claim.statusDetails.status} />
                </TableCell>
                <ViewCell onClick={() => setExpenseTarget(claim)} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      )}
    </Box>
  );
}

const CELL = { fontSize: 12.5, fontVariantNumeric: "tabular-nums" } as const;
const ID = { ...CELL, fontWeight: 600 } as const;

/**
 * Opens the record for one claim.
 *
 * A button in the row rather than an onClick on the row itself: a `<tr>` takes
 * no focus and answers no key, so the dialog was unreachable without a mouse.
 * Matches Needs you, whose rows have always been opened this way.
 */
function ViewCell({ onClick }: { onClick: () => void }) {
  return (
    <TableCell align="right">
      <Button size="small" variant="outlined" onClick={onClick} sx={{ textTransform: "none" }}>
        View
      </Button>
    </TableCell>
  );
}

function decidedOn(approved: string | null | undefined, rejected: string | null | undefined): string {
  const when = approved ?? rejected;
  return when ? formatNice(when) : "—";
}

type DecidedOutcome = "approved" | "rejected";

function isRejectedOutcome(status: string | null | undefined): boolean {
  return Boolean(status?.includes("REJECTED"));
}

function Outcome({ status }: { status: string | null }) {
  const rejected = isRejectedOutcome(status);
  const forwarded = status === "PENDING_FINANCE";
  return (
    <Chip
      size="small"
      color={rejected ? "error" : forwarded ? "default" : "success"}
      label={rejected ? "Rejected" : forwarded ? "Sent to finance" : "Approved"}
      sx={{ height: 18, fontSize: 10.5 }}
    />
  );
}
