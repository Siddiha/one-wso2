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

/**
 * The categorisation rules behind Pending Submissions, kept out of the
 * components so they can be read and tested without a DOM.
 *
 * All four are ports of source behaviour that is easy to get subtly wrong:
 * the sort order, the index-based product-unit lookup, which fields a change
 * invalidates, and the order a bulk edit applies its fields in.
 *
 * Completeness itself is NOT here — `ccTxnComplete` in ccTypes.ts already
 * mirrors `validateRequiredFields` (utils.ts:51-72) and is what the tick, the
 * submit gate and the approval screens all read. A second copy of that rule is
 * exactly the disparity this migration exists to avoid.
 */

import { CC_TRAVEL_CATEGORY, type CcTransaction } from "./ccTypes";

/**
 * Complete rows first — NewTransactionsDataGrid.tsx:156-164.
 *
 * The comparator returns 0 for two rows of equal completeness and `sort` is
 * stable, so within each group the backend's own order survives. Copies rather
 * than sorting in place: the array handed in belongs to the query cache.
 */
export function sortByCompleteness(
  txns: CcTransaction[],
  isComplete: (t: CcTransaction) => boolean,
): CcTransaction[] {
  return [...txns].sort((a, b) => {
    const aDone = isComplete(a);
    const bDone = isComplete(b);
    if (aDone && !bDone) return -1;
    if (!aDone && bDone) return 1;
    return 0;
  });
}

/**
 * Which entry of the aligned product/business unit arrays a row is on —
 * EditPane.tsx:214-241.
 *
 * The select's value is an INDEX, not a name, because product-unit names
 * repeat across business units. So the exact (product, business) pair is
 * matched first; only if that fails does it fall back to the first row with a
 * matching product unit, which is what happens when a transaction carries a
 * product unit whose business unit has since been re-organised.
 */
export function resolveProductUnitIndex(
  productUnit: string | null,
  businessUnit: string | null,
  productUnits: string[],
  businessUnits: string[],
): number | null {
  if (!productUnit) return null;

  const exactPair =
    businessUnit !== null
      ? productUnits.findIndex(
          (unit, i) => unit === productUnit && businessUnits[i] === businessUnit,
        )
      : -1;
  if (exactPair !== -1) return exactPair;

  const byProduct = productUnits.findIndex((unit) => unit === productUnit);
  return byProduct !== -1 ? byProduct : null;
}

/** The three fields whose value invalidates others below them. */
export type CcCategorisationField = "expenseCategory" | "expenseType" | "travelJobNumber";

/**
 * What changing one field clears beneath it — `clearSubFields` (utils.ts:73-94).
 *
 * Without this a row keeps stale sub-values that no longer belong to it: pick
 * Travel after Marketing and the marketing sub-region rides along into the
 * submission, where nothing downstream expects it.
 */
export function clearDependentFields(field: CcCategorisationField): Partial<CcTransaction> {
  switch (field) {
    case "expenseCategory":
      return {
        expenseTypeLabel: null,
        travelJobNumber: null,
        subRegion: null,
        productUnit: null,
        businessUnit: null,
      };
    case "expenseType":
      return { travelJobNumber: null, subRegion: null };
    case "travelJobNumber":
      return { subRegion: null };
  }
}

// ---- bulk edit -------------------------------------------------------------

/**
 * The bulk-edit form — EditPaneModal.tsx:46-61.
 *
 * `productUnit` holds an INDEX as a string, like the single-row select, and ""
 * means "leave this field alone" for every member.
 */
export interface CcBulkEditForm {
  comment: string;
  expenseCategory: string;
  expenseType: string;
  productUnit: string;
  subRegion: string;
}

export const CC_BULK_EDIT_EMPTY: CcBulkEditForm = {
  comment: "",
  expenseCategory: "",
  expenseType: "",
  productUnit: "",
  subRegion: "",
};

/**
 * "Important: key order matters, as the apply order logic depends on it."
 * — EditPaneModal.tsx:54, quoting the source's own comment.
 *
 * Category clears the expense type beneath it, so a form that sets both must
 * apply the category BEFORE the type or the type is wiped by its own edit.
 * Same for sub-region, which the type clears. Spelling the order out here is
 * the point: it is not alphabetical, not the display order, and not obvious.
 */
const BULK_APPLY_ORDER: readonly (keyof CcBulkEditForm)[] = [
  "comment",
  "expenseCategory",
  "expenseType",
  "productUnit",
  "subRegion",
];

/**
 * Apply the filled-in fields of a bulk edit to every selected row —
 * EditPaneModal.tsx:112-152. Empty fields are skipped, so a form that names
 * only a comment changes only comments.
 */
export function applyBulkEdit(
  form: CcBulkEditForm,
  txns: CcTransaction[],
  units: { productUnits: string[]; businessUnits: string[] },
): CcTransaction[] {
  return txns.map((txn) => {
    let next: CcTransaction = { ...txn };
    for (const field of BULK_APPLY_ORDER) {
      const value = form[field];
      if (!value) continue;
      switch (field) {
        case "comment":
          next.txnComment = value;
          break;
        case "expenseCategory":
          next = {
            ...next,
            expenseCategoryLabel: value,
            ...clearDependentFields("expenseCategory"),
          };
          break;
        case "expenseType":
          next = { ...next, expenseTypeLabel: value, ...clearDependentFields("expenseType") };
          break;
        case "productUnit":
          // :133-140 guards on the FORM's category, not the row's — a bulk edit
          // that switches these rows to Travel must not also stamp a
          // hand-picked unit on them, because a travel row's units come from
          // its job number.
          if (form.expenseCategory !== CC_TRAVEL_CATEGORY) {
            next.productUnit = units.productUnits[Number(value)] ?? null;
            next.businessUnit = units.businessUnits[Number(value)] ?? null;
          }
          break;
        case "subRegion":
          next.subRegion = value;
          break;
      }
    }
    return next;
  });
}

/**
 * What a change to the bulk FORM clears in the form itself —
 * EditPaneModal.tsx:87-109. Narrower than `clearDependentFields`, which acts
 * on transactions: picking a category here drops the type, unit and sub-region
 * the reader had chosen for the old one, and picking a type drops the unit
 * only when the category is Travel (where the unit is not the reader's to set).
 */
export function clearBulkDependents(
  field: keyof CcBulkEditForm,
  form: CcBulkEditForm,
): Partial<CcBulkEditForm> {
  switch (field) {
    case "expenseCategory":
      return { expenseType: "", productUnit: "", subRegion: "" };
    case "expenseType":
      return form.expenseCategory === CC_TRAVEL_CATEGORY ? { productUnit: "" } : {};
    default:
      return {};
  }
}
