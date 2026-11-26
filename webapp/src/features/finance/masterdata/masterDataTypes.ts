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

// The finance-master-data wire types, field for field. The backend decides
// these names — a rename here is a broken request, not a tidy-up.

/** The five collections, in the order the rail lists them. */
export type MasterDataTab =
  | "subsidiaries"
  | "departments"
  | "expenseTypes"
  | "creditCards"
  | "invoiceAccountMappings";

/**
 * Path segment per tab.
 *
 * The camelCase tab key and the kebab-case endpoint differ for three of the
 * five, so this map is what turns one into the other. Both spellings are load
 * bearing; neither is derivable from the other.
 */
export const MASTER_DATA_ENDPOINTS: Record<MasterDataTab, string> = {
  subsidiaries: "subsidiaries",
  departments: "departments",
  expenseTypes: "expense-types",
  creditCards: "credit-cards",
  invoiceAccountMappings: "invoice-account-mappings",
};

/** Page/tab titles, which are longer than the side menu's own entries. */
export const MASTER_DATA_LABELS: Record<MasterDataTab, string> = {
  subsidiaries: "Subsidiaries",
  departments: "Departments",
  expenseTypes: "Expense Types",
  creditCards: "Credit Cards",
  invoiceAccountMappings: "Invoice Account Mappings",
};

// ---- Subsidiaries ---------------------------------------------------------

export interface Subsidiary {
  id: number;
  taxCodeInternalId: number;
  taxCode: string;
  legalName: string;
  code: string;
  /** Country the subsidiary is registered in. */
  country: string;
  /** ISO 4217 code the subsidiary reimburses in, derived from `country`. */
  currencyCode: string;
}

export interface SubsidiaryPayload {
  taxCodeInternalId: number;
  taxCode: string;
  legalName: string;
  code: string;
  /** Country the subsidiary is registered in. */
  country: string;
}

// ---- Departments ----------------------------------------------------------

export interface Department {
  id: number;
  employeeDepartment: string;
  engagementCode: string;
  glCodeId: number;
  glCode: string;
  glCodeInternalId: number;
  glAccountName: string;
  costCenter: string | null;
}

export interface DepartmentPayload {
  employeeDepartment: string;
  engagementCode: string;
  glCodeId: number;
}

// ---- GL codes (a dropdown source, not a tab) ------------------------------

export interface GlCode {
  id: number;
  internalId: number;
  glCode: string;
  glAccountName: string;
  costCenter: string | null;
}

// ---- Expense types --------------------------------------------------------

export interface ExpenseType {
  id: number;
  expenseCategoryId: number;
  expenseCategory: string;
  expenseDescription: string | null;
  glCodeId: number;
  glCode: string;
  glCodeInternalId: number;
  glAccountName: string;
  costCenter: string;
  expenseType: string;
  expenseTypeDescription: string | null;
  engagementCodes: string[];
  engagementCodeSuffixes: string[];
  status: string;
}

export interface ExpenseTypePayload {
  expenseCategoryId: number;
  glCodeId: number;
  expenseType: string;
  expenseTypeDescription: string;
  engagementCodes: string[];
  engagementCodeSuffixes: string[];
  /** Edits only — see {@link CreditCardPayload.status}, which works the same way. */
  status?: string;
}

/** POST body for `search-expense-types`. Every key is optional. */
export interface ExpenseTypeFilter {
  expenseCategoryIds?: number[];
  glCodeIds?: number[];
  expenseTypes?: string[];
  engagementCodes?: string[];
  engagementCodeSuffixes?: string[];
  status?: string[];
}

/** An id + its display label, for the two filters that filter on an id. */
export interface LabelledId {
  id: number;
  label: string;
}

export interface ExpenseTypeAutoComplete {
  expenseCategoryIds: LabelledId[];
  glCodeIds: LabelledId[];
  expenseTypes: string[];
  engagementCodes: string[];
  engagementCodeSuffixes: string[];
}

// ---- Credit cards ---------------------------------------------------------

export interface CreditCard {
  id: number;
  ccNumber: string;
  ccProviderCode: string;
  comment: string | null;
  employeeEmail: string;
  leadEmails: string[];
  status: string;
}

export interface CreditCardPayload {
  ccNumber: string;
  ccProviderCode: string;
  comment: string;
  employeeEmail: string;
  leadEmails: string[];
  /**
   * Only an edit carries one. A new card is created active by the backend,
   * which hardcodes the value, and `AddCreditCardPayload` is a closed record
   * there — sending the field on a create is a 400, not a no-op.
   */
  status?: string;
}

/**
 * The two statuses a row can carry. The column holds a mix of "Active" and
 * "active" from older writes, so these are the lower-cased forms everything
 * normalises to before comparing.
 */
export const MASTER_DATA_STATUS = {
  active: "active",
  inactive: "inactive",
} as const;
export type MasterDataStatus = (typeof MASTER_DATA_STATUS)[keyof typeof MASTER_DATA_STATUS];

/** The two card providers this backend supports. */
export const CREDIT_CARD_PROVIDERS = ["AMEX", "SVB"] as const;
export type CreditCardProvider = (typeof CREDIT_CARD_PROVIDERS)[number];

/** `/employees/email` rows. */
export interface EmployeeEmail {
  workEmail: string;
}

// ---- Invoice account mappings ---------------------------------------------
//
// Served by ONE_WSO2_FINANCE_MASTER_DATA_BACKEND_URL like the rest of these
// screens, though these rows are not held in the finance master data database
// itself.

/**
 * One rule deciding which NetSuite account and department a travel invoice or
 * per diem bill is posted to.
 *
 * Matched by engagement code — or, failing that, by a suffix of one —
 * narrowed to a cost type. Per diem is not a separate table: it is cost type
 * "Currency (per diem / allowances)", so Travel Invoice and Per diem
 * mappings are rows of this one table told apart by `costType`.
 */
export interface InvoiceAccountMapping {
  /** Database record ID, and the `{id}` an edit or retire is addressed to. */
  id: number;
  /** NetSuite internal ID of the account. */
  internalId: string;
  /** NetSuite account number, e.g. "61033-003". */
  accountNumber: string;
  /** Account name exactly as it reads in NetSuite. */
  accountClassification: string;
  /** Full engagement codes this mapping matches. Stored as one
   *  comma-separated column and split by the backend. */
  engagementCodes: string[];
  /** Matched against an engagement code's second part, so `RND-GEN` catches
   *  `RND-GEN-INT`. Stored and split the same way. */
  engagementCodeSuffixes: string[];
  /** `inv_cost_type` row this mapping is filed under. */
  invCostTypeId: number;
  /** Cost type name, resolved by the backend from `invCostTypeId`. */
  costType: string;
  /** Department the bill posts to. Null or blank is a real value here. */
  department: string | null;
  /** `"Active"` or `"Inactive"`, in the column's own capitalisation. Older
   *  rows carry either case, so compare case-insensitively. */
  status: string;
}

/**
 * A mapping as the Add and Edit forms send it.
 *
 * No `id` and no `costType`: the first is the URL on an edit, and the second
 * is the backend's own join on `invCostTypeId`.
 */
export interface InvoiceAccountMappingPayload {
  /** NetSuite internal ID, taken from the chosen GL code. */
  internalId: string;
  /** NetSuite account number, taken from the chosen GL code. */
  accountNumber: string;
  /** Account name, taken from the chosen GL code. */
  accountClassification: string;
  /** Letters, digits, underscores, dots and hyphens only — the backend
   *  refuses anything else. At least one of these two lists is required. */
  engagementCodes: string[];
  /** Same rule as `engagementCodes`, and the other half of that pair. */
  engagementCodeSuffixes: string[];
  /** `inv_cost_type` row to file the mapping under. Required. */
  invCostTypeId: number;
  /**
   * Blank is a real value, not a missing one — the Intercompany rows carry an
   * empty department on purpose, so this is never required.
   */
  department: string;
  /** Edits only — see {@link CreditCardPayload.status}, which works the same way. */
  status?: string;
}

/** `/invoice-cost-types` rows — the cost types a mapping may be filed under. */
export interface InvoiceCostType {
  /** Database record ID, which `invCostTypeId` on a mapping refers to. */
  id: number;
  /** Cost type name, e.g. "Air Ticket". */
  name: string;
}

/**
 * POST body for `invoice-account-mappings/search`. Every key is optional.
 *
 * An empty object is a real question rather than an absent one: the backend
 * builds no WHERE clause for it and answers with the first page of the whole
 * table, which is what the screen asks for on its first render.
 */
export interface InvoiceAccountMappingFilter {
  /** Cost type IDs to match, not their names. */
  invCostTypeIds?: number[];
  /** Matched against the stored code list, not the whole column. */
  engagementCodes?: string[];
  /** Matched against the stored suffix list, not the whole column. */
  engagementCodeSuffixes?: string[];
  /** An empty string selects the rows that carry no department. */
  departments?: string[];
  /** `"active"`, `"inactive"` or both. Matched without regard to case.
   *  Omitted means every status. */
  status?: string[];
  /** Matched against the account name, number, internal ID, codes and cost type. */
  searchTerm?: string;
  /** Page size. The backend defaults to 100 and clamps anything above 500. */
  limit?: number;
  /** Rows to skip before the page starts, so `page * limit`. */
  offset?: number;
}

/** One page of mappings, with the total the filter matches across every page. */
export interface InvoiceAccountMappingPage {
  /** The rows on this page, already split out of their code columns. */
  mappings: InvoiceAccountMapping[];
  /** Rows the filter matches across every page, for the grid's row count. */
  totalCount: number;
}

/**
 * The option lists behind the mapping filters and that tab's form pickers.
 *
 * Read from the whole table by the backend rather than derived from the rows
 * on screen. That distinction is what keeps the options honest once the list
 * is paged: a code that only appears on page four is still offered.
 */
export interface InvoiceAccountMappingAutoComplete {
  /** Only the cost types some mapping is filed under, which is narrower than
   *  `/invoice-cost-types` — the form offers every active one. */
  costTypes: LabelledId[];
  /** Every engagement code in use, already split out of its column. */
  engagementCodes: string[];
  /** Every suffix in use, split the same way. */
  engagementCodeSuffixes: string[];
  /** Every department in use. Blank ones are left out; the filter adds its
   *  own "no department" option. */
  departments: string[];
}

// ---- Unions ---------------------------------------------------------------

export type MasterDataRow =
  | Subsidiary
  | Department
  | ExpenseType
  | CreditCard
  | InvoiceAccountMapping;
export type MasterDataPayload =
  | SubsidiaryPayload
  | DepartmentPayload
  | ExpenseTypePayload
  | CreditCardPayload
  | InvoiceAccountMappingPayload;

/**
 * The row type each tab holds, so a page can name its tab once and have the
 * grid, the dialogs and the mutations all agree on what a row is.
 */
export interface MasterDataRowFor {
  subsidiaries: Subsidiary;
  departments: Department;
  expenseTypes: ExpenseType;
  creditCards: CreditCard;
  invoiceAccountMappings: InvoiceAccountMapping;
}

export interface MasterDataPayloadFor {
  subsidiaries: SubsidiaryPayload;
  departments: DepartmentPayload;
  expenseTypes: ExpenseTypePayload;
  creditCards: CreditCardPayload;
  invoiceAccountMappings: InvoiceAccountMappingPayload;
}
