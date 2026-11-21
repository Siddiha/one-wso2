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

import { describe, expect, it } from "vitest";
import {
  changedFields,
  initialFormData,
  invalidEngagementCodes,
  isCreditCardNumberValid,
  isEngagementCodeValid,
  isFormComplete,
  isUnchanged,
} from "./masterDataForm";
import type {
  CreditCard,
  CreditCardPayload,
  ExpenseType,
  ExpenseTypePayload,
  InvoiceAccountMapping,
  InvoiceAccountMappingPayload,
  SubsidiaryPayload,
} from "./masterDataTypes";

// This file covers the trickiest logic in the master-data forms — either-or
// field groups, PATCH diffing with sorted-array comparison, and the two
// provider-specific card-number formats. All four functions are pure, so
// every case here is a plain input/output assertion.

describe("isCreditCardNumberValid — the two formats it enforces", () => {
  it("accepts an AMEX number in 123-12345 shape", () => {
    expect(isCreditCardNumberValid("AMEX", "123-12345")).toBe(true);
  });
  it("rejects an AMEX number in the SVB shape", () => {
    expect(isCreditCardNumberValid("AMEX", "1234-1234")).toBe(false);
  });
  it("accepts an SVB number in 1234-1234 shape", () => {
    expect(isCreditCardNumberValid("SVB", "1234-1234")).toBe(true);
  });
  it("rejects an SVB number in the AMEX shape", () => {
    expect(isCreditCardNumberValid("SVB", "123-12345")).toBe(false);
  });
  it("returns false — not a throw — for a provider outside the pair", () => {
    // The source throws here; the port doesn't, because this is reachable
    // from isFormComplete on every keystroke — see the function's own doc.
    expect(isCreditCardNumberValid("VISA", "1234-1234")).toBe(false);
  });
  it("rejects an empty number", () => {
    expect(isCreditCardNumberValid("AMEX", "")).toBe(false);
  });
});

describe("isFormComplete — subsidiaries and departments (every field required)", () => {
  it("is false until every field is filled", () => {
    const empty: SubsidiaryPayload = {
      taxCodeInternalId: 0,
      taxCode: "",
      legalName: "",
      code: "",
      country: "",
    };
    expect(isFormComplete("subsidiaries", empty)).toBe(false);
  });
  it("is true once every field is filled, including a numeric field at a non-zero value", () => {
    const filled: SubsidiaryPayload = {
      taxCodeInternalId: 19,
      taxCode: "UNDEF_LK",
      legalName: "WSO2 Lanka",
      code: "WSO2-LK",
      country: "Sri Lanka",
    };
    expect(isFormComplete("subsidiaries", filled)).toBe(true);
  });
  it("reads a numeric field left at 0 as blank, same as an empty string", () => {
    const almost: SubsidiaryPayload = {
      taxCodeInternalId: 0,
      taxCode: "UNDEF_LK",
      legalName: "WSO2 Lanka",
      code: "WSO2-LK",
      country: "Sri Lanka",
    };
    expect(isFormComplete("subsidiaries", almost)).toBe(false);
  });
});

describe("isFormComplete — expense types' either-or group", () => {
  const base: ExpenseTypePayload = {
    expenseCategoryId: 1,
    glCodeId: 1,
    expenseType: "Travel",
    expenseTypeDescription: "",
    engagementCodes: [],
    engagementCodeSuffixes: [],
  };

  it("is false when both engagement fields are empty", () => {
    expect(isFormComplete("expenseTypes", base)).toBe(false);
  });
  it("is true with only engagementCodes filled", () => {
    expect(isFormComplete("expenseTypes", { ...base, engagementCodes: ["RND-GEN"] })).toBe(true);
  });
  it("is true with only engagementCodeSuffixes filled", () => {
    expect(isFormComplete("expenseTypes", { ...base, engagementCodeSuffixes: ["-01"] })).toBe(true);
  });
  it("is true with both filled", () => {
    expect(
      isFormComplete("expenseTypes", {
        ...base,
        engagementCodes: ["RND-GEN"],
        engagementCodeSuffixes: ["-01"],
      }),
    ).toBe(true);
  });
  it("treats an all-blank-string array the same as an empty one", () => {
    expect(isFormComplete("expenseTypes", { ...base, engagementCodes: [""] })).toBe(false);
  });
  it("expenseTypeDescription being optional does not block completion", () => {
    expect(
      isFormComplete("expenseTypes", { ...base, engagementCodes: ["RND-GEN"], expenseTypeDescription: "" }),
    ).toBe(true);
  });
  it("is false when a required field outside the either-or group is still blank", () => {
    expect(
      isFormComplete("expenseTypes", { ...base, expenseType: "", engagementCodes: ["RND-GEN"] }),
    ).toBe(false);
  });
});

describe("isFormComplete — credit cards' provider-format rule", () => {
  const base: CreditCardPayload = {
    ccNumber: "",
    ccProviderCode: "",
    employeeEmail: "amila@wso2.com",
    leadEmails: ["lead@wso2.com"],
    comment: "",
  };

  it("is false with no provider chosen yet", () => {
    expect(isFormComplete("creditCards", base)).toBe(false);
  });
  it("is false once a provider is chosen but the number doesn't match its format", () => {
    expect(isFormComplete("creditCards", { ...base, ccProviderCode: "AMEX", ccNumber: "1234-1234" })).toBe(
      false,
    );
  });
  it("is true once the number matches the chosen provider's format", () => {
    expect(isFormComplete("creditCards", { ...base, ccProviderCode: "AMEX", ccNumber: "123-12345" })).toBe(
      true,
    );
  });
  it("comment being optional does not block completion", () => {
    expect(
      isFormComplete("creditCards", { ...base, ccProviderCode: "SVB", ccNumber: "1234-1234", comment: "" }),
    ).toBe(true);
  });
  it("is false when leadEmails is empty", () => {
    expect(
      isFormComplete("creditCards", {
        ...base,
        ccProviderCode: "SVB",
        ccNumber: "1234-1234",
        leadEmails: [],
      }),
    ).toBe(false);
  });
});

describe("isUnchanged / changedFields — PATCH diffing against the source row", () => {
  const row: ExpenseType = {
    id: 7,
    expenseCategoryId: 1,
    expenseCategory: "Travel",
    expenseDescription: null,
    glCodeId: 1,
    glCode: "61015-003",
    glCodeInternalId: 258,
    glAccountName: "Marketing & Promotion",
    costCenter: "",
    expenseType: "Airfare",
    expenseTypeDescription: null,
    engagementCodes: ["RND-GEN", "SALES-GEN"],
    engagementCodeSuffixes: [],
    status: "active",
  };
  const form: ExpenseTypePayload = {
    expenseCategoryId: 1,
    glCodeId: 1,
    expenseType: "Airfare",
    expenseTypeDescription: "",
    engagementCodes: ["RND-GEN", "SALES-GEN"],
    engagementCodeSuffixes: [],
  };

  it("reads as unchanged when every payload field matches the row", () => {
    expect(isUnchanged(row, form)).toBe(true);
  });
  it("changedFields is empty when nothing changed", () => {
    expect(changedFields(row, form)).toEqual({});
  });
  it("a null on the row and an empty string on the form is NOT a change", () => {
    // expenseTypeDescription is null on the row, "" on the form.
    expect(isUnchanged(row, form)).toBe(true);
    expect(changedFields(row, form)).not.toHaveProperty("expenseTypeDescription");
  });
  it("array order alone is not a change — comparison is sorted", () => {
    const reordered = { ...form, engagementCodes: ["SALES-GEN", "RND-GEN"] };
    expect(isUnchanged(row, reordered)).toBe(true);
    expect(changedFields(row, reordered)).toEqual({});
  });
  // The two functions have to agree. They did not: isUnchanged compared
  // status case-insensitively, so Update stayed disabled as it should, while
  // changedFields compared exactly — so editing any OTHER field sent a
  // status the reader never touched, written back in a different casing.
  it("does not report a status change for a casing the reader did not choose", () => {
    const stored = { ...row, status: "Inactive" };
    const seeded = { ...form, status: "inactive" };

    expect(isUnchanged(stored, seeded)).toBe(true);
    expect(changedFields(stored, seeded)).not.toHaveProperty("status");

    // And an unrelated edit carries only that edit.
    const edited = { ...seeded, expenseType: "Renamed" };
    expect(changedFields(stored, edited)).toEqual({ expenseType: "Renamed" });
  });

  it("still reports a status the reader really did change", () => {
    const stored = { ...row, status: "Inactive" };
    const edited = { ...form, status: "active" };

    expect(isUnchanged(stored, edited)).toBe(false);
    expect(changedFields(stored, edited)).toEqual({ status: "active" });
  });

  // `initialFormData` seeds "active" when the row's own status is nullish.
  // The generic row lookup these two functions share defaults a missing key
  // to "" — not "active" — so without matching that default here too, an
  // untouched status read as changed and rode along with any other edit.
  it("does not report a status change for a row that never carried one", () => {
    const stored = { ...row, status: undefined as unknown as string };
    const seeded = { ...form, status: "active" };

    expect(isUnchanged(stored, seeded)).toBe(true);
    expect(changedFields(stored, seeded)).not.toHaveProperty("status");

    const edited = { ...seeded, expenseType: "Renamed" };
    expect(changedFields(stored, edited)).toEqual({ expenseType: "Renamed" });
  });

  it("a real array content change is picked up by both functions", () => {
    const edited = { ...form, engagementCodes: ["RND-GEN"] };
    expect(isUnchanged(row, edited)).toBe(false);
    expect(changedFields(row, edited)).toEqual({ engagementCodes: ["RND-GEN"] });
  });
  it("a scalar field change is picked up, and only that field is reported", () => {
    const edited = { ...form, expenseType: "Hotel" };
    expect(isUnchanged(row, edited)).toBe(false);
    expect(changedFields(row, edited)).toEqual({ expenseType: "Hotel" });
  });
  it("changing two fields reports exactly those two, nothing else", () => {
    const edited = { ...form, expenseType: "Hotel", glCodeId: 2 };
    expect(changedFields(row, edited)).toEqual({ expenseType: "Hotel", glCodeId: 2 });
  });
});

describe("isUnchanged / changedFields — credit cards (leadEmails, unsorted per source)", () => {
  const row: CreditCard = {
    id: 1,
    ccNumber: "123-12345",
    ccProviderCode: "AMEX",
    comment: null,
    employeeEmail: "amila@wso2.com",
    leadEmails: ["lead1@wso2.com", "lead2@wso2.com"],
    status: "active",
  };
  const form: CreditCardPayload = {
    ccNumber: "123-12345",
    ccProviderCode: "AMEX",
    comment: "",
    employeeEmail: "amila@wso2.com",
    leadEmails: ["lead1@wso2.com", "lead2@wso2.com"],
  };

  it("reads as unchanged when the payload matches the row (null comment vs empty string)", () => {
    expect(isUnchanged(row, form)).toBe(true);
  });
  it("adding a lead email is picked up as a change", () => {
    const edited = { ...form, leadEmails: ["lead1@wso2.com", "lead2@wso2.com", "lead3@wso2.com"] };
    expect(isUnchanged(row, edited)).toBe(false);
    expect(changedFields(row, edited)).toEqual({ leadEmails: edited.leadEmails });
  });
});

describe("initialFormData — seeding the payload from an existing row, or blank for a new one", () => {
  it("returns an all-blank payload with no row", () => {
    expect(initialFormData("subsidiaries")).toEqual({
      taxCodeInternalId: 0,
      taxCode: "",
      legalName: "",
      code: "",
      country: "",
    });
  });
  it("flattens an existing row into its payload shape", () => {
    const row: CreditCard = {
      id: 1,
      ccNumber: "123-12345",
      ccProviderCode: "AMEX",
      comment: null,
      employeeEmail: "amila@wso2.com",
      leadEmails: ["lead@wso2.com"],
      status: "active",
    };
    expect(initialFormData("creditCards", row)).toEqual({
      ccNumber: "123-12345",
      ccProviderCode: "AMEX",
      comment: "",
      employeeEmail: "amila@wso2.com",
      leadEmails: ["lead@wso2.com"],
      // Carried so the edit dialog's Active/Inactive toggle has something to
      // show; a create seeds no `status` at all, which the next test covers.
      status: "active",
    });
  });
  it("a null on the row seeds the form with an empty string, not null", () => {
    const row: CreditCard = {
      id: 1,
      ccNumber: "123-12345",
      ccProviderCode: "AMEX",
      comment: null,
      employeeEmail: "amila@wso2.com",
      leadEmails: [],
      status: "active",
    };
    const form = initialFormData("creditCards", row) as CreditCardPayload;
    expect(form.comment).toBe("");
  });
});

// ---- Invoice account mappings ---------------------------------------------
//
// The rules here exist because of two things that have actually gone wrong in
// production. Codes pasted out of Finance's spreadsheet reached the table
// carrying CR/LF and had to be scrubbed by hand with a REPLACE() script; and
// because both code columns store a comma-separated list in one field, a
// comma inside one entry silently becomes two codes.

/** A complete mapping form, which each test below varies one field of. */
const MAPPING_FORM: InvoiceAccountMappingPayload = {
  internalId: "351",
  accountNumber: "61033-003",
  accountClassification: "Travel - Air Ticket",
  engagementCodes: ["RND-GEN-INT"],
  engagementCodeSuffixes: [],
  invCostTypeId: 1,
  department: "Engineering",
};

describe("isEngagementCodeValid — what one code may contain", () => {
  it("accepts the shapes the table actually holds", () => {
    expect(isEngagementCodeValid("RND-GEN-INT")).toBe(true);
    expect(isEngagementCodeValid("MKT-BU_CORP-GEN")).toBe(true);
    expect(isEngagementCodeValid("Vok0z-PR")).toBe(true);
  });
  it("rejects a comma, which would silently become two codes", () => {
    expect(isEngagementCodeValid("RND-GEN,BAL-RND")).toBe(false);
  });
  it("rejects spaces and line breaks, the contamination seen in production", () => {
    expect(isEngagementCodeValid("RND GEN")).toBe(false);
    expect(isEngagementCodeValid("RND-GEN\n")).toBe(false);
    expect(isEngagementCodeValid("RND-GEN\r")).toBe(false);
  });
  it("rejects an empty code", () => {
    expect(isEngagementCodeValid("")).toBe(false);
  });
});

describe("invalidEngagementCodes — which chips are named back", () => {
  it("reports nothing when both lists are clean", () => {
    expect(invalidEngagementCodes(MAPPING_FORM)).toEqual([]);
  });
  it("reports offenders from the codes and the suffixes alike", () => {
    const form: InvoiceAccountMappingPayload = {
      ...MAPPING_FORM,
      engagementCodes: ["RND-GEN-INT", "BAD CODE"],
      engagementCodeSuffixes: ["RND-CON", "A,B"],
    };
    expect(invalidEngagementCodes(form)).toEqual(["BAD CODE", "A,B"]);
  });
});

describe("isFormComplete — invoice account mappings", () => {
  it("accepts a mapping scoped by engagement codes alone", () => {
    expect(isFormComplete("invoiceAccountMappings", MAPPING_FORM)).toBe(true);
  });
  it("accepts a mapping scoped by suffixes alone", () => {
    const form: InvoiceAccountMappingPayload = {
      ...MAPPING_FORM,
      engagementCodes: [],
      engagementCodeSuffixes: ["RND-CON"],
    };
    expect(isFormComplete("invoiceAccountMappings", form)).toBe(true);
  });
  it("refuses a mapping scoped by neither, which Travel could never match", () => {
    const form: InvoiceAccountMappingPayload = {
      ...MAPPING_FORM,
      engagementCodes: [],
      engagementCodeSuffixes: [],
    };
    expect(isFormComplete("invoiceAccountMappings", form)).toBe(false);
  });
  it("treats a blank department as filled in — the Intercompany rows carry one", () => {
    expect(isFormComplete("invoiceAccountMappings", { ...MAPPING_FORM, department: "" })).toBe(true);
  });
  it("refuses an otherwise complete form carrying a code the column cannot hold", () => {
    const form: InvoiceAccountMappingPayload = {
      ...MAPPING_FORM,
      engagementCodes: ["RND-GEN,BAL-RND"],
    };
    expect(isFormComplete("invoiceAccountMappings", form)).toBe(false);
  });
  it("refuses a mapping with no cost type chosen", () => {
    expect(isFormComplete("invoiceAccountMappings", { ...MAPPING_FORM, invCostTypeId: 0 })).toBe(false);
  });
});

describe("initialFormData — invoice account mappings", () => {
  const row: InvoiceAccountMapping = {
    id: 14,
    internalId: "351",
    accountNumber: "61033-003",
    accountClassification: "Travel - Air Ticket",
    engagementCodes: ["RND-GEN-INT", "RND-GEN-IAM"],
    engagementCodeSuffixes: ["RND-CON"],
    invCostTypeId: 1,
    costType: "Air Ticket",
    department: null,
    // Rows written before this screen existed carry the capitalised form.
    status: "Active",
  };

  it("flattens a row and lower-cases the status it was stored under", () => {
    expect(initialFormData("invoiceAccountMappings", row)).toEqual({
      internalId: "351",
      accountNumber: "61033-003",
      accountClassification: "Travel - Air Ticket",
      engagementCodes: ["RND-GEN-INT", "RND-GEN-IAM"],
      engagementCodeSuffixes: ["RND-CON"],
      invCostTypeId: 1,
      // A null department seeds "" so an untouched blank does not read as a change.
      department: "",
      status: "active",
    });
  });

  // Unlike the other tabs, this form carries a status while creating: the
  // Add dialog shows the Active/Inactive toggle, so a mapping can be filed
  // ahead of the engagement it is for. It starts active, which is what the
  // backend did when it hardcoded the value.
  it("seeds an active status when creating, so the toggle has something to show", () => {
    const form = initialFormData("invoiceAccountMappings") as InvoiceAccountMappingPayload;
    expect(form.status).toBe("active");
    expect(form.invCostTypeId).toBe(0);
  });

  it("reads as unchanged against the row it was seeded from, despite the casing", () => {
    const form = initialFormData("invoiceAccountMappings", row);
    expect(isUnchanged(row, form)).toBe(true);
    expect(changedFields(row, form)).toEqual({});
  });

  it("sends only the fields that moved", () => {
    const form = initialFormData("invoiceAccountMappings", row) as InvoiceAccountMappingPayload;
    // Same codes, different order — the order they were picked in is not a change.
    form.engagementCodes = ["RND-GEN-IAM", "RND-GEN-INT"];
    form.invCostTypeId = 4;
    expect(changedFields(row, form)).toEqual({ invCostTypeId: 4 });
  });
});
