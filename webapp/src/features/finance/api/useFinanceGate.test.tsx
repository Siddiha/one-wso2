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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Three backends, three vocabularies, none of them the people-app roles the
// rail normally reads. These are the rules the standalone apps enforce, so they
// are asserted against what those apps actually do:
//
//   OPD      userSlice.ts:38-40   role 555 approves, 444 is submit-only
//   Expense  appDataSlice.ts:99-103   two independent booleans
//   CC       privilege names on /user-info

const roles = {
  /** OPD `userRoles`. 444 = submitter, 555 = finance approver. */
  opd: [] as number[],
  expenseLead: false,
  expenseFinance: false,
  cc: [] as string[],
  loading: false,
};

vi.mock("../cc/useCc", () => ({
  useCcUserInfo: () => ({ data: { privileges: roles.cc }, isLoading: roles.loading }),
}));
vi.mock("../opd/useOpd", () => ({
  useOpdUserInfo: () => ({ data: { userRoles: roles.opd }, isLoading: roles.loading }),
}));
vi.mock("../expense/useExpense", () => ({
  useExpenseAppData: () => ({
    data: { enableLeadView: roles.expenseLead, enableFinanceView: roles.expenseFinance },
    isLoading: roles.loading,
  }),
}));

const { useFinanceGate } = await import("./useFinanceGate");
const { FINANCE_ITEM_IDS } = await import("@constants/financeApps");

const gate = () => renderHook(() => useFinanceGate()).result.current;

beforeEach(() => {
  roles.opd = [];
  roles.expenseLead = false;
  roles.expenseFinance = false;
  roles.cc = [];
  roles.loading = false;
});

// The entry appears when ANY claim is approvable. Requiring all three would
// hide the screen from almost everyone: holding every role on three separate
// backends is the rare case, not the common one.
describe("the Claim approval entry", () => {
  it("is offered to someone who only approves OPD", () => {
    roles.opd = [555];
    expect(gate().canSee("claim-approval")).toBe(true);
  });

  it("is offered to someone who only leads expense claims", () => {
    roles.expenseLead = true;
    expect(gate().canSee("claim-approval")).toBe(true);
  });

  it("is offered to someone who only signs off expense claims", () => {
    roles.expenseFinance = true;
    expect(gate().canSee("claim-approval")).toBe(true);
  });

  it("is withheld from someone who approves no claims", () => {
    roles.opd = [444]; // can submit, cannot approve
    roles.cc = ["lead", "finance"]; // credit card is not a claim type here
    expect(gate().canSee("claim-approval")).toBe(false);
  });
});

describe("the OPD tab", () => {
  // userSlice.ts:39-40 — 444 grants the submit view, 555 grants approvals.
  it("needs the approver role, not the submitter one", () => {
    roles.opd = [444];
    expect(gate().canSee("claim-approval-opd")).toBe(false);
    roles.opd = [444, 555];
    expect(gate().canSee("claim-approval-opd")).toBe(true);
  });

  // There is no lead stage in OPD, so no expense flag can open it.
  it("is not opened by either expense flag", () => {
    roles.expenseLead = true;
    roles.expenseFinance = true;
    expect(gate().canSee("claim-approval-opd")).toBe(false);
  });
});

describe("the expense tab", () => {
  // appDataSlice.ts:99-103 — the two flags are pushed independently.
  it("opens on either flag alone", () => {
    roles.expenseLead = true;
    expect(gate().canSee("claim-approval-expense")).toBe(true);
    roles.expenseLead = false;
    roles.expenseFinance = true;
    expect(gate().canSee("claim-approval-expense")).toBe(true);
  });

  it("is not opened by the OPD role", () => {
    roles.opd = [555];
    expect(gate().canSee("claim-approval-expense")).toBe(false);
  });
});

// The entries that stayed under Me keep the rules they had.
describe("what stayed behind", () => {
  it("still gates credit card approval on its own privileges", () => {
    expect(gate().canSee("cc-approve")).toBe(false);
    roles.cc = ["lead"];
    expect(gate().canSee("cc-approve")).toBe(true);
  });

  it("leaves the per-user views open", () => {
    expect(gate().canSee("claims")).toBe(true);
    expect(gate().canSee("cc-history")).toBe(true);
  });

  // The three approval ids are gone from the registry, so their cases were dead
  // code answering a question nothing asks. They fall through to the open
  // default now, which is safe precisely because no rail entry names them —
  // asserted so that a future entry reusing the name cannot quietly go open.
  it("no longer carries the retired approval ids", () => {
    for (const retired of ["opd-approvals", "expense-lead", "expense-finance"]) {
      expect(FINANCE_ITEM_IDS.has(retired), `${retired} is still a rail item`).toBe(false);
    }
  });

  // Claim approval is not an item of any single app, so it is named into the
  // set by hand — without that the rail would fall back to people-app
  // capabilities, which cannot express "expense finance approver".
  it("routes the claim-approval entry through this gate", () => {
    expect(FINANCE_ITEM_IDS.has("claim-approval")).toBe(true);
  });
});

// The tile on the Finance overview asks the gate by this id, so the flag has to
// be answered here and not only by dropping the registry entry.
describe("a preview-gated item", () => {
  const originalConfig = window.config;
  afterEach(() => {
    window.config = originalConfig;
  });

  it("is refused when the preview flag is absent", () => {
    window.config = { ...(window.config ?? {}) } as Window["config"];
    delete (window.config as { ONE_WSO2_PREVIEW_FEATURES?: unknown }).ONE_WSO2_PREVIEW_FEATURES;
    expect(gate().canSee("expense-new")).toBe(false);
  });

  it("is allowed when the preview flag is on", () => {
    window.config = {
      ...(window.config ?? {}),
      ONE_WSO2_PREVIEW_FEATURES: { expenseSubmitter: true },
    } as Window["config"];
    expect(gate().canSee("expense-new")).toBe(true);
  });
});
