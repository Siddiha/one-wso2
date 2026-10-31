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
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@wso2/oxygen-ui";
import { useDebouncedValue } from "@hooks/useDebouncedValue";
import { describeError } from "../util/financeError";
import { money } from "../util/financeFormat";
import { useExpenseAppData, useExpenseClaims, useExpenseEmployees } from "../expense/useExpense";
import { useOpdClaims, useOpdEmployees, useOpdUserInfo } from "../opd/useOpd";
import { useExpenseSubsidiaries } from "../expense/dashboard/useExpenseDashboard";
import { opdStatusFilter, opdHasRole, OPD_ROLE } from "../opd/opdTypes";
import type { ApproverView, ExpenseClaim } from "../expense/expenseTypes";
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
  type ClaimKind,
} from "./claimSearch";
import { ClaimApprovalFilters } from "./ClaimApprovalFilters";
import { OpdApprovalReview } from "../opd/approvals/OpdApprovalReview";
import { byLongestWait, daysWaiting, waitingLabel, waitingSince } from "./claimWaiting";
import { ClaimGroupHeading, useCollapsedGroups } from "./ClaimGroupHeading";

// Everything waiting on the person looking, grouped by which app it came from.
//
// Grouped rather than merged into one table: an OPD claim is a set of medical
// bills checked against an annual limit, an expense claim is a set of lines with
// receipts and a stage. Merging them would mean one column set that fits
// neither, and an Amount column mixing currencies whose total means nothing.
//
// The expense group is itself one stage at a time for someone holding both —
// the same "As lead / As finance" toggle the Expense claims tab offers,
// rather than the two stages merged into one list with a per-row chip saying
// which is which.
//
// Longest wait first within each group, because the claim someone is chasing is
// the one to show first.

export default function NeedsYouTab() {
  const expenseAppData = useExpenseAppData();
  const opdUserInfo = useOpdUserInfo();

  const canLead = Boolean(expenseAppData.data?.enableLeadView);
  const canExpenseFinance = Boolean(expenseAppData.data?.enableFinanceView);
  const canOpd = opdHasRole(opdUserInfo.data, OPD_ROLE.FINANCE_APPROVER);
  const myEmail = expenseAppData.data?.userInfo?.workEmail ?? undefined;

  // Same toggle the Expense claims tab offers, for the same reason: someone
  // holding both flags decides one stage at a time, not a merged list. Opens
  // on whichever stage this person actually holds; someone with one flag
  // never sees the switch at all — there is nothing to switch to.
  //
  // Derived-with-override, the same as CcApprovePage's own `role`: `picked`
  // is null until someone chooses, and the default is computed fresh every
  // render rather than captured once. `canLead` reads false on the render
  // before expense app data has arrived — a plain `useState(canLead ? ... )`
  // would freeze on that false and never reconsider it once the data landed,
  // leaving a dual-role approver stuck on Finance.
  const [picked, setPicked] = useState<ApproverView | null>(null);
  const expenseStage: ApproverView = picked ?? (canLead ? "LEAD" : "FINANCE");
  // The toggle only exists for someone holding both expense flags — the same
  // condition it renders under below.
  const showsStageToggle = canLead && canExpenseFinance;
  // OPD has no lead stage to show: its only roles are CLAIM_SUBMITTER and
  // FINANCE_APPROVER (opdTypes.ts), and its statuses carry a single PENDING
  // rather than the PENDING_LEAD/PENDING_FINANCE split expense claims use.
  // So while the toggle is on As lead, OPD is not this reader's to decide and
  // is left out entirely, rather than sitting under a lead view labelled "you
  // decide as finance".
  //
  // Gated on the toggle being shown, not on the stage alone: someone who
  // leads expense claims without holding expense finance never sees a toggle,
  // so their stage is permanently "LEAD" — and if they hold OPD finance, that
  // queue is genuinely theirs with no switch to reach it by.
  const viewingAsLead = showsStageToggle && expenseStage === "LEAD";

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
  // Two copies: what the panel is editing, and what the queues are actually
  // reading. `employee` and `claimId` are query parameters, so applying on
  // every keystroke would start a request per character.
  const [draft, setDraft] = useState<ClaimApprovalDraftFilters>(EMPTY_CLAIM_FILTERS);
  const [applied, setApplied] = useState<ClaimApprovalDraftFilters>(EMPTY_CLAIM_FILTERS);
  const { employee, kind } = applied;
  // Outside the panel and applied live: it narrows rows already on screen, so
  // putting it behind Apply would make it slower than the list it cuts down.
  const [search, setSearch] = useState("");
  // Debounced before it reaches the queries: they key on the whole payload, so
  // the raw value would fire a search per keystroke.
  const claimIdFilter = useDebouncedValue(applied.claimId.trim());
  const ids = claimIdFilter ? [claimIdFilter] : undefined;

  // Two independent flags, so a person can be waiting on both stages at once.
  // `leadEmail` scopes the lead queue to their own reports; the finance queue is
  // company-wide and needs no scoping.
  const leadQueue = useExpenseClaims(
    { leadEmail: myEmail, status: ["PENDING_LEAD"], email: employee ?? undefined, ids },
    canLead && Boolean(myEmail),
  );
  const financeQueue = useExpenseClaims(
    { status: ["PENDING_FINANCE"], email: employee ?? undefined, ids },
    canExpenseFinance,
  );
  // opdStatusFilter adds PENDING_OLD: claims filed before the status was split
  // carry it, and asking for PENDING alone hides them from the queue entirely.
  const opdQueue = useOpdClaims(
    { status: opdStatusFilter(["PENDING"]), email: employee ?? undefined, ids },
    canOpd,
  );

  const [expenseTarget, setExpenseTarget] = useState<ExpenseClaim | null>(null);
  const [opdTarget, setOpdTarget] = useState<OpdClaim | null>(null);
  const { isCollapsed, toggleGroup } = useCollapsedGroups();

  // Only one claim type can appear on the lead stage, and someone without the
  // OPD role never sees OPD at all — so the type toggle is hidden in both
  // cases. A hidden control must stop narrowing, or a reader who picked "OPD
  // claims" and then switched to As lead would face an empty queue with no
  // visible filter to clear.
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

  const showsTypeFilter = canOpd && !viewingAsLead;
  const effectiveKind: ClaimKind = showsTypeFilter ? kind : "all";

  const expenseRows = useMemo(
    () =>
      showsKind(effectiveKind, "expense")
        ? byLongestWait(
            (expenseStage === "LEAD" ? (leadQueue.data ?? []) : (financeQueue.data ?? [])).filter(
              (claim) => matchesClaimSearch(claim, search, nameFor, entityFor) && matchesEntity(claim.employeeEmail),
            ),
            waitingSince,
          )
        : [],
    [expenseStage, leadQueue.data, financeQueue.data, effectiveKind, search, nameFor, entityFor, matchesEntity],
  );
  // Emptied rather than hidden at the render site, so the count behind
  // "Nothing is waiting on you" below follows from the same decision — a lead
  // with only OPD pending is waiting on nothing AS LEAD, and a total still
  // carrying those rows would claim otherwise while showing no list.
  const opdRows = useMemo(
    () =>
      viewingAsLead || !showsKind(effectiveKind, "opd")
        ? []
        : byLongestWait(
            (opdQueue.data ?? []).filter((claim) => matchesClaimSearch(claim, search, nameFor, entityFor) && matchesEntity(claim.employeeEmail)),
            waitingSince,
          ),
    [viewingAsLead, opdQueue.data, effectiveKind, search, nameFor, entityFor, matchesEntity],
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
  // otherwise blank the whole tab — the toggle and the filter fields
  // themselves included — losing focus mid-keystroke. Only identity/role
  // resolution gates the whole tab; a queue reloading after a filter change
  // shows its loading state in place of the list, below still-mounted
  // controls.
  const identityLoading = expenseAppData.isLoading || opdUserInfo.isLoading;
  const queuesLoading = leadQueue.isLoading || financeQueue.isLoading || opdQueue.isLoading;

  if (identityLoading) return null;

  // Opening an expense claim replaces this whole tab with the same review
  // screen Lead/Finance Approvals uses — the app's own decision, its own
  // amounts-in-full, its own print and activity trail — rather than a
  // shrunk-down copy in a dialog. Needs You has no tabs of its own, so
  // `pending` is always true: everything reaching this tab is, by
  // definition, still waiting on a decision.
  if (expenseTarget) {
    return (
      <ExpenseApprovalReview
        claim={expenseTarget}
        stage={expenseTarget.statusDetails.status === "PENDING_LEAD" ? "LEAD" : "FINANCE"}
        pending
        nameFor={nameFor}
        viewerEmail={myEmail}
        onBack={() => setExpenseTarget(null)}
        // Nothing to fade here, unlike the decided-tab UX this component also
        // serves: a claim just decided drops out of the PENDING queue on its
        // own once `useExpenseClaimStatus`'s onSuccess invalidates
        // ["expense-claims"], which both leadQueue and financeQueue key off.
        onDecided={() => {}}
      />
    );
  }

  // Same takeover for OPD, its own review screen in place of the dialog —
  // `useOpdClaims`'s own invalidation on `["opd-claims"]` is what drops a
  // decided claim out of the queue.
  if (opdTarget) {
    return (
      <OpdApprovalReview
        claim={opdTarget}
        pending
        onBack={() => setOpdTarget(null)}
        onDecided={() => {}}
      />
    );
  }

  // One queue failing must not blank the other: a finance approver whose OPD
  // backend is down still has expense claims to get through.
  const failures = [
  // The two calls that decide WHICH queues run belong here too. When either
  // fails its flags read false, so the queues are disabled rather than failing
  // — and a disabled query reports no error. Without these the screen would
  // tell an approver nothing is waiting when nothing had loaded.
    expenseAppData.isError ? describeError(expenseAppData.error) : null,
    opdUserInfo.isError ? describeError(opdUserInfo.error) : null,
    // `canLead` alone is not enough to run the lead queue — it also needs
    // `myEmail` to scope to this person's own reports. A required TypeScript
    // field is not a runtime guarantee: `userInfo` can come back without a
    // `workEmail`, silently disabling the query rather than failing it, which
    // reads as "nothing waiting" for someone who genuinely holds the role.
    canLead && !myEmail
      ? "Your account is missing a work email, so your lead queue can't be scoped to your reports."
      : null,
    leadQueue.isError ? describeError(leadQueue.error) : null,
    financeQueue.isError ? describeError(financeQueue.error) : null,
    opdQueue.isError ? describeError(opdQueue.error) : null,
  ].filter(Boolean);

  const total = expenseRows.length + opdRows.length;

  return (
    <Box>
      {failures.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Some queues couldn&apos;t be loaded. {failures[0]}
        </Alert>
      )}

      {showsStageToggle && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={expenseStage}
          onChange={(_e, v) => v && setPicked(v as ApproverView)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="LEAD" sx={{ textTransform: "none" }}>
            As lead
          </ToggleButton>
          <ToggleButton value="FINANCE" sx={{ textTransform: "none" }}>
            As finance
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {/* The Expense dashboard's Advanced Filter, same shape: one button, a
          popover, a draft that only lands on Apply. Search sits beside it
          rather than inside, because it is instant and would be spoiled by a
          click. */}
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


      {/* A Skeleton here, unlike `identityLoading` above: that one guards the
          WHOLE tab, flipping between "tabs" and "nothing" as identity
          resolves, so a skeleton there is one more thing to blink on the way
          to a final answer. This one guards only the list rows below
          still-mounted tabs and filters, whose shape never changes between a
          fresh load and a filter change — so with nothing here, a page load
          and "nothing is waiting on you" looked identical. */}
      {queuesLoading ? (
        <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 1.5 }} />
      ) : total === 0 && failures.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 3 }}>
          {hasActiveClaimFilters(applied) || search
            ? "No claims match these filters."
            : "Nothing is waiting on you."}
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableBody>
              {opdRows.length > 0 && (
                <ClaimGroupHeading
                  label="OPD claims"
                  count={opdRows.length}
                  note="you decide as finance"
                  colSpan={6}
                  collapsed={isCollapsed("opd")}
                  onToggle={() => toggleGroup("opd")}
                />
              )}
              {!isCollapsed("opd") && opdRows.map((claim) => (
                <TableRow key={claim.id} hover>
                  <IdCell id={claim.id} />
                  <WhoCell email={claim.employeeEmail} />
                  <WaitCell since={waitingSince(claim)} />
                  <AmountCell amount={claim.totalAmount} currency="LKR" />
                  <TableCell sx={CELL}>
                    {claim.transactions.length} bill{claim.transactions.length === 1 ? "" : "s"}
                  </TableCell>
                  <ReviewCell onClick={() => setOpdTarget(claim)} />
                </TableRow>
              ))}

              {expenseRows.length > 0 && (
                <ClaimGroupHeading
                  label="Expense claims"
                  count={expenseRows.length}
                  note={`you decide as ${expenseStage === "LEAD" ? "lead" : "finance"}`}
                  colSpan={6}
                  collapsed={isCollapsed("expense")}
                  onToggle={() => toggleGroup("expense")}
                />
              )}
              {!isCollapsed("expense") && expenseRows.map((claim) => (
                <TableRow key={claim.id} hover>
                  <IdCell id={claim.id} />
                  <WhoCell email={claim.employeeEmail} />
                  <WaitCell since={waitingSince(claim)} />
                  <AmountCell amount={claim.totalAmount} currency={claim.currencyCode ?? "LKR"} />
                  <TableCell sx={CELL}>
                    {claim.transactions.length} item{claim.transactions.length === 1 ? "" : "s"}
                  </TableCell>
                  <ReviewCell onClick={() => setExpenseTarget(claim)} />
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

function IdCell({ id }: { id: string }) {
  return <TableCell sx={{ ...CELL, fontWeight: 600 }}>{id}</TableCell>;
}

function WhoCell({ email }: { email: string }) {
  return <TableCell sx={CELL}>{email}</TableCell>;
}

function WaitCell({ since }: { since: string }) {
  const days = daysWaiting(since);
  return (
    <TableCell sx={{ ...CELL, color: days >= 7 ? "error.main" : undefined }}>
      {waitingLabel(days)}
    </TableCell>
  );
}

function AmountCell({ amount, currency }: { amount: number; currency: string }) {
  return (
    <TableCell align="right" sx={CELL}>
      {money(amount, currency)}
    </TableCell>
  );
}

function ReviewCell({ onClick }: { onClick: () => void }) {
  return (
    <TableCell align="right">
      <Button size="small" variant="contained" onClick={onClick} sx={{ textTransform: "none" }}>
        Review
      </Button>
    </TableCell>
  );
}
