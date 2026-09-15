/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { describe, expect, it } from "vitest";
import {
  applyBulkEdit,
  clearBulkDependents,
  clearDependentFields,
  resolveProductUnitIndex,
  sortByCompleteness,
  CC_BULK_EDIT_EMPTY,
} from "./ccPendingSubmissions";
import { ccTxnComplete, type CcTransaction } from "./ccTypes";

const base: CcTransaction = {
  id: 1,
  ccNumber: "1111",
  txnDate: "2026-08-20",
  txnDescription: "Hotel",
  txnAmount: 500,
  expenseTypeId: null,
  expenseCategoryLabel: null,
  expenseTypeLabel: null,
  txnComment: null,
  receiptFileName: null,
  contractFileName: null,
  subRegion: null,
  travelJobNumber: null,
  productUnit: null,
  businessUnit: null,
  status: "new",
  employeeEmail: "me@wso2.com",
  leadEmail: "lead@wso2.com",
  financeApproverEmail: null,
  empPostedDate: null,
  leadApprovedDate: null,
  financeApprovedDate: null,
  reportSequenceNumber: null,
};

const txn = (over: Partial<CcTransaction>): CcTransaction => ({ ...base, ...over });

// A row that passes ccTxnComplete the ordinary (non-travel, non-marketing) way.
const complete = (over: Partial<CcTransaction> = {}) =>
  txn({
    expenseCategoryLabel: "Software",
    expenseTypeLabel: "Subscriptions",
    txnComment: "Team licence",
    productUnit: "Integration",
    businessUnit: "Platform",
    ...over,
  });

const UNITS = {
  // "Integration" deliberately appears twice under different business units —
  // this is why the source selects by index rather than by name.
  productUnits: ["Integration", "Integration", "Identity"],
  businessUnits: ["Platform", "Digital", "Security"],
};

describe("the list puts finished rows first", () => {
  it("sorts complete above incomplete", () => {
    const rows = [txn({ id: 1 }), complete({ id: 2 }), txn({ id: 3 }), complete({ id: 4 })];
    expect(sortByCompleteness(rows, ccTxnComplete).map((r) => r.id)).toEqual([2, 4, 1, 3]);
  });

  it("keeps the backend's order within each group", () => {
    const rows = [complete({ id: 9 }), complete({ id: 3 }), txn({ id: 7 }), txn({ id: 2 })];
    // Not re-sorted by id: only completeness is decided here.
    expect(sortByCompleteness(rows, ccTxnComplete).map((r) => r.id)).toEqual([9, 3, 7, 2]);
  });

  it("leaves the caller's array alone", () => {
    // The array handed in belongs to the query cache.
    const rows = [txn({ id: 1 }), complete({ id: 2 })];
    sortByCompleteness(rows, ccTxnComplete);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

// EditPane.tsx:214-241. The select's value is an index, so picking the wrong
// one silently books the spend to another business unit.
describe("finding the row's product unit in the aligned arrays", () => {
  it("prefers the exact product/business pair", () => {
    expect(resolveProductUnitIndex("Integration", "Digital", UNITS.productUnits, UNITS.businessUnits)).toBe(1);
  });

  it("falls back to the first matching product unit when the pair is gone", () => {
    // The business unit was re-organised out from under a stored transaction.
    expect(resolveProductUnitIndex("Integration", "Retired BU", UNITS.productUnits, UNITS.businessUnits)).toBe(0);
  });

  it("is null when the row has no product unit", () => {
    expect(resolveProductUnitIndex(null, "Platform", UNITS.productUnits, UNITS.businessUnits)).toBeNull();
  });

  it("is null when the product unit is no longer offered", () => {
    expect(resolveProductUnitIndex("Gone", null, UNITS.productUnits, UNITS.businessUnits)).toBeNull();
  });
});

// clearSubFields, utils.ts:73-94.
describe("changing a field clears what it invalidates", () => {
  it("a new category drops everything chosen under the old one", () => {
    expect(clearDependentFields("expenseCategory")).toEqual({
      expenseTypeLabel: null,
      travelJobNumber: null,
      subRegion: null,
      productUnit: null,
      businessUnit: null,
    });
  });

  it("a new type drops the job number and sub region, but keeps the unit", () => {
    const cleared = clearDependentFields("expenseType");
    expect(cleared).toEqual({ travelJobNumber: null, subRegion: null });
    expect(cleared).not.toHaveProperty("productUnit");
  });

  it("a new job number drops the sub region", () => {
    expect(clearDependentFields("travelJobNumber")).toEqual({ subRegion: null });
  });

  it("stops a marketing sub region riding along into a travel claim", () => {
    // The bug this rule exists for: recategorise Marketing → Travel and the
    // sub-region would otherwise stay on the row.
    const marketing = txn({ expenseCategoryLabel: "Marketing", subRegion: "EMEA" });
    const switched = { ...marketing, expenseCategoryLabel: "Travel", ...clearDependentFields("expenseCategory") };
    expect(switched.subRegion).toBeNull();
  });
});

// EditPaneModal.tsx:112-152.
describe("a bulk edit", () => {
  const rows = [complete({ id: 1 }), complete({ id: 2, txnComment: "Other" })];

  it("changes only the fields that were filled in", () => {
    const out = applyBulkEdit({ ...CC_BULK_EDIT_EMPTY, comment: "Q3 offsite" }, rows, UNITS);
    expect(out.map((r) => r.txnComment)).toEqual(["Q3 offsite", "Q3 offsite"]);
    // Everything else is left exactly as it was on each row.
    expect(out.map((r) => r.expenseTypeLabel)).toEqual(["Subscriptions", "Subscriptions"]);
    expect(out.map((r) => r.productUnit)).toEqual(["Integration", "Integration"]);
  });

  it("applies to every selected row", () => {
    const out = applyBulkEdit({ ...CC_BULK_EDIT_EMPTY, expenseCategory: "Software" }, rows, UNITS);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.expenseCategoryLabel === "Software")).toBe(true);
  });

  it("keeps a type set alongside its category, rather than clearing it", () => {
    // The order matters: category clears the type beneath it, so applying the
    // type first would lose it. This is the assertion that fails if the apply
    // order is ever re-sorted into something tidier.
    const out = applyBulkEdit(
      { ...CC_BULK_EDIT_EMPTY, expenseCategory: "Travel", expenseType: "Flights" },
      rows,
      UNITS,
    );
    expect(out[0].expenseCategoryLabel).toBe("Travel");
    expect(out[0].expenseTypeLabel).toBe("Flights");
  });

  it("keeps a sub region set alongside its type", () => {
    // Type clears sub-region, and sub-region is applied after it.
    const out = applyBulkEdit(
      {
        ...CC_BULK_EDIT_EMPTY,
        expenseCategory: "Marketing",
        expenseType: "Events",
        subRegion: "EMEA",
        productUnit: "2",
      },
      rows,
      UNITS,
    );
    expect(out[0].subRegion).toBe("EMEA");
    expect(out[0].expenseTypeLabel).toBe("Events");
    expect(ccTxnComplete(out[0])).toBe(true);
  });

  it("resolves a product unit by index, taking its business unit with it", () => {
    const out = applyBulkEdit({ ...CC_BULK_EDIT_EMPTY, productUnit: "1" }, rows, UNITS);
    expect(out[0].productUnit).toBe("Integration");
    expect(out[0].businessUnit).toBe("Digital");
  });

  it("will not stamp a hand-picked unit on rows it is switching to Travel", () => {
    // A travel row's units come from its job number; :133-140 guards on the
    // form's category for exactly this.
    const out = applyBulkEdit(
      { ...CC_BULK_EDIT_EMPTY, expenseCategory: "Travel", productUnit: "1" },
      rows,
      UNITS,
    );
    expect(out[0].productUnit).toBeNull();
    expect(out[0].businessUnit).toBeNull();
  });

  it("leaves the rows handed in untouched", () => {
    applyBulkEdit({ ...CC_BULK_EDIT_EMPTY, comment: "changed" }, rows, UNITS);
    expect(rows[0].txnComment).toBe("Team licence");
  });
});

// EditPaneModal.tsx:87-109 — narrower than the transaction-level rule.
describe("the bulk form clears its own dependent choices", () => {
  it("a new category drops the type, unit and sub region below it", () => {
    expect(clearBulkDependents("expenseCategory", CC_BULK_EDIT_EMPTY)).toEqual({
      expenseType: "",
      productUnit: "",
      subRegion: "",
    });
  });

  it("a new type drops the unit only under Travel", () => {
    expect(clearBulkDependents("expenseType", { ...CC_BULK_EDIT_EMPTY, expenseCategory: "Travel" })).toEqual({
      productUnit: "",
    });
    expect(clearBulkDependents("expenseType", { ...CC_BULK_EDIT_EMPTY, expenseCategory: "Software" })).toEqual({});
  });

  it("leaves the comment alone whatever else changes", () => {
    const form = { ...CC_BULK_EDIT_EMPTY, comment: "keep me" };
    expect(clearBulkDependents("expenseCategory", form)).not.toHaveProperty("comment");
  });
});
