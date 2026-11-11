// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  GlobalStyles,
  LinearProgress,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@wso2/oxygen-ui";
import { DownloadIcon } from "@wso2/oxygen-ui-icons-react";
import { isExpenseBackendConfigured } from "@config/apiConfig";
import ErrorNotice from "@components/error-notice/ErrorNotice";
import { FINANCE_EYEBROW } from "@constants/financeApps";
import FinanceShell from "../../components/FinanceShell";
import { money } from "../../util/financeFormat";
import { useExpenseAppData, useExpenseEmployees } from "../useExpense";
import { useExpenseClaimsReport, useExpenseDashboardTypes, useExpenseSubsidiaries } from "./useExpenseDashboard";
import { DashboardPanel } from "../../components/DashboardPanel";
import { expenseStatusMeta } from "../../components/FinanceChips";
import { ExpenseStatTile } from "./ExpenseDashboardParts";
import { ExpenseDashboardFilters, type ExpenseDashboardDraftFilters } from "./ExpenseDashboardFilters";
import { ExpenseEntityBreakdownTable } from "./ExpenseEntityBreakdownTable";
import { ExpenseMonthlyBreakdownTable } from "./ExpenseMonthlyBreakdownTable";
import { ExpenseEmployeeBreakdownTable } from "./ExpenseEmployeeBreakdownTable";
import { downloadExpenseReportCsv } from "./exportExpenseReportCsv";
import {
  ALL_CATEGORIES,
  ALL_EMPLOYEES,
  ALL_ENTITIES,
  ALL_REGIONS,
  ALL_STATUSES,
  getCategoryOptions,
  getEmployeeOptions,
  getEntityCodeForLabel,
  getEntityLabel,
  getExpenseTypeIdsForCategory,
  getPeriodRange,
} from "./expenseDashboardUtils";
import { EXPENSE_FILTERABLE_STATUSES } from "../expenseTypes";

const BREAKDOWN_TABS = ["Business Entity", "Monthly", "Employee"] as const;
type BreakdownTab = (typeof BREAKDOWN_TABS)[number];

// Custom starts on the current quarter, so its From and To fields are filled
// from the first render rather than blank.
const DEFAULT_CUSTOM_RANGE = getPeriodRange("Quarterly");
// The opening period is bounded rather than "All Time". An open-ended report
// makes the backend pull every claim ever filed — up to its 10,000 cap — and
// sum them in memory, which is the whole of the first-load wait finance
// reported. "All Time" stays in the dropdown for anyone who wants it; it is
// just no longer what the screen asks for before being asked.
const DEFAULT_PERIOD = "Quarterly" as const;
const DEFAULT_FILTERS: ExpenseDashboardDraftFilters = {
  period: DEFAULT_PERIOD,
  entity: ALL_ENTITIES,
  region: ALL_REGIONS,
  category: ALL_CATEGORIES,
  employee: ALL_EMPLOYEES,
  status: ALL_STATUSES,
  startDate: DEFAULT_CUSTOM_RANGE.startDate ?? "",
  endDate: DEFAULT_CUSTOM_RANGE.endDate,
};

/**
 * Finance → Overview → Expense Claims. Shows the org-wide claims report: the
 * filters, the three summary tiles, the status breakdown, the three breakdown
 * tables behind their tabs, and the CSV export. The filters sit in an
 * Advanced Filter popover; the rest is built from Oxygen UI components.
 *
 * Visible to finance readers only: gated on `enableFinanceView` from
 * `/app-data`, the same flag that gates the other finance screens. The report
 * endpoint enforces the same rule on its side, so the screen needs no separate
 * permission check.
 */
export default function ExpenseDashboardScreen({ headerActions }: { headerActions?: ReactNode } = {}) {
  return (
    <FinanceShell
      eyebrow={FINANCE_EYEBROW.expense}
      title="Expense Claims Dashboard"
      subtitle="Claim volume and value across the company, filterable by period, entity, region, category and status."
      configured={isExpenseBackendConfigured()}
      configKey="ONE_WSO2_EXPENSE_CLAIMS_BACKEND_URL"
      actions={headerActions}
      fill
    >
      <DashboardBody />
    </FinanceShell>
  );
}

// The dashboard sits inside the app shell, so the browser's print would take
// the whole app with it. While printing, hide everything except the report,
// and let the report take the full page height rather than its scroll area.
const PRINT_STYLES = (
  <GlobalStyles
    styles={{
      "@media print": {
        "body *": { visibility: "hidden" },
        "#expense-dashboard-report, #expense-dashboard-report *": { visibility: "visible" },
        "#expense-dashboard-report": {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          overflow: "visible",
        },
      },
    }}
  />
);

function DashboardBody() {
  const appData = useExpenseAppData();
  // Reference lists and the report are only requested once the role is known,
  // so a reader without it never fires requests the screen then refuses to show.
  const hasFinanceView = appData.data?.enableFinanceView === true;
  const subsidiaries = useExpenseSubsidiaries(hasFinanceView);
  const expenseTypes = useExpenseDashboardTypes(hasFinanceView);
  const employees = useExpenseEmployees(hasFinanceView);

  // `draft` is what the filter bar shows; `applied` is what the current
  // report was fetched with. Keeping them apart is what lets the bar require
  // an explicit Apply instead of firing a request on every dropdown change.
  const [draft, setDraft] = useState<ExpenseDashboardDraftFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<ExpenseDashboardDraftFilters>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState<BreakdownTab>("Business Entity");
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);

  // Resolved to primitives so the report query is not keyed on the
  // subsidiary/expense-type arrays, which load asynchronously and would
  // otherwise re-trigger the report request each time one of them resolves.
  const businessEntity = useMemo(
    () =>
      applied.entity === ALL_ENTITIES ? undefined : getEntityCodeForLabel(applied.entity, subsidiaries.data ?? []),
    [applied.entity, subsidiaries.data],
  );
  const expenseTypeIds = useMemo(
    () => getExpenseTypeIdsForCategory(applied.category, expenseTypes.data ?? []),
    [applied.category, expenseTypes.data],
  );
  const { startDate, endDate } = getPeriodRange(applied.period, {
    startDate: applied.startDate,
    endDate: applied.endDate,
  });

  const report = useExpenseClaimsReport(
    {
      startDate,
      endDate,
      businessEntity,
      expenseTypeIds,
      status: applied.status === ALL_STATUSES ? undefined : applied.status,
      salesRegion: applied.region === ALL_REGIONS ? undefined : applied.region,
      employeeEmail: applied.employee === ALL_EMPLOYEES ? undefined : applied.employee,
    },
    hasFinanceView,
  );

  const isDirty = (Object.keys(draft) as (keyof ExpenseDashboardDraftFilters)[]).some(
    (key) => draft[key] !== applied[key],
  );
  const hasActiveFilters =
    (Object.keys(applied) as (keyof ExpenseDashboardDraftFilters)[]).some(
      (key) => applied[key] !== DEFAULT_FILTERS[key],
    ) ||
    isDirty;
  const isCustomPeriod = draft.period === "Custom";
  const isRangeInvalid =
    isCustomPeriod && (!draft.startDate || !draft.endDate || draft.startDate > draft.endDate);

  const handleClearAll = () => {
    setDraft(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  };

  if (appData.isLoading) {
    return (
      <Stack spacing={2}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={80} />
        ))}
      </Stack>
    );
  }

  // `!isLoading && !isError`, not `isSuccess`: a query disabled because its
  // backend is not configured in this environment sits at `isPending: true`
  // forever with `isSuccess` permanently false — gating on `isSuccess` alone
  // would fall through this refusal and leave a blank screen with nothing
  // saying why. `isError` is excluded for the usual reason: a failed lookup
  // is not the same answer as "no role", and refusing a finance approver
  // because a request merely failed is worse than the retry below.
  if (!appData.isLoading && !appData.isError && !appData.data?.enableFinanceView) {
    return (
      <Alert severity="info">
        The expense claims dashboard is limited to the finance team who review these claims.
      </Alert>
    );
  }

  if (appData.isError) {
    return (
      <ErrorNotice error={appData.error} onRetry={() => void appData.refetch()} retrying={appData.isFetching}>
        Couldn&apos;t load the expense claims dashboard.
      </ErrorNotice>
    );
  }

  const currency = report.data?.reportingCurrency ?? appData.data?.currencyCode ?? "USD";
  const categoryOptions = getCategoryOptions(expenseTypes.data ?? []);
  const entityOptions = (subsidiaries.data ?? []).map((s) => getEntityLabel(s, subsidiaries.data ?? []));
  const regionOptions = report.data?.availableSalesRegions ?? [];
  // Filtered on by email, which is unique, and shown by name, which is not. The list
  // is the active directory rather than the report's own employees, so every name is
  // there to pick from before a period has been applied.
  const selectableEmployees = getEmployeeOptions(employees.data ?? [], report.data?.availableEmployees ?? []);
  const employeeNamesByEmail = new Map(selectableEmployees.map((e) => [e.employeeEmail, e.employeeName]));
  const draftedEmployee = draft.employee;
  const employeeOptions = selectableEmployees.map((employee) => employee.employeeEmail);
  // A selected value missing from the options renders the field blank, so an employee
  // the directory no longer offers is carried anyway, labelled by their email.
  if (draftedEmployee !== ALL_EMPLOYEES && !employeeNamesByEmail.has(draftedEmployee)) {
    employeeOptions.push(draftedEmployee);
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {PRINT_STYLES}
      <ExpenseDashboardFilters
        draft={draft}
        onDraftChange={setDraft}
        isDirty={isDirty}
        isRangeInvalid={isRangeInvalid}
        hasActiveFilters={hasActiveFilters}
        entityOptions={entityOptions}
        regionOptions={regionOptions}
        categoryOptions={categoryOptions}
        employeeOptions={employeeOptions}
        employeeLabel={(email) => employeeNamesByEmail.get(email) ?? email}
        statusOptions={EXPENSE_FILTERABLE_STATUSES}
        statusLabel={(status) => expenseStatusMeta(status).label}
        onApply={() => setApplied(draft)}
        onClear={handleClearAll}
      />

      {report.isFetching && <LinearProgress sx={{ mb: 2 }} />}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {report.isError && (
          <ErrorNotice error={report.error} onRetry={() => void report.refetch()} retrying={report.isFetching}>
            Couldn&apos;t load the dashboard.
          </ErrorNotice>
        )}

        {!report.isError && report.data && report.data.current.claimCount === 0 && (
          <Typography sx={{ fontSize: 14, color: "text.secondary", py: 2.5 }}>
            No claims match the selected filters for {applied.period.toLowerCase()}. Try a different business
            entity, period, or clear a filter.
          </Typography>
        )}

        {!report.isError && report.data && report.data.current.claimCount > 0 && (
          <Stack id="expense-dashboard-report" spacing={3}>
            <Typography sx={{ display: "none", "@media print": { display: "block", fontSize: 18, fontWeight: 700 } }}>
              Expense Claims Dashboard · {applied.period}
            </Typography>
            {/* Three across on a wide screen, two on a tablet, stacked on a
                phone — the same breakpoints `OpdDashboardScreen` draws its
                own stat row with. */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" },
                gap: 2,
              }}
            >
              <ExpenseStatTile
                label="Claim Count"
                value={report.data.current.claimCount.toLocaleString("en-US")}
                changePercentage={report.data.claimCountChangePercentage}
              />
              <ExpenseStatTile
                label="Total Value"
                value={money(report.data.current.totalValue, currency)}
                changePercentage={report.data.totalValueChangePercentage}
              />
              <ExpenseStatTile
                label="Average Claim Value"
                value={money(report.data.current.averageClaimValue, currency)}
                changePercentage={report.data.averageClaimValueChangePercentage}
              />
            </Box>

            <DashboardPanel title="Claims by Status">
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" },
                  gap: 2,
                }}
              >
                {report.data.statusBreakdown.map((item) => (
                  <ExpenseStatTile
                    key={item.status}
                    label={expenseStatusMeta(item.status).label}
                    value={item.count.toLocaleString("en-US")}
                    caption={`Avg ${item.averageDaysPending} days`}
                  />
                ))}
              </Box>
            </DashboardPanel>

            <Box sx={{ pr: 1 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
                <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v as BreakdownTab)}>
                  {BREAKDOWN_TABS.map((tab) => (
                    <Tab key={tab} label={tab} value={tab} sx={{ textTransform: "none" }} />
                  ))}
                </Tabs>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon size={16} />}
                  onClick={(e) => setExportAnchor(e.currentTarget)}
                  // Held back while the report on screen is still the previous
                  // filter's. The heading, the caption and the CSV's own title all
                  // read the newly applied period, so exporting mid-load would
                  // hand finance a file labelled one period and filled with
                  // another's figures. Covers Print too: both live in this menu.
                  disabled={report.isPlaceholderData}
                  sx={{ textTransform: "none" }}
                >
                  Export
                </Button>
                <Menu
                  anchorEl={exportAnchor}
                  open={Boolean(exportAnchor)}
                  onClose={() => setExportAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    onClick={() => {
                      downloadExpenseReportCsv(report.data!, applied.period);
                      setExportAnchor(null);
                    }}
                  >
                    Download as CSV
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setExportAnchor(null);
                      window.print();
                    }}
                  >
                    Print
                  </MenuItem>
                </Menu>
              </Stack>

              <Typography sx={{ fontSize: 13, color: "text.secondary", py: 1.5 }}>
                {applied.period}
                {activeTab === "Business Entity" && `, ${applied.entity === ALL_ENTITIES ? "all entities" : applied.entity}`}
                {` · all amounts in ${currency}`}
              </Typography>

              <Box sx={{ overflowX: "auto" }}>
                {activeTab === "Business Entity" && (
                  <ExpenseEntityBreakdownTable items={report.data.entityBreakdown} currency={currency} />
                )}
                {activeTab === "Monthly" && (
                  <ExpenseMonthlyBreakdownTable
                    expenseTypeColumns={report.data.expenseTypeColumns}
                    items={report.data.monthlyBreakdown}
                    currency={currency}
                  />
                )}
                {activeTab === "Employee" && (
                  <ExpenseEmployeeBreakdownTable items={report.data.employeeBreakdown} currency={currency} />
                )}
              </Box>
            </Box>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
