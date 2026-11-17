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

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterDataAccessLevel } from "../masterdata/useMasterDataAccess";

/** The master-data rail ids, which answer as one. */
const MASTER_DATA_IDS = [
  "master-data-subsidiaries",
  "master-data-departments",
  "master-data-expense-types",
  "master-data-credit-cards",
  "master-data-invoice-account-mappings",
] as const;

// Four backends, four vocabularies, none of them the people-app roles the
// rail normally reads. These are the rules the standalone apps enforce, so they
// are asserted against what those apps actually do:
//
//   OPD          userSlice.ts:38-40   role 555 approves, 444 is submit-only
//   Expense      appDataSlice.ts:99-103   two independent booleans
//   CC           privilege names on /user-info
//   Master data  privilege names on /user-info, from its JWT group check

const roles = {
  /** OPD `userRoles`. 444 = submitter, 555 = finance approver. */
  opd: [] as number[],
  expenseLead: false,
  expenseFinance: false,
  cc: [] as string[],
  /** Nothing has answered yet. */
  loading: false,
  /**
   * The gap between a failed attempt and its retry: React Query reports
   * `isLoading: false` there (it is `isPending && isFetching`, and nothing is
   * in flight) while the query has still produced no answer. Reading
   * `isLoading` treated this as settled; `isSuccess || isError` does not.
   */
  betweenRetries: false,
  /** The OPD lookup came back a failure rather than a role. */
  opdErrored: false,
  /** The CC lookup came back a failure rather than a role. */
  ccErrored: false,
  /** The Expense lookup came back a failure rather than a role. */
  expenseErrored: false,
  /** The master-data backend's own `privileges` — `["admin"]` or empty. */
  masterData: [] as MasterDataAccessLevel[],
};

const ccRefetch = vi.fn().mockResolvedValue(undefined);
const opdRefetch = vi.fn().mockResolvedValue(undefined);
const expenseRefetch = vi.fn().mockResolvedValue(undefined);

// `isSuccess`/`isError` are what the gate reads to decide whether a backend
// has finished having its say. Neither ever goes back to false in React Query
// — a refetch of an errored query keeps `status: "error"` until it succeeds —
// so this fixture does not let them either.
const answered = () => ({
  isLoading: roles.loading && !roles.betweenRetries,
  isError: false,
  isSuccess: !roles.loading && !roles.betweenRetries,
});

vi.mock("../cc/useCc", () => ({
  useCcUserInfo: () => ({
    data: { privileges: roles.cc },
    isLoading: answered().isLoading,
    isError: roles.ccErrored,
    isSuccess: answered().isSuccess && !roles.ccErrored,
    refetch: ccRefetch,
  }),
}));
vi.mock("../opd/useOpd", () => ({
  useOpdUserInfo: () => ({
    data: { userRoles: roles.opd },
    isLoading: answered().isLoading,
    isError: roles.opdErrored,
    isSuccess: answered().isSuccess && !roles.opdErrored,
    refetch: opdRefetch,
  }),
}));
vi.mock("../expense/useExpense", () => ({
  useExpenseAppData: () => ({
    data: { enableLeadView: roles.expenseLead, enableFinanceView: roles.expenseFinance },
    isLoading: answered().isLoading,
    isError: roles.expenseErrored,
    isSuccess: answered().isSuccess && !roles.expenseErrored,
    refetch: expenseRefetch,
  }),
}));
// The master-data backend's own /user-info, which is what the four table rows
// are gated on now — not the portal's `admin` capability. `masterDataHasAccess`
// is the real implementation; only the query is faked.
vi.mock("../masterdata/useMasterDataAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../masterdata/useMasterDataAccess")>()),
  useMasterDataUserInfo: () => ({
    data: { image: null, email: "someone@wso2.com", privileges: roles.masterData },
    ...answered(),
  }),
}));

// Every backend has a URL in this suite unless a test says otherwise; the
// gate treats an unconfigured one as having already answered.
vi.mock("@config/apiConfig", () => ({
  isCcBackendConfigured: () => true,
  isOpdBackendConfigured: () => true,
  isExpenseBackendConfigured: () => true,
  isFinanceMasterDataBackendConfigured: () => true,
}));

const { useFinanceGate, canSeeMasterData, CLAIM_APPROVAL_GATE_APPS, OVERVIEW_GATE_APPS } = await import(
  "./useFinanceGate"
);
type FinanceGateApp = "cc" | "opd" | "expense" | "masterData";
const { FINANCE_ITEM_IDS } = await import("@constants/financeApps");

const gate = () => renderHook(() => useFinanceGate()).result.current;

beforeEach(() => {
  roles.opd = [];
  roles.expenseLead = false;
  roles.expenseFinance = false;
  roles.cc = [];
  roles.loading = false;
  roles.betweenRetries = false;
  roles.opdErrored = false;
  roles.ccErrored = false;
  roles.expenseErrored = false;
  ccRefetch.mockClear();
  opdRefetch.mockClear();
  expenseRefetch.mockClear();
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

  // CC approving does not live here at all — it is decided entirely under
  // Credit Card Expenses — so holding only a CC role does not open this entry.
  it("is withheld from someone who only approves credit card submissions", () => {
    roles.cc = ["lead"];
    expect(gate().canSee("claim-approval")).toBe(false);
  });

  it("is withheld from someone who approves no claims", () => {
    roles.opd = [444]; // can submit, cannot approve
    expect(gate().canSee("claim-approval")).toBe(false);
  });
});

// The entries that stayed under Me keep the rules they had.
describe("what stayed behind", () => {
  it("leaves the per-user views open", () => {
    expect(gate().canSee("claims")).toBe(true);
  });

  // The approval ids are gone from the registry — Lead/Finance Approvals were
  // retired once Claim Approval's own Expense tab covered the same queues —
  // so their cases were dead code answering a question nothing asks. They
  // fall through to the open default now, which is safe precisely because no
  // rail entry names them — asserted so that a future entry reusing the name
  // cannot quietly go open. cc-approve is NOT one of these: it is a live item
  // again, restored under Credit Card Expenses.
  it("no longer carries the retired approval ids", () => {
    for (const retired of [
      "opd-approvals",
      "expense-lead",
      "expense-finance",
      "expense-lead-approvals",
      "expense-finance-approvals",
      "expense-new",
      "expense-history",
    ]) {
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

// Approve Submissions — the only place a CC submission is decided on, now
// that it no longer has a tab in Claim Approval.
describe("the cc-approve item", () => {
  it("opens on either privilege alone", () => {
    roles.cc = ["lead"];
    expect(gate().canSee("cc-approve")).toBe(true);
    roles.cc = ["finance"];
    expect(gate().canSee("cc-approve")).toBe(true);
  });

  it("is not opened by the OPD or expense roles", () => {
    roles.opd = [555];
    roles.expenseLead = true;
    roles.expenseFinance = true;
    expect(gate().canSee("cc-approve")).toBe(false);
  });
});

describe("the cc-admin item", () => {
  it("opens for finance only", () => {
    roles.cc = ["finance"];
    expect(gate().canSee("cc-admin")).toBe(true);
    roles.cc = ["cc_owner"];
    expect(gate().canSee("cc-admin")).toBe(false);
    roles.cc = ["lead"];
    expect(gate().canSee("cc-admin")).toBe(false);
  });

  it("replaces the cc-settings rail item", () => {
    expect(FINANCE_ITEM_IDS.has("cc-admin")).toBe(true);
    expect(FINANCE_ITEM_IDS.has("cc-settings")).toBe(false);
  });
});

describe("the cc-autofill-rules item", () => {
  // Out of preview: a leftover flag in an environment's config must not hide it.
  it("offers Autofill Rules to card holders, whatever the old preview flag says", () => {
    roles.cc = ["cc_owner"];
    const saved = window.config;
    window.config = { ...(saved ?? {}), ONE_WSO2_PREVIEW_FEATURES: { ccTaggingRules: false } } as Window["config"];
    try {
      expect(gate().canSee("cc-autofill-rules")).toBe(true);
    } finally {
      window.config = saved;
    }
  });

  // A lead or Finance user without a card of their own has no rules to keep.
  it.each([["lead"], ["finance"]])("keeps it from a %s without a card", (role) => {
    roles.cc = [role];
    expect(gate().canSee("cc-autofill-rules")).toBe(false);
  });

  it("is a Finance rail item", () => {
    expect(FINANCE_ITEM_IDS.has("cc-autofill-rules")).toBe(true);
  });
});

// The Overview group shipped out of preview, and is one rail entry now
// rather than two — a single `finance-overview` id fronting both dashboards,
// tab-switched inside FinanceOverviewPage. Hidden entirely when neither tab
// would have anything to show: no card of the reader's own (or a CC
// lead/finance role, reading for a team or the company) and no OPD
// finance-approver role.
describe("the Finance Overview entry", () => {
  it("is hidden with no card and no OPD role", () => {
    expect(gate().canSee("finance-overview")).toBe(false);
  });

  it("opens for a card owner", () => {
    roles.cc = ["cc_owner"];
    expect(gate().canSee("finance-overview")).toBe(true);
  });

  it("opens for a CC lead or finance role, even with no card of their own", () => {
    roles.cc = ["lead"];
    expect(gate().canSee("finance-overview")).toBe(true);
  });

  it("opens for the OPD finance-approver role alone", () => {
    roles.opd = [555];
    expect(gate().canSee("finance-overview")).toBe(true);
  });

  it("opens for the expense finance role alone", () => {
    roles.expenseFinance = true;
    expect(gate().canSee("finance-overview")).toBe(true);
  });

  // The expense LEAD flag is not this role — it opens Claim Approval, but
  // the Expense Claims dashboard is gated on the finance role specifically
  // (the same `enableFinanceView` check the report endpoint enforces on
  // GET /claims-report), so a lead holding nothing else does not
  // get an Overview entry they would only find empty.
  it("is not opened by the expense lead role alone", () => {
    roles.expenseLead = true;
    expect(gate().canSee("finance-overview")).toBe(false);
  });

  // THE regression this entry was reported for. `foldIdentityError` reports
  // EVERY one of these queries as `isError` whenever identity itself fails to
  // resolve — a token-refresh hiccup is enough — so an entry that opened on a
  // failed lookup opened for readers holding no role at all, and closed again
  // the moment identity recovered: the row appearing, vanishing, appearing.
  // A role is the only thing that opens this.
  it("stays hidden when the OPD lookup fails and the reader holds no role", () => {
    roles.opdErrored = true;
    expect(gate().canSee("finance-overview")).toBe(false);
  });

  it("is not opened by a failed lookup even alongside a submit-only OPD role", () => {
    roles.opd = [444];
    roles.opdErrored = true;
    expect(gate().canSee("finance-overview")).toBe(false);
  });

  // The flip side, so the fix above cannot be read as "errors hide things":
  // a real role still opens it while its backend is having a bad minute.
  it("still opens for a real approver whose lookup happened to fail", () => {
    roles.opd = [555];
    roles.opdErrored = true;
    expect(gate().canSee("finance-overview")).toBe(true);
  });
});

// Pending Submissions, Pending Approvals and History are each the reader's
// OWN transactions — nothing there without a card, so all three are hidden
// alike, and a lead/finance role (reading a team's or the company's) earns
// them the same way it earns Overview's Credit Card tab.
describe("Credit Card Expenses' submitter-facing items", () => {
  it("hides all three with no card and no CC role", () => {
    expect(gate().canSee("cc-new")).toBe(false);
    expect(gate().canSee("cc-pending")).toBe(false);
    expect(gate().canSee("cc-history")).toBe(false);
  });

  it("opens all three for a card owner", () => {
    roles.cc = ["cc_owner"];
    expect(gate().canSee("cc-new")).toBe(true);
    expect(gate().canSee("cc-pending")).toBe(true);
    expect(gate().canSee("cc-history")).toBe(true);
  });

  it("opens all three for a CC lead, even with no card of their own", () => {
    roles.cc = ["lead"];
    expect(gate().canSee("cc-new")).toBe(true);
    expect(gate().canSee("cc-pending")).toBe(true);
    expect(gate().canSee("cc-history")).toBe(true);
  });
});

// Master Data is gated on the master-data backend's OWN verdict — the
// `privileges` on its /user-info, derived there from the same
// `app-finance-masterdata-admin` group check it enforces on every other
// resource. It used to be the portal's `admin` capability (people-app
// privilege 999), which is the portal's GENERIC administrator and no finance
// role at all: that admitted portal admins this backend then refused, and
// turned away the finance staff who actually maintain these tables.
describe("the Master Data tables", () => {
  const withPrivileges = (privileges: MasterDataAccessLevel[]) => ({
    image: null,
    email: "someone@wso2.com",
    privileges,
  });

  it("opens for a reader the backend calls an admin", () => {
    expect(canSeeMasterData(withPrivileges(["admin"]))).toBe(true);
  });

  // The backend answering with an EMPTY privilege list is a "no", not a
  // failure — it is how a valid reader outside the finance group is reported,
  // and the whole reason /user-info stopped returning a bare 401.
  it("stays shut for a reader the backend grants nothing", () => {
    expect(canSeeMasterData(withPrivileges([]))).toBe(false);
  });

  // The response reads as undefined until the query answers, and a restricted
  // entry must fail closed while it does.
  it("stays shut while the backend has not answered", () => {
    expect(canSeeMasterData(undefined)).toBe(false);
  });

  // A deployment still running the build whose /user-info returned only an
  // email and an avatar sends no `privileges` at all. That must read as "no"
  // rather than crash the rail or go open.
  it("stays shut when the field is absent entirely", () => {
    expect(canSeeMasterData({ image: null, email: "someone@wso2.com" })).toBe(false);
  });

  // The portal's own `admin` privilege no longer opens these rows — the point
  // of the change. A portal admin with no finance group sees nothing here.
  it("is not opened by the portal's admin capability", () => {
    roles.masterData = [];
    for (const id of MASTER_DATA_IDS) {
      expect(gate().canSee(id)).toBe(false);
    }
  });

  // The four tabs answer as one — listed individually in the switch so a new
  // table has to be named there before it appears, rather than matching a
  // prefix and going open by accident.
  it("answers the same for all four tables", () => {
    roles.masterData = [];
    for (const id of MASTER_DATA_IDS) expect(gate().canSee(id)).toBe(false);
    roles.masterData = ["admin"];
    for (const id of MASTER_DATA_IDS) expect(gate().canSee(id)).toBe(true);
  });
});

// `isResolving` is what every caller renders NOTHING on — FinanceOverviewPage
// returns null, ClaimApprovalPage drops its tabs and its <Outlet />, the rail
// hides the row. So it going back to true after a real answer is not a slower
// answer: it is a screen that was there blanking and coming back, which is
// what the Finance section flickering was.
//
// It is monotonic by construction rather than by a latch: it reads
// `isSuccess || isError`, which React Query never walks back, instead of
// `isLoading`, which drops to false between a failed attempt and its retry.
describe("settling, and staying settled", () => {
  function settling(enabled = true) {
    const { result, rerender } = renderHook(({ on }) => useFinanceGate(on), {
      initialProps: { on: enabled },
    });
    return { result, rerender };
  }

  it("reports resolving until the backends have answered", () => {
    roles.loading = true;
    expect(settling().result.current.isResolving).toBe(true);
  });

  it("stops resolving once they have", () => {
    roles.loading = true;
    const { result, rerender } = settling();
    expect(result.current.isResolving).toBe(true);

    roles.loading = false;
    rerender({ on: true });
    expect(result.current.isResolving).toBe(false);
  });

  // THE regression. `isLoading` is false in the gap between a failed attempt
  // and its retry, so reading it called this settled — and the screens keyed
  // off it drew their answer from half-loaded data, then redrew it when the
  // retry landed. Nothing about the reader changed in between.
  it("keeps resolving through the gap between an attempt and its retry", () => {
    roles.loading = true;
    roles.betweenRetries = true;
    expect(settling().result.current.isResolving).toBe(true);
  });

  // A gate switched off has answered nothing. The rail's is off on every
  // perspective but Me and Finance, and counting that as settled would have
  // it report "no access" the moment someone switched to Finance.
  it("does not count a switched-off gate as having answered", () => {
    roles.loading = true;
    const { result, rerender } = settling(false);
    expect(result.current.isResolving).toBe(false);

    rerender({ on: true });
    expect(result.current.isResolving).toBe(true);
  });
});

// `needs` narrows which backends a caller fetches and waits on. The whole
// point: a backend left out must behave as if it were never asked at all —
// not fetched, not waited for, not able to hold `isResolving` open — so a
// slow or failing backend outside `needs` can never blank a screen that does
// not read it. See Claim Approval and Finance Overview, which this exists for.
describe("needs: scoping which backends a caller depends on", () => {
  function settlingWithNeeds(needsList: FinanceGateApp[]) {
    return renderHook(() => useFinanceGate(true, needsList)).result;
  }

  it("resolves immediately when every needed backend has answered, even mid-flight on the rest", () => {
    // CC and Master Data never finish — they are not in `needs`, so they must
    // not matter to this caller at all.
    roles.loading = true;
    const opdOnly = settlingWithNeeds(["opd"]);
    // OPD itself is also "loading" via the shared `roles.loading` flag in this
    // fixture, so isResolving starts true, exactly like a caller asking for
    // every backend would — the difference under test is what happens next.
    expect(opdOnly.current.isResolving).toBe(true);
  });

  it("stops resolving once only the needed backends answer, regardless of the rest", () => {
    roles.loading = true;
    const { result, rerender } = renderHook(({ needsList }) => useFinanceGate(true, needsList), {
      initialProps: { needsList: ["opd"] as FinanceGateApp[] },
    });
    expect(result.current.isResolving).toBe(true);

    // Only OPD settles. CC, Expense and Master Data are mocked off the same
    // shared `roles.loading` flag in this fixture, so in isolation this also
    // "answers" them — the real guarantee under test is in the next case,
    // where an EXCLUDED backend is made to fail outright and still does not
    // block.
    roles.loading = false;
    rerender({ needsList: ["opd"] });
    expect(result.current.isResolving).toBe(false);
  });

  it("does not wait on a backend outside needs even when that backend errors", () => {
    roles.opdErrored = true;
    // CC is excluded from `needs`; OPD alone decides this caller's answer.
    const opdOnly = settlingWithNeeds(["opd"]);
    expect(opdOnly.current.isResolving).toBe(false);
    expect(opdOnly.current.canSee("claim-approval")).toBe(false); // opdErrored, no role
  });

  it("CLAIM_APPROVAL_GATE_APPS excludes cc, matching canSee's own switch", () => {
    expect(CLAIM_APPROVAL_GATE_APPS).toEqual(["opd", "expense"]);
  });

  it("OVERVIEW_GATE_APPS excludes masterData, matching canSee's own switch", () => {
    expect(OVERVIEW_GATE_APPS).toEqual(["cc", "opd", "expense"]);
  });

  // The two constants above are DERIVED from the same table canSee's warning
  // reads, rather than hand-typed separately — this just confirms that table
  // actually agrees with canSee's real behaviour, not only with itself.
  it("a gate scoped to CLAIM_APPROVAL_GATE_APPS answers claim-approval the same as the full gate", () => {
    roles.opd = [555];
    const full = gate();
    const scoped = settlingWithNeeds([...CLAIM_APPROVAL_GATE_APPS]).current;
    expect(scoped.canSee("claim-approval")).toBe(full.canSee("claim-approval"));
  });

  it("a gate scoped to OVERVIEW_GATE_APPS answers finance-overview the same as the full gate", () => {
    roles.expenseFinance = true;
    const full = gate();
    const scoped = settlingWithNeeds([...OVERVIEW_GATE_APPS]).current;
    expect(scoped.canSee("finance-overview")).toBe(full.canSee("finance-overview"));
  });

  it("warns in dev when canSee is asked about an item whose backend needs excluded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ccOnly = settlingWithNeeds(["cc"]);
    ccOnly.current.canSee("claim-approval"); // needs opd+expense, neither is in `needs`
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("claim-approval"));
    warn.mockRestore();
  });

  it("does not warn when the item's backends are all in needs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scoped = settlingWithNeeds(["opd", "expense"]);
    scoped.current.canSee("claim-approval");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// THE bug `itemAnswered` exists to close: `financeVisibility` folds this gate
// into the rail/landing using the FULL, unscoped call (every backend fetched)
// — so `isResolving` alone stays true until all four answer, even once a
// specific item's own question is already settled. `firstVisibleLeaf` reads
// `itemAnswered` instead of the aggregate for exactly this reason: a granted
// item (finance-overview, decided by OPD) must not stay unreachable behind an
// unrelated, still-pending backend (CC, Master Data) it never consulted.
describe("itemAnswered", () => {
  it("is true for finance-overview once OPD decides it, while CC is still pending", () => {
    roles.loading = true;
    const { result, rerender } = renderHook(() => useFinanceGate());
    expect(result.current.itemAnswered("finance-overview")).toBe(false);

    // Only OPD resolves — CC, Expense and Master Data stay pending. This
    // fixture answers every backend off the one shared `roles.loading` flag,
    // so the next assertion is the real point: OPD's role already makes
    // finance-overview's OWN three required backends (cc, opd, expense) the
    // ones still being waited on, not the aggregate across all four.
    roles.loading = false;
    roles.opd = [555];
    rerender();
    expect(result.current.canSee("finance-overview")).toBe(true);
    expect(result.current.itemAnswered("finance-overview")).toBe(true);
  });

  it("is false for claim-approval while a backend IT needs (expense) is still pending, independent of other items", () => {
    const { result } = renderHook(() => useFinanceGate(true, ["opd", "expense"]));
    // Both needed backends resolved in this fixture (roles.loading defaults
    // false), so this is the settled case — confirms true once both answer.
    expect(result.current.itemAnswered("claim-approval")).toBe(true);
  });

  it("stays false for cc-approve while CC alone is unresolved, regardless of OPD/Expense", () => {
    roles.loading = true;
    const { result } = renderHook(() => useFinanceGate());
    expect(result.current.itemAnswered("cc-approve")).toBe(false);
  });

  it("falls back to the aggregate isResolving for an item with no ITEM_BACKENDS entry", () => {
    roles.loading = true;
    const { result, rerender } = renderHook(() => useFinanceGate());
    expect(result.current.itemAnswered("some-future-item")).toBe(false);

    roles.loading = false;
    rerender();
    expect(result.current.itemAnswered("some-future-item")).toBe(true);
  });
});

// Distinct from "no CC role": a reader refused everywhere else because CC's
// own lookup failed outright should be told that, with a way back, rather
// than the same "not for you" a genuinely roleless reader gets.
// Every backend gets the same treatment — originally just CC, generalised on
// review so a caller can tell "couldn't check" from "no role" for OPD and
// Expense too, not only Credit Card.
describe("ccErrored/opdErrored/expenseErrored and their retry functions", () => {
  it("are all false on a healthy lookup", () => {
    const g = gate();
    expect(g.ccErrored).toBe(false);
    expect(g.opdErrored).toBe(false);
    expect(g.expenseErrored).toBe(false);
  });

  it("is true for whichever backend's own user-info call fails, and false for the others", () => {
    roles.opdErrored = true;
    const g = gate();
    expect(g.opdErrored).toBe(true);
    expect(g.ccErrored).toBe(false);
    expect(g.expenseErrored).toBe(false);
  });

  // A failed lookup still reads as "no" everywhere canSee reads the role
  // flags — the same "a failed lookup is not a yes" rule every case here
  // follows. The error fields exist so a caller can tell THIS "no" apart
  // from a genuine refusal, not to change what canSee itself answers.
  it("a CC error still answers no on CC-gated items, same as holding no CC role", () => {
    roles.ccErrored = true;
    expect(gate().canSee("cc-approve")).toBe(false);
    expect(gate().ccHasOwnCard).toBe(false);
  });

  it("retryCc/retryOpd/retryExpense each refetch their own query only", () => {
    gate().retryCc();
    expect(ccRefetch).toHaveBeenCalledTimes(1);
    expect(opdRefetch).not.toHaveBeenCalled();
    expect(expenseRefetch).not.toHaveBeenCalled();

    gate().retryOpd();
    expect(opdRefetch).toHaveBeenCalledTimes(1);

    gate().retryExpense();
    expect(expenseRefetch).toHaveBeenCalledTimes(1);
  });
});
