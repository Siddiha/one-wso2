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

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Card,
  Collapse,
  IconButton,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { ArrowUpRightIcon, ChevronDownIcon, ChevronUpIcon, MailIcon } from "@wso2/oxygen-ui-icons-react";
import { isCcBackendConfigured } from "@config/apiConfig";
import { useNotifications } from "@context/notifications/NotificationsContext";
import FinanceShell from "../../components/FinanceShell";
import { describeError } from "../../util/financeError";
import { wholeAmount } from "../../util/financeFormat";
import {
  useCcCardHolderCompliance,
  useCcManagerCompliance,
  useCcSubmittedByCategory,
  useCcTransactionSummary,
  useCcUserInfo,
} from "../useCc";
import {
  ccHasAccess,
  type CcAgeBucketAmount,
  type CcCardHolderCompliance,
  type CcManagerCompliance,
} from "../ccTypes";
import {
  CC_BREAKDOWN_MONTHS,
  CC_GRANULARITIES,
  CC_SUMMARY_PERIODS,
  asOfDate,
  breakdownDateRange,
  buildBreakdown,
  buildManagerReminderMailto,
  reportingWindowLabel,
  summarizeTeamUnsubmitted,
  summaryDateFrom,
  type CcGranularity,
  type CcSummaryPeriod,
} from "../ccDashboard";
import { FINANCE_EYEBROW } from "@constants/financeApps";
import { CcLeadOverviewTable, CcLeadTeamTable, CcLeadTeamUnsubmittedTable } from "../CcLeadViewTables";
import { useCcLeadApprovalSummary, useCcLeadTeamCardHolders, useCcLeadTeamUnsubmittedSummary } from "../useCc";
import type { CcLeadApprovalSummary } from "../ccTypes";
import { ccPaths } from "../ccPaths";

// Ported from view/dashboard/. The figures are aggregated in the database — the
// screen only picks the window to scope them to.
//
// index.tsx:44 — every amount on this screen is USD, as a constant.
const CURRENCY = "USD";

/** index.tsx:79 — the three ways this screen can be scoped. */
type CcViewMode = "admin" | "employee" | "lead";

/** The lead whose team is being read, in Lead view. */
interface PickedLead {
  leadEmail: string;
  leadName: string;
}

export default function CcDashboardPage({ headerActions }: { headerActions?: ReactNode } = {}) {
  return (
    <FinanceShell
      eyebrow={FINANCE_EYEBROW.cc}
      title="Credit Card Submitter Dashboard"
      subtitle="What is still unsubmitted, how long it has been sitting there, and what has been claimed by category."
      configured={isCcBackendConfigured()}
      configKey="ONE_WSO2_CC_EXPENSES_BACKEND_URL"
      actions={headerActions}
    >
      <DashboardBody />
    </FinanceShell>
  );
}

function DashboardBody() {
  const navigate = useNavigate();
  const userInfo = useCcUserInfo();
  const isFinanceUser = ccHasAccess(userInfo.data, "finance");
  const isLeadUser = ccHasAccess(userInfo.data, "lead");
  const isAdminEligible = isLeadUser || isFinanceUser;

  const [period, setPeriod] = useState<CcSummaryPeriod>("allTime");
  const [granularity, setGranularity] = useState<CcGranularity>("monthly");
  // Admin view's "Group by" toggle on the compliance table — cardHolderCompliance
  // and manager-compliance-summary are the same backlog, rolled up two ways.
  const [complianceGroupBy, setComplianceGroupBy] = useState<"cardHolder" | "manager">("cardHolder");
  // index.tsx:79-83 — the view you land on follows the role you hold: finance
  // opens on the company-wide picture, a lead on their own queue, everyone else
  // on their own cards.
  const [viewMode, setViewMode] = useState<CcViewMode>(() =>
    isFinanceUser ? "admin" : isLeadUser ? "lead" : "employee",
  );

  const showLeadView = (isFinanceUser || isLeadUser) && viewMode === "lead";
  // Only finance chooses a lead; a lead IS the lead, so they skip the picker.
  const showAllLeadsOverview = showLeadView && isFinanceUser;
  const [selectedLead, setSelectedLead] = useState<PickedLead | null>(null);

  // A lead looking at their own queue is already "selected" — there is no list
  // for them to pick from. Derived rather than stored in an effect, so the two
  // can never disagree for a render.
  const viewingLead: PickedLead | null =
    showLeadView && !isFinanceUser && isLeadUser && userInfo.data?.workEmail
      ? { leadEmail: userInfo.data.workEmail, leadName: userInfo.data.workEmail }
      : selectedLead;

  const showTeam = showLeadView && Boolean(viewingLead);
  const ownedCardsOnly = isAdminEligible && viewMode === "employee";
  const showCompliance = isAdminEligible && viewMode === "admin";

  const leads = useCcLeadApprovalSummary(showAllLeadsOverview && !viewingLead);
  const teamCardHolders = useCcLeadTeamCardHolders(showTeam ? viewingLead?.leadEmail : undefined);
  const teamUnsubmitted = useCcLeadTeamUnsubmittedSummary(showTeam ? viewingLead?.leadEmail : undefined);

  const dateFrom = summaryDateFrom(period);
  // In Lead view the same two endpoints answer for one lead's team instead of
  // for you or for everybody — index.tsx:105-127.
  const teamEmail = showTeam ? viewingLead?.leadEmail : undefined;
  const summary = useCcTransactionSummary(dateFrom, ownedCardsOnly, teamEmail);
  const range = useMemo(() => breakdownDateRange(), []);
  const byCategory = useCcSubmittedByCategory(range, ownedCardsOnly, teamEmail);
  const compliance = useCcCardHolderCompliance(
    dateFrom,
    ownedCardsOnly,
    showCompliance,
  );
  const managerCompliance = useCcManagerCompliance(
    dateFrom,
    showCompliance && complianceGroupBy === "manager",
  );

  const breakdown = useMemo(
    () => buildBreakdown(byCategory.data ?? [], granularity),
    [byCategory.data, granularity],
  );

  // Total/count tiles are summed from the already-fetched card-holder rows
  // (CcLeadViewTables.tsx); the age-bucket $ values come from their own call,
  // since the rows only carry bucket counts, not amounts.
  const unsubmittedTotals = useMemo(
    () => summarizeTeamUnsubmitted(teamCardHolders.data ?? [], teamUnsubmitted.data),
    [teamCardHolders.data, teamUnsubmitted.data],
  );

  // The same rows also include card holders who have zero pending-approval
  // items but do have unsubmitted work (kept so the Unsubmitted table below
  // doesn't miss them). The Pending table, below, only cares about who
  // actually has something awaiting approval, so it filters those zero rows
  // back out rather than showing an all-dashes row for them.
  const pendingCardHolders = useMemo(
    () => (teamCardHolders.data ?? []).filter((holder) => holder.transactionCount > 0),
    [teamCardHolders.data],
  );

  if (userInfo.isLoading) {
    return (
      <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 1.5 }} />
    );
  }
  if (userInfo.isError) {
    return (
      <Alert severity="error">
        Couldn't load your card profile. {describeError(userInfo.error)}
      </Alert>
    );
  }

  const current = summary.data?.current;
  const buckets = Object.values(summary.data?.ageBuckets ?? {});

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "flex-end" }}
        spacing={1.5}
      >
        {/* :128-136 — the header states both windows the screen is showing. */}
        <Box>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            As of {asOfDate()}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Reporting window: {reportingWindowLabel()}
          </Typography>
        </Box>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ flexWrap: "wrap", rowGap: 1.5 }}
        >
          {isAdminEligible && (
            <Select
              size="small"
              value={viewMode}
              inputProps={{ "aria-label": "View" }}
              onChange={(e) => {
                setViewMode(e.target.value as CcViewMode);
                // Leaving Lead view drops the lead you were looking at, so
                // coming back starts at the list rather than mid-drill-down.
                setSelectedLead(null);
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="employee">Employee view</MenuItem>
              {/* :218 — a lead sees their own queue; finance sees everyone's. */}
              {(isFinanceUser || isLeadUser) && <MenuItem value="lead">Lead view</MenuItem>}
              {/* :219 — the company-wide view is finance's alone. */}
              {isFinanceUser && <MenuItem value="admin">Admin view</MenuItem>}
            </Select>
          )}
          {/* Scopes the four cards below; the category table has its own control. */}
          <Select
            size="small"
            value={period}
            inputProps={{ "aria-label": "Period" }}
            onChange={(e) => setPeriod(e.target.value as CcSummaryPeriod)}
            sx={{ minWidth: 160 }}
          >
            {CC_SUMMARY_PERIODS.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      </Stack>

      {/* index.tsx:88-91 — in Lead view the page is the lead's queue until a
          team is chosen; the summary cards below belong to whatever is in
          scope, so they wait for one. */}
      {showLeadView && !showTeam && (
        <>
          {leads.isError ? (
            <Alert severity="error">{describeError(leads.error)}</Alert>
          ) : leads.isLoading ? (
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1.5 }} />
          ) : (
            <CcLeadOverviewTable
              leads={leads.data ?? []}
              onSelect={(lead: CcLeadApprovalSummary) =>
                setSelectedLead({ leadEmail: lead.leadEmail, leadName: lead.leadName || lead.leadEmail })
              }
            />
          )}
        </>
      )}

      {/* Pending section: the approval-pending table and its four summary
          cards stay together, as one block. */}
      {showTeam && viewingLead && (
        <>
          {teamCardHolders.isError ? (
            <Alert severity="error">{describeError(teamCardHolders.error)}</Alert>
          ) : teamCardHolders.isLoading ? (
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1.5 }} />
          ) : (
            <CcLeadTeamTable
              leadName={viewingLead.leadName}
              cardHolders={pendingCardHolders}
              onBack={() => setSelectedLead(null)}
              // A lead has no all-leads table to return to; only finance does.
              canGoBack={isFinanceUser}
            />
          )}
        </>
      )}

      {/* Hidden while a lead is being chosen: the figures would be the whole
          company's, sitting under a table about one person's queue. */}
      {showLeadView && !showTeam ? null : summary.isError ? (
        <Alert severity="error">{describeError(summary.error)}</Alert>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
            alignItems: "stretch",
          }}
        >
          <Stat
            title="Total Amount Pending Submission"
            value={`${CURRENCY} ${wholeAmount(current?.amount ?? 0)}`}
            loading={summary.isLoading}
            linkTitle="New transaction"
            onLinkClick={() => navigate(ccPaths.newTransactions)}
          />
          <Stat
            title="Total Transactions Pending Submission"
            value={String(current?.count ?? 0)}
            loading={summary.isLoading}
          />
          <Stat
            title="Avg. Days Taken to Submit"
            value={
              current?.avgDaysToSubmit != null
                ? current.avgDaysToSubmit.toFixed(1)
                : "-"
            }
            unit="days"
            loading={summary.isLoading}
          />
          <PendingByAge
            buckets={buckets}
            loading={summary.isLoading}
          />
        </Box>
      )}

      {/* Unsubmitted section: work that never reached the approval queue at
          all, as its own block below the pending one — table first, then its
          own four summary cards, the same shape as the pending section above. */}
      {showTeam && viewingLead && (
        <>
          {teamCardHolders.isError ? (
            <Alert severity="error">{describeError(teamCardHolders.error)}</Alert>
          ) : teamCardHolders.isLoading ? (
            <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 1.5 }} />
          ) : (
            <CcLeadTeamUnsubmittedTable
              leadName={viewingLead.leadName}
              cardHolders={teamCardHolders.data ?? []}
            />
          )}
        </>
      )}

      {showTeam && (
        teamUnsubmitted.isError ? (
          <Alert severity="error">{describeError(teamUnsubmitted.error)}</Alert>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
              alignItems: "stretch",
            }}
          >
            <Stat
              title="Total Unsubmitted Amount"
              value={`${CURRENCY} ${wholeAmount(unsubmittedTotals.amount)}`}
              loading={teamCardHolders.isLoading}
            />
            <Stat
              title="Total Unsubmitted Transactions"
              value={String(unsubmittedTotals.count)}
              loading={teamCardHolders.isLoading}
            />
            <Stat
              title="Avg. Days Outstanding"
              value={
                unsubmittedTotals.avgDaysOutstanding != null
                  ? unsubmittedTotals.avgDaysOutstanding.toFixed(1)
                  : "-"
              }
              unit="days"
              loading={teamUnsubmitted.isLoading}
            />
            <PendingByAge
              title="Unsubmitted by Age"
              buckets={unsubmittedTotals.ageBuckets}
              loading={teamCardHolders.isLoading || teamUnsubmitted.isLoading}
            />
          </Box>
        )
      )}

      {showCompliance && (
        <ComplianceTable
          query={compliance}
          managerQuery={managerCompliance}
          groupBy={complianceGroupBy}
          onGroupByChange={setComplianceGroupBy}
        />
      )}

      <CategoryTable
        breakdown={breakdown}
        granularity={granularity}
        onGranularity={setGranularity}
        loading={byCategory.isLoading}
        error={byCategory.isError ? describeError(byCategory.error) : null}
      />
    </Stack>
  );
}

// ---- components -----------------------------------------------------------

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2.5, height: "100%" }}>
      {children}
    </Card>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{children}</Typography>
  );
}

function Note({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <Typography
      sx={{
        fontSize: 13,
        mt: 3,
        color: error ? "error.main" : "text.secondary",
      }}
    >
      {children}
    </Typography>
  );
}

function HeadCell({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <TableCell
      align={align}
      sx={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.05em",
        color: "text.secondary",
        whiteSpace: "nowrap",
        px: 1,
      }}
    >
      {children}
    </TableCell>
  );
}

function Cell({
  children,
  align,
  bold,
  alert,
}: {
  children: React.ReactNode;
  align?: "right";
  bold?: boolean;
  alert?: boolean;
}) {
  return (
    <TableCell
      align={align}
      sx={{
        fontSize: 12.5,
        fontVariantNumeric: "tabular-nums",
        fontWeight: bold ? 700 : 400,
        color: alert ? "error.main" : undefined,
        px: 1,
      }}
    >
      {children}
    </TableCell>
  );
}

function Stat({
  title,
  value,
  unit,
  loading,
  linkTitle,
  onLinkClick,
}: {
  title: string;
  value: string;
  unit?: string;
  loading: boolean;
  linkTitle?: string;
  onLinkClick?: () => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{ p: 2.5, position: "relative", height: "100%" }}
    >
      {onLinkClick && (
        <Tooltip title={linkTitle ?? ""}>
          <IconButton
            aria-label={linkTitle}
            onClick={onLinkClick}
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: "text.secondary",
            }}
          >
            <ArrowUpRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Typography
        sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary", pr: 4 }}
      >
        {title}
      </Typography>
      {loading ? (
        <Skeleton width={140} height={44} sx={{ mt: 1.5 }} />
      ) : (
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 2 }}>
          <Typography
            sx={{
              fontSize: 30,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </Typography>
          {unit && (
            <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
              {unit}
            </Typography>
          )}
        </Stack>
      )}
    </Card>
  );
}

function PendingByAge({
  title = "Pending by Age",
  buckets,
  loading,
}: {
  title?: string;
  buckets: CcAgeBucketAmount[];
  loading: boolean;
}) {
  return (
    <Panel>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        spacing={1}
      >
        <PanelTitle>
          {title}
          <br />
          (Value &amp; Count)
        </PanelTitle>
        <Typography
          sx={{ fontSize: 13, color: "text.secondary", whiteSpace: "nowrap" }}
        >
          As of {asOfDate()}
        </Typography>
      </Stack>
      {loading ? (
        <Skeleton
          variant="rectangular"
          height={110}
          sx={{ mt: 2, borderRadius: 1 }}
        />
      ) : (
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <HeadCell>AGE</HeadCell>
              <HeadCell align="right">COUNT</HeadCell>
              <HeadCell align="right">VALUE</HeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {buckets.map((b) => (
              <TableRow key={b.label}>
                <Cell>{b.label}</Cell>
                <Cell align="right">{b.count}</Cell>
                <Cell align="right">
                  {CURRENCY} {wholeAmount(b.amount)}
                </Cell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function ComplianceTable({
  query,
  managerQuery,
  groupBy,
  onGroupByChange,
}: {
  query: {
    data?: CcCardHolderCompliance[];
    isLoading: boolean;
    isError: boolean;
    error?: unknown;
  };
  managerQuery: {
    data?: CcManagerCompliance[];
    isLoading: boolean;
    isError: boolean;
    error?: unknown;
  };
  groupBy: "cardHolder" | "manager";
  onGroupByChange: (groupBy: "cardHolder" | "manager") => void;
}) {
  const items = query.data ?? [];
  // Client-side paging for the Card Holder view only — this list can run into
  // the hundreds, and loading/scrolling through all of it at once was the complaint.
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  // Clamped on every render, not synced via effect — if the data shrinks (a
  // refetch, or switching group-by and back), this self-corrects instead of
  // showing an empty page until something else triggers a reset.
  const maxPage = Math.max(0, Math.ceil(items.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, maxPage);
  const pagedItems = items.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);
  return (
    <Panel>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1.5}
        sx={{ flexWrap: "wrap", rowGap: 1 }}
      >
        <PanelTitle>Cardholders Details</PanelTitle>
        <Select
          size="small"
          value={groupBy}
          inputProps={{ "aria-label": "Group by" }}
          onChange={(e) => onGroupByChange(e.target.value as "cardHolder" | "manager")}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="cardHolder">Group by: Card Holder</MenuItem>
          <MenuItem value="manager">Group by: Reporting Manager</MenuItem>
        </Select>
      </Stack>

      {groupBy === "manager" ? (
        <ManagerComplianceTable query={managerQuery} />
      ) : query.isLoading ? (
        <Note>Loading card holder compliance summary...</Note>
      ) : query.isError ? (
        <Note error>
          Unable to load the card holder compliance summary — try refreshing the
          page.
        </Note>
      ) : items.length === 0 ? (
        <Note>No pending transactions for any card holder in this range.</Note>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ mt: 2, minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <HeadCell>CARD HOLDER</HeadCell>
                <HeadCell align="right">
                  TOTAL OUTSTANDING ({CURRENCY})
                </HeadCell>
                <HeadCell align="right"># TRANSACTIONS</HeadCell>
                <HeadCell align="right">AVG. DAYS TO SUBMIT</HeadCell>
                <HeadCell align="right">0-7D</HeadCell>
                <HeadCell align="right">8-14D</HeadCell>
                <HeadCell align="right">15-30D</HeadCell>
                <HeadCell align="right">30+D</HeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedItems.map((row) => (
                <TableRow key={row.employeeEmail} hover>
                  <Cell>{row.cardHolderName || row.employeeEmail}</Cell>
                  <Cell align="right">
                    {wholeAmount(row.outstandingAmount)}
                  </Cell>
                  <Cell align="right">{row.transactionCount}</Cell>
                  <Cell align="right">
                    {row.avgDaysToSubmit !== null
                      ? row.avgDaysToSubmit.toFixed(1)
                      : "-"}
                  </Cell>
                  <Cell align="right">{row.bucket0To7}</Cell>
                  <Cell align="right">{row.bucket8To14}</Cell>
                  {/* Anything over a fortnight old is called out in red. */}
                  <Cell align="right" alert={row.bucket15To30 > 0}>
                    {row.bucket15To30}
                  </Cell>
                  <Cell align="right" alert={row.bucket30Plus > 0}>
                    {row.bucket30Plus}
                  </Cell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={items.length}
            page={currentPage}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[15, 25, 50, 100]}
            onPageChange={(_, next) => setPage(next)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
            labelRowsPerPage="Rows per page"
          />
        </Box>
      )}
    </Panel>
  );
}

/**
 * "Group by: Reporting Manager" — the same backlog as the card-holder table,
 * rolled up under each report's manager, one row per manager that expands to
 * their individual reports. An unassigned manager (HRIS has no manager on
 * record for that card holder) still gets a row, labelled "Unassigned".
 */
function ManagerComplianceTable({
  query,
}: {
  query: {
    data?: CcManagerCompliance[];
    isLoading: boolean;
    isError: boolean;
    error?: unknown;
  };
}) {
  const items = query.data ?? [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  const { showError } = useNotifications();

  // Same client-side paging as the Card Holder view — a manager list can also
  // run long, and scrolling through all of it at once was the same complaint.
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const maxPage = Math.max(0, Math.ceil(items.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, maxPage);
  const pagedItems = items.slice(currentPage * rowsPerPage, currentPage * rowsPerPage + rowsPerPage);

  const emailReminder = (manager: CcManagerCompliance) => {
    // Opens in a new tab/window so the SPA itself never navigates away. Most
    // browsers hand this straight to the OS's mail client instead.
    const opened = window.open(buildManagerReminderMailto(manager, CURRENCY), "_blank");
    if (!opened) {
      showError("Unable to open your email client — check your browser's popup settings.");
    }
  };

  if (query.isLoading) return <Note>Loading manager compliance summary...</Note>;
  if (query.isError) {
    return (
      <Note error>
        Unable to load the manager compliance summary — try refreshing the page.
      </Note>
    );
  }
  if (items.length === 0) {
    return <Note>No pending transactions for any reporting manager in this range.</Note>;
  }

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small" sx={{ mt: 2 }}>
        <TableHead>
          <TableRow>
            <HeadCell>{""}</HeadCell>
            <HeadCell>REPORTING MANAGER</HeadCell>
            <HeadCell align="right">REPORTS</HeadCell>
            <HeadCell align="right">UNSUBMITTED ({CURRENCY})</HeadCell>
            <HeadCell align="right">TXNS</HeadCell>
            <HeadCell align="right">AVG DAYS</HeadCell>
            <HeadCell align="right">0-7D</HeadCell>
            <HeadCell align="right">8-14D</HeadCell>
            <HeadCell align="right">15-30D</HeadCell>
            <HeadCell align="right">30+D</HeadCell>
            <HeadCell>{""}</HeadCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pagedItems.map((manager) => {
            const key = manager.managerEmail || "unassigned";
            const isOpen = !!expanded[key];
            const isUnassigned = manager.managerEmail === "";
            return (
              <Fragment key={key}>
                <TableRow hover>
                  <Cell>
                    <IconButton
                      size="small"
                      aria-label={isOpen ? "Collapse reports" : "Expand reports"}
                      onClick={() => toggle(key)}
                    >
                      {isOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                    </IconButton>
                  </Cell>
                  <Cell bold>{manager.managerName || "Unassigned"}</Cell>
                  <Cell align="right">{manager.reportCount}</Cell>
                  <Cell align="right">{wholeAmount(manager.outstandingAmount)}</Cell>
                  <Cell align="right">{manager.transactionCount}</Cell>
                  <Cell align="right">{manager.avgPendingDays.toFixed(1)}</Cell>
                  <Cell align="right">{manager.bucket0To7}</Cell>
                  <Cell align="right">{manager.bucket8To14}</Cell>
                  <Cell align="right" alert={manager.bucket15To30 > 0}>
                    {manager.bucket15To30}
                  </Cell>
                  <Cell align="right" alert={manager.bucket30Plus > 0}>
                    {manager.bucket30Plus}
                  </Cell>
                  <Cell align="right">
                    <Tooltip title={isUnassigned ? "No reporting manager to remind" : "Email this manager a reminder"}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label="Email reminder"
                          disabled={isUnassigned}
                          onClick={() => emailReminder(manager)}
                          sx={{ p: 0.5 }}
                        >
                          <MailIcon size={14} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Cell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={11} sx={{ p: 0, border: 0 }}>
                    <Collapse in={isOpen} unmountOnExit>
                      <Table size="small" sx={{ mb: 1.5, ml: 5, width: "calc(100% - 40px)" }}>
                        <TableHead>
                          <TableRow>
                            <HeadCell>CARD HOLDER</HeadCell>
                            <HeadCell align="right">UNSUBMITTED ({CURRENCY})</HeadCell>
                            <HeadCell align="right">TXNS</HeadCell>
                            <HeadCell align="right">AVG DAYS</HeadCell>
                            <HeadCell align="right">0-7D</HeadCell>
                            <HeadCell align="right">8-14D</HeadCell>
                            <HeadCell align="right">15-30D</HeadCell>
                            <HeadCell align="right">30+D</HeadCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {manager.reports.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={8} sx={{ color: "text.secondary" }}>
                                No card holders report to this manager.
                              </TableCell>
                            </TableRow>
                          )}
                          {manager.reports.map((report) => (
                            <TableRow key={report.employeeEmail}>
                              <Cell>{report.cardHolderName || report.employeeEmail}</Cell>
                              <Cell align="right">{wholeAmount(report.outstandingAmount)}</Cell>
                              <Cell align="right">{report.transactionCount}</Cell>
                              <Cell align="right">
                                {report.avgDaysToSubmit !== null ? report.avgDaysToSubmit.toFixed(1) : "-"}
                              </Cell>
                              <Cell align="right">{report.bucket0To7}</Cell>
                              <Cell align="right">{report.bucket8To14}</Cell>
                              <Cell align="right" alert={report.bucket15To30 > 0}>
                                {report.bucket15To30}
                              </Cell>
                              <Cell align="right" alert={report.bucket30Plus > 0}>
                                {report.bucket30Plus}
                              </Cell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination
        component="div"
        count={items.length}
        page={currentPage}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[15, 25, 50, 100]}
        onPageChange={(_, next) => setPage(next)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(Number(event.target.value));
          setPage(0);
        }}
        labelRowsPerPage="Rows per page"
      />
    </Box>
  );
}

function CategoryTable({
  breakdown,
  granularity,
  onGranularity,
  loading,
  error,
}: {
  breakdown: ReturnType<typeof buildBreakdown>;
  granularity: CcGranularity;
  onGranularity: (g: CcGranularity) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Panel>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        spacing={1}
        sx={{ flexWrap: "wrap", rowGap: 1 }}
      >
        <Box>
          <PanelTitle>Submitted Expenses by Category</PanelTitle>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>
            Fully submitted amount ({CURRENCY}) by category, last{" "}
            {CC_BREAKDOWN_MONTHS} months
          </Typography>
        </Box>
        <Select
          size="small"
          value={granularity}
          inputProps={{ "aria-label": "Granularity" }}
          onChange={(e) => onGranularity(e.target.value as CcGranularity)}
          sx={{ minWidth: 150 }}
        >
          {CC_GRANULARITIES.map((g) => (
            <MenuItem key={g.value} value={g.value}>
              {g.label}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      {loading ? (
        <Skeleton
          variant="rectangular"
          height={160}
          sx={{ mt: 2, borderRadius: 1 }}
        />
      ) : error ? (
        <Note error>{error}</Note>
      ) : breakdown.rows.length === 0 ? (
        <Note>No expenses have been fully submitted yet.</Note>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ mt: 2, minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <HeadCell>CATEGORY</HeadCell>
                {breakdown.monthLabels.map((label) => (
                  <HeadCell key={label} align="right">
                    {label.toUpperCase()}
                  </HeadCell>
                ))}
                <HeadCell align="right">TOTAL</HeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {breakdown.rows.map((row) => (
                <TableRow key={row.category} hover>
                  <Cell>{row.category}</Cell>
                  {row.amounts.map((amount, i) => (
                    <Cell key={breakdown.monthLabels[i]} align="right">
                      {wholeAmount(amount)}
                    </Cell>
                  ))}
                  <Cell align="right" bold>
                    {wholeAmount(row.total)}
                  </Cell>
                </TableRow>
              ))}
              <TableRow>
                <Cell bold>Total</Cell>
                {breakdown.monthTotals.map((amount, i) => (
                  <Cell key={breakdown.monthLabels[i]} align="right" bold>
                    {wholeAmount(amount)}
                  </Cell>
                ))}
                <Cell align="right" bold>
                  {wholeAmount(breakdown.grandTotal)}
                </Cell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}
    </Panel>
  );
}
