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

// DTOs and enums for the expense-claims backend's responses.

export type ExpenseClaimStatus =
  | "PENDING_LEAD"
  | "LEAD_REJECTED"
  | "PENDING_FINANCE"
  | "APPROVED"
  | "FINANCE_REJECTED";

// The Lead and Finance approval screens are the same component parameterized
// by which stage the approver acts at.
export type ApproverView = "LEAD" | "FINANCE";

export interface ExpenseTravelData {
  jobNumber: string;
  customerName: string | null;
  engagementCode: string | null;
  country: string | null;
  productUnit: string | null;
  businessUnit: string | null;
}

/** `/employees` — used to put a name to the lead a claim is routed to. */
export interface ExpenseEmployee {
  firstName: string | null;
  lastName: string | null;
  workEmail: string;
  employeeThumbnail: string | null;
  /** The HRIS "company" — which reads as a subsidiary CODE ("WSO2 - SRI LANKA"),
   *  not a legal name. It matches `ExpenseSubsidiarySummary.code`, which is how
   *  an approval queue resolves a claimant to their legal entity. The backend
   *  has always sent it (`types.bal` Employee.company); it was simply never
   *  declared here. Null for an employee the HRIS has no company on. */
  company: string | null;
}

export interface ExpenseAppData {
  userInfo: {
    workEmail: string;
    firstName: string | null;
    lastName: string | null;
    /** The lead a submitted claim goes to — `appDataSlice.ts:106`. */
    managerEmail?: string | null;
  };
  enableLeadView: boolean;
  enableFinanceView: boolean;
  currencyCode: string; // reimbursement / subsidiary currency
  countryCode: string;
  travels: ExpenseTravelData[];
  draft: { transactions: ExpenseTransaction[] } | null;
  pastDateRestrictionDays: number | null;
}

// Line item as returned on a claim (backend enriches with reimbursement
// figures). The submit payload is the trimmed ExpenseTransactionPayload.
export interface ExpenseTransaction {
  amount: number;
  currency: string;
  currencyConversionRate: number;
  reimbursementAmount: number;
  reimbursementCurrency: string;
  expenseTypeId: number;
  expenseType: string;
  date: string;
  comment?: string | null;
  receiptUrl?: string | null;
  travelJobNumber?: string | null;
}

// POST /claims line item (what we send).
export interface ExpenseTransactionPayload {
  date: string;
  amount: number;
  currency: string;
  expenseTypeId: number;
  comment: string | null;
  receiptUrl: string | null;
  travelJobNumber?: string | null;
}

export interface ExpenseClaimStatusDetails {
  status: ExpenseClaimStatus | null;
  leadApprovedDate: string | null;
  leadRejectedReason: string | null;
  leadRejectedDate: string | null;
  financeApproverEmail: string | null;
  financeApprovedDate: string | null;
  financeRejectedDate: string | null;
}

export interface ExpenseClaim {
  id: string;
  transactions: ExpenseTransaction[];
  totalAmount: number;
  currencyCode: string | null;
  employeeEmail: string;
  leadEmails: string[];
  statusDetails: ExpenseClaimStatusDetails;
  createdDate: string;
}

/**
 * The statuses a person can filter their own claims by — every one of them,
 * unlike OPD where a legacy value is hidden (`FilterBox.tsx` has no exclusion
 * here).
 */
export const EXPENSE_FILTERABLE_STATUSES: ExpenseClaimStatus[] = [
  "PENDING_LEAD",
  "LEAD_REJECTED",
  "PENDING_FINANCE",
  "APPROVED",
  "FINANCE_REJECTED",
];

export interface ExpenseClaimSearchPayload {
  ids?: string[] | null;
  email?: string | null;
  leadEmail?: string | null;
  status?: ExpenseClaimStatus[] | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface ExpenseClaimPayload {
  transactions: ExpenseTransactionPayload[];
}

export interface ExpenseStatusPayload {
  status: ExpenseClaimStatus;
  reason?: string;
}

export interface ExchangeRate {
  currencyCode: string;
  exchangeRate: number;
}

export interface ExpenseTypeData {
  id: number;
  type: string;
}

// ---- stage helpers ---------------------------------------------------------

// The tab → status filters differ by approver stage (see spec).
export const LEAD_TABS: { key: string; label: string; statuses: ExpenseClaimStatus[] }[] = [
  { key: "pending", label: "Pending", statuses: ["PENDING_LEAD"] },
  { key: "approved", label: "Approved", statuses: ["PENDING_FINANCE", "APPROVED", "FINANCE_REJECTED"] },
  { key: "rejected", label: "Rejected", statuses: ["LEAD_REJECTED"] },
];

export const FINANCE_TABS: { key: string; label: string; statuses: ExpenseClaimStatus[] }[] = [
  { key: "pending", label: "Pending", statuses: ["PENDING_FINANCE"] },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "rejected", label: "Rejected", statuses: ["FINANCE_REJECTED"] },
];

// Approve/reject target status per stage.
export function nextStatus(view: ApproverView, decision: "approve" | "reject"): ExpenseClaimStatus {
  if (view === "LEAD") return decision === "approve" ? "PENDING_FINANCE" : "LEAD_REJECTED";
  return decision === "approve" ? "APPROVED" : "FINANCE_REJECTED";
}

// ---- dashboard ---------------------------------------------------------
//
// Response types for the expense-claims backend's claims report. GET
// /claims-report is the one org-wide, aggregated report behind this dashboard.
// It is visible to finance readers only, the same audience `enableFinanceView`
// above describes, so that flag is also the correct gate here. See
// useFinanceGate's `finance-overview` case.

/** `/subsidiaries` on the expense-claims backend. Master Data's own
 *  `/subsidiaries` lives on a different backend with a different response, so
 *  this has its own type rather than reusing masterDataTypes' `Subsidiary`. */
export interface ExpenseSubsidiarySummary {
  id: number;
  code: string;
  legalName: string;
  currencyCode: string;
  country: string;
}

export interface ExpenseReportTotals {
  claimCount: number;
  totalValue: number;
  averageClaimValue: number;
}

export interface ExpenseReportStatusItem {
  status: string;
  count: number;
  averageDaysPending: number;
}

export interface ExpenseReportEntityItem {
  businessEntity: string;
  legalName: string;
  claimCount: number;
  totalValue: number;
  averageClaimValue: number;
  // Absent when there is no prior period to compare against ("All Time"), the
  // same as the top-level changes above.
  totalValueChangePercentage?: number;
}

export interface ExpenseReportTypeAmount {
  expenseType: string;
  amount: number;
}

export interface ExpenseReportMonthlyItem {
  month: string;
  label: string;
  amounts: ExpenseReportTypeAmount[];
  total: number;
  percentageOfTotal: number;
}

export interface ExpenseReportEmployeeItem {
  employeeEmail: string;
  employeeName: string;
  claimCount: number;
  pendingCount: number;
  claimsPerMonth: number;
  totalValue: number;
}

export interface ExpenseClaimsReport {
  reportingCurrency: string;
  current: ExpenseReportTotals;
  prior: ExpenseReportTotals;
  // Absent for an open-ended period ("All Time"), which has no prior period
  // to compare against.
  claimCountChangePercentage?: number;
  totalValueChangePercentage?: number;
  averageClaimValueChangePercentage?: number;
  statusBreakdown: ExpenseReportStatusItem[];
  entityBreakdown: ExpenseReportEntityItem[];
  expenseTypeColumns: string[];
  monthlyBreakdown: ExpenseReportMonthlyItem[];
  employeeBreakdown: ExpenseReportEmployeeItem[];
  availableSalesRegions: string[];
}

/** GET /claims-report query params. `status` is one value per request, not
 *  an array — the backend's own `string[]? status` binds a bare repeated
 *  `status=` query key, not axios/fetch's `status[]=` array encoding. */
export interface ExpenseClaimsReportFilter {
  startDate?: string;
  endDate: string;
  status?: string;
  businessEntity?: string;
  expenseTypeId?: number;
  salesRegion?: string;
}

export const EXPENSE_DASHBOARD_PERIODS = [
  "Monthly",
  "Quarterly",
  "Annually",
  "All Time",
  "Custom",
] as const;
export type ExpenseDashboardPeriod = (typeof EXPENSE_DASHBOARD_PERIODS)[number];
