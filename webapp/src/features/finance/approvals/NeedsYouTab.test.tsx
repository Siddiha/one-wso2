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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// The combined queue. What matters is that it asks each backend for the right
// stage, dates the wait from when the claim reached THIS approver, and never
// lets one queue failing blank the other.

const iso = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();

const flags = { lead: true, finance: true, opd: true };
const searches: { expense: Record<string, unknown>[]; opd: Record<string, unknown>[] } = {
  expense: [],
  opd: [],
};
const data = {
  lead: [] as unknown[],
  finance: [] as unknown[],
  opd: [] as unknown[],
  expenseFails: false,
  opdFails: false,
  appDataFails: false,
  opdUserInfoFails: false,
  queuesLoading: false,
};

vi.mock("../expense/useExpense", () => ({
  useExpenseAppData: () => ({
    data: {
      userInfo: { workEmail: "me@wso2.com" },
      get enableLeadView() {
        return flags.lead;
      },
      get enableFinanceView() {
        return flags.finance;
      },
    },
    isPending: false,
    isLoading: false,
    isError: data.appDataFails,
    error: new Error("expense app-data down"),
  }),
  useExpenseClaims: (payload: Record<string, unknown>, enabled = true) => {
    if (enabled) searches.expense.push(payload);
    const isLead = Array.isArray(payload.status) && payload.status[0] === "PENDING_LEAD";
    return {
      data: !enabled ? [] : isLead ? data.lead : data.finance,
      // As React Query reports a DISABLED query: it never fetches, so it stays
      // `pending` forever while `isLoading` — pending AND fetching — is false.
      // Hardcoding `isPending: false` here is what let a screen that waits on
      // the wrong flag pass its tests and spin in the browser.
      isPending: !enabled,
      isLoading: enabled && data.queuesLoading,
      isError: data.expenseFails && enabled,
      error: new Error("expense backend down"),
    };
  },
  // Only feeds the review screen's name resolver, which falls back to the
  // bare email with nothing here — nothing under test cares which name shows.
  useExpenseEmployees: () => ({ data: directory, isLoading: false, isError: false }),
}));

// Subsidiary master data, for the entity dropdown. Mocked so these tests do not
// start a real query — an extra hook means an extra render, which would double
// what the recording mocks below see.
vi.mock("../expense/dashboard/useExpenseDashboard", () => ({
  useExpenseSubsidiaries: () => ({
    data: [
      { id: 1, code: "WSO2 - SRI LANKA", legalName: "WSO2 Lanka (Pvt) Ltd", currencyCode: "LKR", country: "Sri Lanka" },
      { id: 2, code: "WSO2 - US", legalName: "WSO2 LLC", currencyCode: "USD", country: "United States" },
      // Two codes, one legal name — the country disambiguates them.
      { id: 3, code: "WSO2 - UK", legalName: "WSO2 (UK) LIMITED", currencyCode: "GBP", country: "United Kingdom" },
      { id: 4, code: "WSO2 - SPAIN", legalName: "WSO2 (UK) LIMITED", currencyCode: "EUR", country: "Spain" },
    ],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../opd/useOpd", () => ({
  useOpdUserInfo: () => ({
    data: { userRoles: flags.opd ? [555] : [444] },
    isPending: false,
    isLoading: false,
    isError: data.opdUserInfoFails,
    error: new Error("opd user-info down"),
  }),
  useOpdClaims: (payload: Record<string, unknown>, enabled = true) => {
    if (enabled) searches.opd.push(payload);
    return {
      data: enabled ? data.opd : [],
      isPending: !enabled,
      isLoading: enabled && data.queuesLoading,
      isError: data.opdFails && enabled,
      error: new Error("opd backend down"),
    };
  },
  // Only feeds the "Filter by email" dropdown's options — nothing under test
  // cares which addresses it offers.
  useOpdEmployees: () => ({ data: [], isLoading: false, isError: false }),
}));

// An expense claim now takes over the whole tab — the app's own Lead/Finance
// Approvals review screen, tested in its own file — rather than opening in a
// dialog here. Stubbed the same way OPD's dialog is: what this file cares
// about is WHICH claim opened it and with which stage, not the review
// screen's own internals.
vi.mock("../expense/approvals/ExpenseApprovalReview", () => ({
  ExpenseApprovalReview: ({
    claim,
    stage,
  }: {
    claim: { id: string };
    stage: string;
  }) => (
    <div data-testid="expense-review" data-stage={stage}>
      {claim.id}
    </div>
  ),
}));
// OPD now takes over the tab the same way expense does — its own review
// screen, tested in its own file — rather than opening in a dialog.
vi.mock("../opd/approvals/OpdApprovalReview", () => ({
  OpdApprovalReview: ({ claim, pending }: { claim: { id: string }; pending: boolean }) => (
    <div data-testid="opd-review" data-pending={String(pending)}>
      {claim.id}
    </div>
  ),
}));

const { default: NeedsYouTab } = await import("./NeedsYouTab");

// Claimants and the entity each belongs to. `company` is the HRIS field, and
// its values are subsidiary CODES, not legal names.
const directory = [
  { workEmail: "kasun@wso2.com", firstName: "Kasun", lastName: "P", employeeThumbnail: null, company: "WSO2 - SRI LANKA" },
  { workEmail: "dilani@wso2.com", firstName: "Dilani", lastName: "S", employeeThumbnail: null, company: "WSO2 - US" },
];

const expenseClaim = (over: Record<string, unknown>) => ({
  id: "EXP-1",
  transactions: [],
  totalAmount: 100,
  currencyCode: "USD",
  employeeEmail: "kasun@wso2.com",
  leadEmails: [],
  createdDate: iso(2026, 7, 20),
  statusDetails: { status: "PENDING_LEAD", leadApprovedDate: null },
  ...over,
});

const opdClaim = (over: Record<string, unknown>) => ({
  id: "OPD-1",
  transactions: [{}, {}, {}],
  employeeEmail: "dilani@wso2.com",
  totalAmount: 8750,
  createdDate: iso(2026, 7, 15),
  statusDetails: { status: "PENDING" },
  ...over,
});

beforeEach(() => {
  flags.lead = true;
  flags.finance = true;
  flags.opd = true;
  searches.expense.length = 0;
  searches.opd.length = 0;
  data.lead = [];
  data.finance = [];
  data.opd = [];
  data.expenseFails = false;
  data.opdFails = false;
  data.appDataFails = false;
  data.opdUserInfoFails = false;
  data.queuesLoading = false;
});

const show = (body: ReactNode = <NeedsYouTab />) =>
  render(<QueryClientProvider client={new QueryClient()}>{body}</QueryClientProvider>);

// The claim id and email filters now live inside the Advanced Filter popover,
// behind an Apply — so a test that sets one has to open the panel and apply it,
// exactly as a reader does.
const applyClaimId = async (value: string) => {
  await userEvent.click(await screen.findByRole("button", { name: /Advanced Filter/ }));
  fireEvent.change(await screen.findByLabelText("Filter by Claim ID"), { target: { value } });
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
};

// Claim type is a select in that same panel rather than a row of buttons.
const applyEntity = async (label: string) => {
  await userEvent.click(await screen.findByRole("button", { name: /Advanced Filter/ }));
  await pickInField("Filter by Entity", label);
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
};

// Each narrowing field is an Autocomplete now, typed into or picked from.
// There is no "All ..." option: clearing the field is what "all" means, so a
// label starting with "All" clears instead of selecting.
const pickInField = async (fieldLabel: string, optionLabel: string) => {
  const input = await screen.findByLabelText(fieldLabel);
  const field = input.closest(".MuiAutocomplete-root") as HTMLElement;
  if (optionLabel.startsWith("All ")) {
    await userEvent.click(within(field).getByTitle("Clear"));
    return;
  }
  await userEvent.click(input);
  await userEvent.click(await screen.findByRole("option", { name: optionLabel }));
};

const applyClaimType = async (label: string) => {
  await userEvent.click(await screen.findByRole("button", { name: /Advanced Filter/ }));
  await pickInField("Filter by Claim Type", label);
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
};

describe("what it asks each backend for", () => {
  it("asks a lead only for their own reports' claims at the lead stage", () => {
    flags.finance = false;
    flags.opd = false;
    show();
    const lead = searches.expense.find((p) => (p.status as string[])?.[0] === "PENDING_LEAD");
    expect(lead).toMatchObject({ leadEmail: "me@wso2.com", status: ["PENDING_LEAD"] });
  });

  // The finance queue is company-wide, so scoping it to one lead's reports
  // would hide most of it.
  it("asks finance for the finance stage, unscoped", () => {
    flags.lead = false;
    flags.opd = false;
    show();
    const fin = searches.expense.find((p) => (p.status as string[])?.[0] === "PENDING_FINANCE");
    expect(fin).toMatchObject({ status: ["PENDING_FINANCE"] });
    expect(fin?.leadEmail).toBeUndefined();
  });

  it("asks both stages of someone holding both flags", () => {
    show();
    const asked = searches.expense.map((p) => (p.status as string[])?.[0]);
    expect(asked).toContain("PENDING_LEAD");
    expect(asked).toContain("PENDING_FINANCE");
  });

  // Claims filed before the status was split carry PENDING_OLD; asking for
  // PENDING alone hides them from the queue entirely.
  it("includes the legacy pending status for OPD", () => {
    show();
    expect(searches.opd.at(-1)?.status).toEqual(["PENDING", "PENDING_OLD"]);
  });

  it("asks nothing of a backend this person has no role on", () => {
    flags.lead = false;
    flags.finance = false;
    show();
    expect(searches.expense).toHaveLength(0);
    expect(searches.opd.length).toBeGreaterThan(0);
  });
});

// A query this person has no role for is never enabled, and React Query leaves
// a disabled query `pending` for good. Waiting on that flag means the screen
// spins forever for anyone holding less than every role — which is most people.
describe("when a role is missing", () => {
  it("renders for someone who only approves OPD", async () => {
    flags.lead = false;
    flags.finance = false;
    data.opd = [opdClaim({})];
    show();
    expect(await screen.findByText("OPD-1")).toBeInTheDocument();
  });

  it("renders for someone who only leads expense claims", async () => {
    flags.finance = false;
    flags.opd = false;
    data.lead = [expenseClaim({})];
    show();
    expect(await screen.findByText("EXP-1")).toBeInTheDocument();
  });

  it("renders for someone who only signs off expense claims", async () => {
    flags.lead = false;
    flags.opd = false;
    data.finance = [expenseClaim({})];
    show();
    expect(await screen.findByText("EXP-1")).toBeInTheDocument();
  });

  it("reaches the empty state rather than spinning on a disabled queue", async () => {
    flags.lead = false;
    flags.finance = false;
    show();
    expect(await screen.findByText("Nothing is waiting on you.")).toBeInTheDocument();
  });
});

// While the queues are loading, the list area said nothing at all — no
// skeleton, no spinner — which read exactly like "nothing is waiting on you"
// on a page that had not actually answered that question yet.
describe("while the queues are still loading", () => {
  it("shows a skeleton rather than looking like an empty answer", () => {
    data.queuesLoading = true;
    const { container } = show();

    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    expect(screen.queryByText(/nothing is waiting on you/i)).not.toBeInTheDocument();
  });

  it("replaces the skeleton with the real answer once the queues settle", async () => {
    data.queuesLoading = true;
    const { container, rerender } = show();
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();

    data.queuesLoading = false;
    // Opens on "As lead" by default when both flags are held (the default
    // fixture) — populating the finance queue instead would stay invisible
    // behind that toggle, which is not what this test is about.
    data.lead = [expenseClaim({})];
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NeedsYouTab />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("EXP-1")).toBeInTheDocument();
    expect(container.querySelector(".MuiSkeleton-root")).not.toBeInTheDocument();
  });
});

// FilterHolder.tsx-style narrowing: a claim of one employee or one id, applied
// to every queue this tab runs — otherwise the only way to find a claim is to
// scroll the whole company's, across two apps at once.
describe("narrowing by employee or claim id", () => {
  it("sends no email or id by default", async () => {
    show();
    await waitFor(() => expect(searches.expense.length + searches.opd.length).toBeGreaterThan(0));
    for (const p of [...searches.expense, ...searches.opd]) {
      expect(p.email).toBeUndefined();
      expect(p.ids).toBeUndefined();
    }
  });

  it("narrows every queue to one claim id", async () => {
    show();
    await applyClaimId("C-42");
    await waitFor(() => expect(searches.expense.at(-1)?.ids).toEqual(["C-42"]));
    expect(searches.opd.at(-1)?.ids).toEqual(["C-42"]);
  });
});

// Finance's complaint was the length of the combined list: OPD and expense
// claims on one scroll, with no way to look at one type or to find a known
// claim without reading every row.
describe("narrowing the queue", () => {
  const bothTypes = () => {
    flags.lead = false;
    data.opd = [opdClaim({})];
    data.finance = [
      expenseClaim({ statusDetails: { status: "PENDING_FINANCE", leadApprovedDate: iso(2026, 7, 25) } }),
    ];
  };

  it("shows one claim type at a time, and both again under All", async () => {
    bothTypes();
    show();
    expect(await screen.findByText("OPD-1")).toBeInTheDocument();

    await applyClaimType("Expense Claims");
    expect(screen.queryByText("OPD-1")).not.toBeInTheDocument();
    expect(screen.getByText("EXP-1")).toBeInTheDocument();

    await applyClaimType("OPD Claims");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
    expect(screen.queryByText("EXP-1")).not.toBeInTheDocument();

    await applyClaimType("All Claim Types");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
    expect(screen.getByText("EXP-1")).toBeInTheDocument();
  });

  it("searches across both claim types at once", async () => {
    bothTypes();
    show();
    expect(await screen.findByText("OPD-1")).toBeInTheDocument();

    // A claim id belonging to one type hides the other.
    await userEvent.type(screen.getByLabelText("Search"), "OPD-1");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
    expect(screen.queryByText("EXP-1")).not.toBeInTheDocument();
  });

  it("searches by claimant email and by amount, not just id", async () => {
    bothTypes();
    show();
    const box = await screen.findByLabelText("Search");

    await userEvent.type(box, "dilani");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
    expect(screen.queryByText("EXP-1")).not.toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, "8750");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
    expect(screen.queryByText("EXP-1")).not.toBeInTheDocument();
  });

  // End to end: typing an entity name into the SEARCH box, not the dropdown.
  it("searches by legal entity from the search box", async () => {
    bothTypes();
    show();
    expect(await screen.findByText("OPD-1")).toBeInTheDocument();

    // Kasun is WSO2 - SRI LANKA, Dilani is WSO2 - US.
    await userEvent.type(await screen.findByLabelText("Search"), "Lanka");
    expect(screen.getByText("EXP-1")).toBeInTheDocument();
    expect(screen.queryByText("OPD-1")).not.toBeInTheDocument();
  });

  it("says the filters matched nothing rather than that the queue is empty", async () => {
    bothTypes();
    show();
    await userEvent.type(await screen.findByLabelText("Search"), "nothing-matches-this");
    expect(await screen.findByText("No claims match these filters.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing is waiting on you.")).not.toBeInTheDocument();
  });

  // Finance could only approximate this by searching a currency, which cannot
  // tell two entities sharing one apart (Germany and Spain are both EUR).
  it("filters the queue down to one legal entity", async () => {
    bothTypes();
    show();
    expect(await screen.findByText("OPD-1")).toBeInTheDocument();

    // Dilani is WSO2 - US, Kasun is WSO2 - SRI LANKA.
    await applyEntity("WSO2 LLC");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
    expect(screen.queryByText("EXP-1")).not.toBeInTheDocument();

    await applyEntity("WSO2 Lanka (Pvt) Ltd");
    expect(screen.getByText("EXP-1")).toBeInTheDocument();
    expect(screen.queryByText("OPD-1")).not.toBeInTheDocument();

    await applyEntity("All Entities");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
    expect(screen.getByText("EXP-1")).toBeInTheDocument();
  });

  // Finance asked for these to be typeable, not just pickable — the entity list
  // runs to a dozen options and the claim id / email fields beside them already
  // take typing, so a pair of click-only dropdowns read as a different control.
  it("narrows the entity list as you type, and selects what you typed", async () => {
    bothTypes();
    show();
    expect(await screen.findByText("OPD-1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Advanced Filter/ }));
    await userEvent.type(await screen.findByLabelText("Filter by Entity"), "Lanka");

    // Only the matching entity survives the typing.
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("WSO2 Lanka (Pvt) Ltd");

    await userEvent.click(options[0]);
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("EXP-1")).toBeInTheDocument();
    expect(screen.queryByText("OPD-1")).not.toBeInTheDocument();
  });

  it("lets the claim type be typed too", async () => {
    bothTypes();
    show();
    expect(await screen.findByText("OPD-1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Advanced Filter/ }));
    await userEvent.type(await screen.findByLabelText("Filter by Claim Type"), "Expense");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    await userEvent.click(options[0]);
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("EXP-1")).toBeInTheDocument();
    expect(screen.queryByText("OPD-1")).not.toBeInTheDocument();
  });

  // The toggle would offer a choice that can never show anything: OPD never
  // appears on the lead stage, and a reader stuck on it could not clear it.
  it("hides the claim-type filter on the lead stage", async () => {
    flags.lead = true;
    flags.finance = true;
    data.lead = [expenseClaim({ id: "EXP-LEAD" })];
    data.opd = [opdClaim({})];
    show();
    expect(await screen.findByText("EXP-LEAD")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Advanced Filter/ }));
    expect(screen.queryByLabelText("Filter by Claim Type")).not.toBeInTheDocument();
    // The filters that DO apply are still offered.
    expect(screen.getByLabelText("Filter by Claim ID")).toBeInTheDocument();
  });

  it("hides the claim-type filter from someone with no OPD role", async () => {
    flags.lead = false;
    flags.opd = false;
    data.finance = [
      expenseClaim({ statusDetails: { status: "PENDING_FINANCE", leadApprovedDate: iso(2026, 7, 25) } }),
    ];
    show();
    expect(await screen.findByText("EXP-1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Advanced Filter/ }));
    expect(screen.queryByLabelText("Filter by Claim Type")).not.toBeInTheDocument();
  });
});

describe("what it shows", () => {
  it("groups by claim type and counts each group", async () => {
    flags.lead = false;
    data.opd = [opdClaim({})];
    data.finance = [expenseClaim({ statusDetails: { status: "PENDING_FINANCE", leadApprovedDate: iso(2026, 7, 25) } })];
    show();
    expect(await screen.findByText(/OPD claims · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Expense claims · 1/)).toBeInTheDocument();
  });

  // Someone holding both flags decides one stage at a time via the toggle —
  // the same "As lead / As finance" switch the Expense claims tab offers —
  // rather than seeing both stages merged into one list.
  it("shows one stage at a time via the toggle, not both merged", async () => {
    data.lead = [expenseClaim({ id: "EXP-LEAD" })];
    data.finance = [
      expenseClaim({
        id: "EXP-FIN",
        statusDetails: { status: "PENDING_FINANCE", leadApprovedDate: iso(2026, 7, 25) },
      }),
    ];
    const user = userEvent.setup();
    show();

    // Opens on lead, since lead wins the default when both are held.
    expect(await screen.findByText("EXP-LEAD")).toBeInTheDocument();
    expect(screen.queryByText("EXP-FIN")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "As finance" }));
    expect(await screen.findByText("EXP-FIN")).toBeInTheDocument();
    expect(screen.queryByText("EXP-LEAD")).not.toBeInTheDocument();
  });

  // OPD is a finance-only decision: its roles are CLAIM_SUBMITTER and
  // FINANCE_APPROVER, with no lead stage to sit in. So the group belongs on
  // "As finance" and must not follow the reader onto "As lead".
  it("keeps OPD claims off the lead stage and shows them on finance", async () => {
    data.opd = [opdClaim({})];
    data.lead = [expenseClaim({ id: "EXP-LEAD" })];
    const user = userEvent.setup();
    show();

    // Opens on lead, where only the expense claim belongs.
    expect(await screen.findByText("EXP-LEAD")).toBeInTheDocument();
    expect(screen.queryByText(/OPD claims/)).not.toBeInTheDocument();
    expect(screen.queryByText("OPD-1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "As finance" }));
    expect(await screen.findByText(/OPD claims · 1/)).toBeInTheDocument();
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
  });

  // Finance can be sitting on fifty-odd OPD claims, and the Expense claims
  // group below them was reachable only by scrolling past every one.
  it("folds a group away when its heading is clicked, keeping the count", async () => {
    flags.lead = false;
    data.opd = [opdClaim({})];
    data.finance = [
      expenseClaim({
        id: "EXP-FIN",
        statusDetails: { status: "PENDING_FINANCE", leadApprovedDate: iso(2026, 7, 25) },
      }),
    ];
    const user = userEvent.setup();
    show();

    const opdHeading = await screen.findByRole("button", { name: /OPD claims · 1/ });
    expect(opdHeading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("OPD-1")).toBeInTheDocument();

    await user.click(opdHeading);
    expect(opdHeading).toHaveAttribute("aria-expanded", "false");
    // The rows go; the heading and its count stay, so the group is still
    // accounted for — and the other group has not moved or been touched.
    expect(screen.queryByText("OPD-1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OPD claims · 1/ })).toBeInTheDocument();
    expect(screen.getByText("EXP-FIN")).toBeInTheDocument();

    await user.click(opdHeading);
    expect(screen.getByText("OPD-1")).toBeInTheDocument();
  });

  it("offers the toggle only to someone holding both flags", async () => {
    flags.finance = false;
    data.lead = [expenseClaim({})];
    show();
    await screen.findByText("EXP-1");
    expect(screen.queryByRole("button", { name: "As lead" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "As finance" })).not.toBeInTheDocument();
  });

  it("names the currently selected stage in the group heading", async () => {
    data.lead = [expenseClaim({})];
    data.finance = [
      expenseClaim({
        id: "EXP-FIN",
        statusDetails: { status: "PENDING_FINANCE", leadApprovedDate: iso(2026, 7, 25) },
      }),
    ];
    const user = userEvent.setup();
    show();
    expect(await screen.findByText(/you decide as lead$/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "As finance" }));
    expect(await screen.findByText(/you decide as finance$/)).toBeInTheDocument();
  });

  it("names only the stage a person actually holds", async () => {
    flags.finance = false;
    data.lead = [expenseClaim({})];
    show();
    expect(await screen.findByText(/you decide as lead$/)).toBeInTheDocument();
  });

  it("puts the longest wait first", async () => {
    // Finance-only: OPD is decided at the finance stage, so a reader sitting
    // on the lead stage has no OPD list to order in the first place.
    flags.lead = false;
    data.opd = [
      opdClaim({ id: "OPD-NEW", createdDate: iso(2026, 7, 28) }),
      opdClaim({ id: "OPD-OLD", createdDate: iso(2026, 7, 1) }),
    ];
    show();
    await screen.findByText("OPD-OLD");
    const ids = screen.getAllByText(/^OPD-/).map((n) => n.textContent);
    expect(ids).toEqual(["OPD-OLD", "OPD-NEW"]);
  });

  it("says so when nothing is waiting", async () => {
    show();
    expect(await screen.findByText("Nothing is waiting on you.")).toBeInTheDocument();
  });
});

// A finance approver whose OPD backend is down still has expense claims to get
// through. Blanking the screen would hide work that is perfectly reachable.
describe("when one backend is down", () => {
  it("keeps showing the queue that did load", async () => {
    flags.lead = false;
    data.opdFails = true;
    data.finance = [expenseClaim({ id: "EXP-OK" })];
    show();
    expect(await screen.findByText("EXP-OK")).toBeInTheDocument();
    expect(screen.getByText(/couldn't be loaded/)).toBeInTheDocument();
  });

  it("says something failed rather than showing an empty queue as if it were empty", async () => {
    data.expenseFails = true;
    data.opdFails = true;
    show();
    expect(await screen.findByText(/couldn't be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing is waiting on you.")).not.toBeInTheDocument();
  });
});

describe("opening a claim", () => {
  // OPD also replaces the whole tab with its own review screen now, the
  // same way expense does — one flow, not a dialog copy.
  it("replaces the queue with the review screen for an OPD claim", async () => {
    // Finance-only: OPD never appears while the reader is on the lead stage.
    flags.lead = false;
    data.opd = [opdClaim({})];
    show();
    const row = (await screen.findByText("OPD-1")).closest("tr")!;
    within(row).getByRole("button", { name: "Review" }).click();
    const review = await screen.findByTestId("opd-review");
    expect(review).toHaveTextContent("OPD-1");
    expect(review).toHaveAttribute("data-pending", "true");
    expect(screen.queryByTestId("expense-review")).not.toBeInTheDocument();
    // Gone, not merely covered: the review screen took the tab's place.
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });

  // Expense claims replace the whole tab with the app's own Lead/Finance
  // Approvals review screen rather than opening in a dialog — the same
  // screen, the same decision, not a shrunk-down copy.
  it("replaces the queue with the review screen for an expense claim", async () => {
    data.lead = [expenseClaim({ id: "EXP-LEAD" })];
    show();
    const row = (await screen.findByText("EXP-LEAD")).closest("tr")!;
    within(row).getByRole("button", { name: "Review" }).click();
    const review = await screen.findByTestId("expense-review");
    expect(review).toHaveTextContent("EXP-LEAD");
    // Gone, not merely covered: the review screen took the tab's place.
    expect(screen.queryByText("Nothing is waiting on you.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });

  // The toggle's own stage is the same one the review screen has to answer
  // with — otherwise Approve decides the wrong stage.
  it("opens a finance-stage claim on FINANCE, not LEAD", async () => {
    // Finance only, so the tab opens straight on the finance queue with no
    // toggle to click through first.
    flags.lead = false;
    data.finance = [
      expenseClaim({
        id: "EXP-FIN",
        statusDetails: { status: "PENDING_FINANCE", leadApprovedDate: iso(2026, 7, 25) },
      }),
    ];
    show();
    const row = (await screen.findByText("EXP-FIN")).closest("tr")!;
    within(row).getByRole("button", { name: "Review" }).click();
    const review = await screen.findByTestId("expense-review");
    expect(review).toHaveAttribute("data-stage", "FINANCE");
  });
});


// The nastiest failure on this screen: the call that decides WHICH queues to
// run. When it fails every capability flag reads false, so both queues are
// disabled rather than failing — and a disabled queue reports no error. The
// screen would say "nothing is waiting on you" to an approver whose claims had
// simply not loaded.
describe("when the call that decides the queues fails", () => {
  it("says something failed rather than reporting an empty queue", async () => {
    data.appDataFails = true;
    show();
    expect(await screen.findByText(/couldn't be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing is waiting on you.")).not.toBeInTheDocument();
  });

  // Same shape on the other backend: the role check gates the OPD queue.
  it("does the same when the OPD role check fails", async () => {
    data.opdUserInfoFails = true;
    show();
    expect(await screen.findByText(/couldn't be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing is waiting on you.")).not.toBeInTheDocument();
  });
});
