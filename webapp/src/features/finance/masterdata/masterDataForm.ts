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

import {
  MASTER_DATA_STATUS,
  type CreditCard,
  type CreditCardPayload,
  type Department,
  type DepartmentPayload,
  type ExpenseType,
  type ExpenseTypePayload,
  type InvoiceAccountMapping,
  type InvoiceAccountMappingPayload,
  type MasterDataPayload,
  type MasterDataRow,
  type MasterDataTab,
  type Subsidiary,
  type SubsidiaryPayload,
} from "./masterDataTypes";

/**
 * Everything the Submit button's enabled state depends on.
 *
 * The per-tab rules are declared once, in `OPTIONAL_FIELDS` and
 * `EITHER_OR_GROUPS` below, and the operations that follow just read them —
 * a table both tabs can be checked against side by side, rather than the
 * same knowledge threaded separately through each function.
 */

/** Fields that may be left blank. */
const OPTIONAL_FIELDS: Record<MasterDataTab, readonly string[]> = {
  subsidiaries: [],
  departments: [],
  expenseTypes: ["expenseTypeDescription"],
  creditCards: ["comment"],
  // Blank is a real department here, not an omission: the Intercompany
  // mappings carry "" on purpose.
  invoiceAccountMappings: ["department"],
};

/**
 * Field groups where at least one member must be filled, rather than each
 * one.
 *
 * Two tabs have one, and for the same reason: a record scoped by neither
 * engagement codes nor engagement-code suffixes could never be matched, so
 * at least one of the pair has to be filled. Both forms say so in as many
 * words ("Please fill in at least one of the following fields").
 */
const EITHER_OR_GROUPS: Record<MasterDataTab, readonly (readonly string[])[]> = {
  subsidiaries: [],
  departments: [],
  expenseTypes: [["engagementCodes", "engagementCodeSuffixes"]],
  creditCards: [],
  // The backend refuses a mapping with neither (400), because Travel looks a
  // mapping up by one or the other and would never find it.
  invoiceAccountMappings: [["engagementCodes", "engagementCodeSuffixes"]],
};

/** Which column each tab sorts by on first paint. */
export const INITIAL_SORT_FIELD: Record<MasterDataTab, string> = {
  subsidiaries: "legalName",
  departments: "employeeDepartment",
  expenseTypes: "expenseType",
  creditCards: "employeeEmail",
  // By GL code, which is the column the table now leads with — a code
  // identifies one account where a name can repeat across several.
  invoiceAccountMappings: "accountNumber",
};

/**
 * A blank payload, or an existing row flattened into one.
 *
 * A number field starts at 0 and a nullable string at "" — the same values
 * `isFormComplete` below reads as "empty". That coupling is deliberate: 0 is
 * not a selectable GL code or tax id, so it doubles as "nothing chosen yet".
 */
export function initialFormData(tab: MasterDataTab, row?: MasterDataRow): MasterDataPayload {
  switch (tab) {
    case "subsidiaries": {
      const r = row as Subsidiary | undefined;
      return {
        taxCodeInternalId: r?.taxCodeInternalId ?? 0,
        taxCode: r?.taxCode ?? "",
        legalName: r?.legalName ?? "",
        code: r?.code ?? "",
        country: r?.country ?? "",
      } satisfies SubsidiaryPayload;
    }
    case "departments": {
      const r = row as Department | undefined;
      return {
        employeeDepartment: r?.employeeDepartment ?? "",
        engagementCode: r?.engagementCode ?? "",
        glCodeId: r?.glCodeId ?? 0,
      } satisfies DepartmentPayload;
    }
    case "expenseTypes": {
      const r = row as ExpenseType | undefined;
      return {
        expenseCategoryId: r?.expenseCategoryId ?? 0,
        glCodeId: r?.glCodeId ?? 0,
        expenseType: r?.expenseType ?? "",
        expenseTypeDescription: r?.expenseTypeDescription ?? "",
        engagementCodes: r?.engagementCodes ?? [],
        engagementCodeSuffixes: r?.engagementCodeSuffixes ?? [],
        // Same rule as credit cards: lower-cased, and absent when creating.
        ...(r ? { status: (r.status ?? MASTER_DATA_STATUS.active).toLowerCase() } : {}),
      } satisfies ExpenseTypePayload;
    }
    case "invoiceAccountMappings": {
      const r = row as InvoiceAccountMapping | undefined;
      return {
        internalId: r?.internalId ?? "",
        accountNumber: r?.accountNumber ?? "",
        accountClassification: r?.accountClassification ?? "",
        engagementCodes: r?.engagementCodes ?? [],
        engagementCodeSuffixes: r?.engagementCodeSuffixes ?? [],
        invCostTypeId: r?.invCostTypeId ?? 0,
        department: r?.department ?? "",
        // Same rule as credit cards: lower-cased, and absent when creating.
        // The column carries "Active" on rows written before this screen
        // existed, which is why it is normalised rather than compared raw.
        ...(r ? { status: (r.status ?? MASTER_DATA_STATUS.active).toLowerCase() } : {}),
      } satisfies InvoiceAccountMappingPayload;
    }
    case "creditCards": {
      const r = row as CreditCard | undefined;
      return {
        ccNumber: r?.ccNumber ?? "",
        ccProviderCode: r?.ccProviderCode ?? "",
        employeeEmail: r?.employeeEmail ?? "",
        leadEmails: r?.leadEmails ?? [],
        comment: r?.comment ?? "",
        // Lower-cased because the column carries a mix of "Active" and
        // "active" from older writes, and `isUnchanged` compares by value —
        // seeding the raw casing would read as an edit the moment the dialog
        // opened. Absent when creating; see CreditCardPayload.
        ...(r ? { status: (r.status ?? MASTER_DATA_STATUS.active).toLowerCase() } : {}),
      } satisfies CreditCardPayload;
    }
  }
}

/**
 * Whether a card number matches the shape its provider issues.
 *
 * Returns false, rather than throwing, for a provider outside the pair.
 * This runs on every keystroke while the form is open, so a bad provider
 * value would take the dialog down instead of just refusing to enable
 * Submit. Both providers come from a fixed two-item list, so in practice
 * this only changes what happens on a path that should not exist.
 */
export function isCreditCardNumberValid(providerCode: string, ccNumber: string): boolean {
  if (providerCode === "AMEX") return /^\d{3}-\d{5}$/.test(ccNumber);
  if (providerCode === "SVB") return /^\d{4}-\d{4}$/.test(ccNumber);
  return false;
}

/**
 * Whether one engagement code or suffix is storable.
 *
 * The two code columns hold their lists comma-separated in a single field, so
 * a comma inside one element silently becomes two codes, and a space or line
 * break becomes a code nothing will ever match. Both have reached the table
 * before now from spreadsheet pastes and had to be scrubbed out of production
 * by hand, so the rule is enforced here as well as in the backend — the
 * backend answers a bad one with a 400 the reader cannot act on, while this
 * says which chip is wrong before Submit is ever enabled.
 */
export function isEngagementCodeValid(code: string): boolean {
  return /^[\p{L}\p{N}_.-]+$/u.test(code);
}

/** The codes on this form that could not be stored as typed. */
export function invalidEngagementCodes(form: MasterDataPayload): string[] {
  const f = form as InvoiceAccountMappingPayload;
  return [...(f.engagementCodes ?? []), ...(f.engagementCodeSuffixes ?? [])].filter(
    (code) => !isEngagementCodeValid(code),
  );
}

/** "" for a string, 0 for a number, [] (or all-blank) for a list. */
function isBlank(value: unknown): boolean {
  if (Array.isArray(value)) return value.every((v) => String(v).trim() === "");
  if (typeof value === "number") return value === 0;
  return String(value ?? "").trim() === "";
}

/**
 * Whether Submit may be enabled.
 *
 * Required means filled; an either-or group means at least one member filled;
 * and on the card tab the number must also match its provider's format.
 */
export function isFormComplete(tab: MasterDataTab, form: MasterDataPayload): boolean {
  const optional = OPTIONAL_FIELDS[tab];
  const groups = EITHER_OR_GROUPS[tab];

  for (const [key, value] of Object.entries(form)) {
    if (optional.includes(key)) continue;

    const group = groups.find((g) => g.includes(key));
    if (group) {
      // Satisfied by any member, so a blank one is only a failure when every
      // other member is blank too.
      const anyFilled = group.some((member) => !isBlank(form[member as keyof MasterDataPayload]));
      if (!anyFilled) return false;
      continue;
    }

    if (isBlank(value)) return false;
  }

  // A storable engagement code is part of "filled in" for the same reason a
  // well-formed card number is below: the reader should not reach Submit on a
  // value the column cannot hold.
  if (tab === "invoiceAccountMappings" && invalidEngagementCodes(form).length > 0) return false;

  // A well-formed card number is part of "filled in", not a separate check
  // the reader discovers only after pressing Submit.
  if (tab === "creditCards") {
    const { ccProviderCode, ccNumber } = form as CreditCardPayload;
    if (ccProviderCode.length > 0 && !isCreditCardNumberValid(ccProviderCode, ccNumber)) return false;
  }

  return true;
}

/**
 * Whether one field still holds what the row holds.
 *
 * Shared by `isUnchanged` and `changedFields` because they have to agree: if
 * this says a field is untouched, the PATCH must not carry it.
 *
 * Arrays are compared as sets, since the order the reader picked them in is
 * not a change. `status` is compared case-insensitively — the column holds
 * both "Active" and "active" from older writes — and a nullish row value
 * falls back to active, matching what `initialFormData` seeds.
 */
function sameFieldValue(key: string, rowValue: unknown, formValue: unknown): boolean {
  if (Array.isArray(formValue)) {
    const before = [...((rowValue as string[]) ?? [])].sort();
    const after = [...formValue].sort();
    return JSON.stringify(before) === JSON.stringify(after);
  }
  if (key === "status") {
    const normalizedRow = rowValue ? String(rowValue).toLowerCase() : MASTER_DATA_STATUS.active;
    return normalizedRow === String(formValue).toLowerCase();
  }
  return rowValue === formValue;
}

/**
 * Whether the form still matches the row it was opened on.
 *
 * Only the payload's own keys are compared; a row carries resolved display
 * columns (glCode, glAccountName, …) that the form never edits. A null on the
 * row reads as "" so an untouched empty comment does not count as a change.
 */
export function isUnchanged(row: MasterDataRow, form: MasterDataPayload): boolean {
  return Object.entries(form).every(([key, formValue]) =>
    sameFieldValue(key, (row as unknown as Record<string, unknown>)[key] ?? "", formValue),
  );
}

/**
 * The changed fields only.
 *
 * PATCH bodies are partial on this backend, and sending the untouched fields
 * back would make every edit look like a change to every column in whatever
 * the service writes to its audit trail.
 */
export function changedFields(row: MasterDataRow, form: MasterDataPayload): Partial<MasterDataPayload> {
  const patch: Record<string, unknown> = {};
  for (const [key, formValue] of Object.entries(form)) {
    const rowValue = (row as unknown as Record<string, unknown>)[key] ?? "";
    if (!sameFieldValue(key, rowValue, formValue)) patch[key] = formValue;
  }
  return patch as Partial<MasterDataPayload>;
}
