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

// DTOs + enums mirrored from digiops-finance/apps/cc-expenses/backend.

// Access levels are string names (no numeric privileges) derived from the
// JWT groups + DB owner/lead lists on the backend.
export type CcAccessLevel = "employee" | "cc_owner" | "lead" | "finance";

export type CcTxnStatus = "new" | "pending_lead" | "pending_finance" | "submitted" | "invalid";

export type CcBankCode = "amex" | "svb";

export type CcAttachmentType = "receipt" | "contract";

// Marketing needs a sub-region; Travel needs a job number; everything else
// needs a product/business unit.
export const CC_TRAVEL_CATEGORY = "Travel";
export const CC_MARKETING_CATEGORY = "Marketing";

export interface CcEmployee {
  employeeId: string;
  workEmail: string;
  firstName: string;
  lastName: string;
  jobRole: string;
  employeeThumbnail?: string | null;
  privileges: CcAccessLevel[];
}

export interface CcTransaction {
  id: number;
  ccNumber: string;
  txnDate: string;
  txnDescription: string | null;
  txnAmount: number;
  expenseTypeId: number | null;
  expenseCategoryLabel: string | null;
  expenseTypeLabel: string | null;
  txnComment: string | null;
  receiptFileName: string | null;
  contractFileName: string | null;
  subRegion: string | null;
  travelJobNumber: string | null;
  productUnit: string | null;
  businessUnit: string | null;
  status: CcTxnStatus;
  employeeEmail: string;
  leadEmail: string | null;
  financeApproverEmail: string | null;
  empPostedDate: string | null;
  leadApprovedDate: string | null;
  financeApprovedDate: string | null;
  reportSequenceNumber: string | null;
}

export interface CcCreditCard {
  id: number;
  ccNumber: string;
  bankCode: string;
  label: string | null;
  employeeEmail: string;
  leadEmail: string;
  status: string; // "Active" | "Inactive"
  countNew: number;
  countPendingLead: number;
  countPendingFinance: number;
}

// ---- menu / configuration data --------------------------------------------

export interface CcExpenseTypeList {
  categories: string[];
  types: Record<string, string[]>; // keyed by category label
}

export interface CcSubRegionList {
  subRegions: string[];
}

// productUnits[i] belongs to businessUnits[i] (index-aligned arrays).
export interface CcProductAndBusinessUnitList {
  productUnits: string[];
  businessUnits: string[];
}

/** One share of a travel job's funding — `userMenus.ts:44-50`. */
export interface CcFundingSource {
  region: string;
  subRegion: string;
  businessUnit: string;
  productUnit: string;
  percentage: number;
}

/**
 * A travel job's details — `userMenus.ts:53-65`. The units here are the
 * authority for a travel transaction: EditPane.tsx:577-590 copies them onto
 * the row rather than asking the user to pick them.
 */
export interface CcJobNumberDetails {
  engagementCode: string;
  engagementType: string;
  customerName: string;
  city: string;
  country: string;
  globalPod: string;
  startDate: string;
  endDate: string;
  productUnit: string;
  businessUnit: string;
  fundingSources: CcFundingSource[];
}

export interface CcJobNumberList {
  jobNumbers: string[];
}

// ---- statement ingestion (Settings) ---------------------------------------

export interface CcNewTransaction {
  uploadFileId: number;
  bankCode: string;
  ccNumber: string;
  txnReferenceNo: string;
  txnDescription: string;
  txnDate: string;
  postDate: string;
  txnCurrency: string;
  txnAmount: number;
  ccCurrency: string;
  ccAmount: number;
  status: CcTxnStatus;
  employeeEmail: string;
  leadEmail: string;
}

export interface CcTransactionUploadGroup {
  newItems: CcNewTransaction[];
  duplicateItems: CcNewTransaction[];
  invalidItems: CcNewTransaction[];
}

// ---- helpers ---------------------------------------------------------------

export function ccHasAccess(user: CcEmployee | undefined, level: CcAccessLevel): boolean {
  return Boolean(user?.privileges?.includes(level));
}

/**
 * What to call a card: its label if it has been given one, otherwise its
 * position in the list — `Card 1`, `Card 2` (`CardMenu.tsx:113-120`). The
 * numbering is the position in the list SHOWN, not anything stored, so it
 * renumbers if a card is deactivated.
 */
export function ccCardName(label: string | null | undefined, index: number): string {
  return label || `Card ${index + 1}`;
}

// A transaction is ready to submit once its required categorisation fields
// are set (mirrors the backend's validateRequiredFields).
export function ccTxnComplete(t: CcTransaction): boolean {
  if (!t.expenseTypeLabel || !t.txnComment) return false;
  if (t.expenseCategoryLabel === CC_TRAVEL_CATEGORY) return Boolean(t.travelJobNumber);
  // EditPane.tsx:364 matches with startsWith, so a sub-category such as
  // "Marketing - Digital" still needs a sub-region. Matching the exact string
  // let every sub-category skip the rule.
  if (t.expenseCategoryLabel?.startsWith(CC_MARKETING_CATEGORY))
    return Boolean(t.subRegion && t.productUnit);
  return Boolean(t.productUnit);
}

// ---- dashboard ------------------------------------------------------------

/** transactionSummary.ts:16-20. */
export interface CcPendingSnapshot {
  count: number;
  amount: number;
  avgDaysToSubmit: number | null;
}

/** :22-26 — one ageing bucket of unsubmitted spend. */
export interface CcAgeBucketAmount {
  label: string;
  count: number;
  amount: number;
}

export interface CcTransactionSummary {
  current: CcPendingSnapshot | null;
  ageBuckets: Record<string, CcAgeBucketAmount>;
}

/** submittedExpensesByCategory.ts:22-26. `txnMonth` is "YYYY-MM". */
export interface CcCategoryMonthAmount {
  category: string;
  txnMonth: string;
  amount: number;
}

/** cardHolderCompliance.ts:16-25. */
export interface CcCardHolderCompliance {
  employeeEmail: string;
  cardHolderName: string;
  transactionCount: number;
  outstandingAmount: number;
  avgDaysToSubmit: number | null;
  // How many of their unsubmitted transactions fall in each ageing band.
  bucket0To7: number;
  bucket8To14: number;
  bucket15To30: number;
  bucket30Plus: number;
}

