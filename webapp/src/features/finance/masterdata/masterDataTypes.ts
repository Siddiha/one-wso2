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

/**
 * Page/tab titles.
 *
 * The mappings heading is longer than its side menu entry on purpose: the
 * menu entry was clipped and had to be shortened, the heading has the room.
 */
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
//
// A mapping decides which NetSuite account and department a travel invoice or
// per diem bill is posted to. It is matched by engagement code — or, failing
// that, by a suffix of one — narrowed to a cost type. Per diem is not a
// separate table: it is cost type "Currency (per diem / allowances)", which is
// why one screen answers Finance's request for both a Travel Invoice mapping
// and a Per diem mapping.

export interface InvoiceAccountMapping {
  id: number;
  /** NetSuite internal ID of the account. */
  internalId: string;
  /** NetSuite account number, e.g. "61033-003". */
  accountNumber: string;
  /** Account name exactly as it reads in NetSuite. */
  accountClassification: string;
  engagementCodes: string[];
  engagementCodeSuffixes: string[];
  invCostTypeId: number;
  /** Cost type name, resolved by the backend from `invCostTypeId`. */
  costType: string;
  department: string | null;
  status: string;
}

export interface InvoiceAccountMappingPayload {
  internalId: string;
  accountNumber: string;
  accountClassification: string;
  engagementCodes: string[];
  engagementCodeSuffixes: string[];
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
  id: number;
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
  invCostTypeIds?: number[];
  engagementCodes?: string[];
  engagementCodeSuffixes?: string[];
  /** An empty string selects the rows that carry no department. */
  departments?: string[];
  status?: string[];
  /** Matched against the account name, number, internal ID, codes and cost type. */
  searchTerm?: string;
  /** Page size. The backend defaults to 100 and clamps anything above 500. */
  limit?: number;
  offset?: number;
}

/** One page of mappings, with the total the filter matches across every page. */
export interface InvoiceAccountMappingPage {
  mappings: InvoiceAccountMapping[];
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
  costTypes: LabelledId[];
  engagementCodes: string[];
  engagementCodeSuffixes: string[];
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
