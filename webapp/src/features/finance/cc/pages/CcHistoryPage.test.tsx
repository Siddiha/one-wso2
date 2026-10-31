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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@hooks/useAccessToken", () => ({ useAccessToken: () => async () => "token" }));
vi.mock("@asgardeo/react", () => ({ useAsgardeo: () => ({ isSignedIn: true }) }));

// Each filter here opens a popover, picks an option and closes it again, and
// several tests do that twice. Under the whole suite in parallel that lands at
// 4-6s — slow, not hung, so the default 5s cuts them off for reasons that have
// nothing to do with what they assert.
vi.setConfig({ testTimeout: 15000 });

const base = {
  txnDate: "2026-08-20",
  txnAmount: 500,
  expenseTypeId: 1,
  expenseCategoryLabel: "Travel",
  expenseTypeLabel: "Hotels",
  txnComment: "Client trip",
  receiptFileName: "r.pdf",
  contractFileName: null,
  subRegion: null,
  travelJobNumber: "JOB-1",
  productUnit: "Integration",
  businessUnit: "Platform",
  status: "submitted",
  financeApproverEmail: "fin@wso2.com",
  empPostedDate: "2026-08-21T00:00:00Z",
  leadApprovedDate: "2026-08-22T00:00:00Z",
  financeApprovedDate: "2026-08-23T00:00:00Z",
  reportSequenceNumber: "R-7",
};

const rows = [
  { ...base, id: 1, ccNumber: "1111", txnDescription: "Mine", employeeEmail: "me@wso2.com", leadEmail: "lead-a@wso2.com" },
  { ...base, id: 2, ccNumber: "2222", txnDescription: "Theirs", employeeEmail: "them@wso2.com", leadEmail: "lead-b@wso2.com, lead-a@wso2.com" },
  // Submitted, not yet approved by anyone, and on a card with no lead set.
  {
    ...base,
    id: 3,
    ccNumber: "1111",
    txnDescription: "Waiting",
    employeeEmail: "me@wso2.com",
    leadEmail: null,
    leadApprovedDate: null,
    financeApproverEmail: null,
    financeApprovedDate: null,
  },
];

const state = { access: ["lead"] as string[], rows: null as typeof rows | null };

// Every `useCcTransactions` call, so a test can assert on the window actually
// requested rather than on what the controls happen to show.
const txnCalls: { dateFrom?: string }[] = [];

vi.mock("../useCc", () => ({
  useCcUserInfo: () => ({
    data: { workEmail: "me@wso2.com", accessLevels: state.access },
    isLoading: false,
    isError: false,
  }),
  useCcTransactions: (o: { dateFrom?: string }) => {
    txnCalls.push(o);
    return { data: state.rows ?? rows, isLoading: false, isError: false };
  },
  // Cards including closed ones — the CC Number cell marks a transaction whose
  // card has since been closed, as submission-history/index.tsx:262-269 does.
  useCreditCards: () => ({
    // "ACTIVE" upper-case on purpose: useCc.ts:76 decides active
    // case-insensitively, so the cell must too.
    data: [
      { id: 1, ccNumber: "1111", label: "Mine", employeeEmail: "me@wso2.com", status: "ACTIVE" },
      { id: 2, ccNumber: "2222", label: "Old", employeeEmail: "them@wso2.com", status: "Inactive" },
    ],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../ccTypes", async () => {
  const actual = await vi.importActual<typeof import("../ccTypes")>("../ccTypes");
  return { ...actual, ccHasAccess: (_u: unknown, lvl: string) => state.access.includes(lvl) };
});

vi.mock("../../components/FinanceShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { default: CcHistoryPage } = await import("./CcHistoryPage");
const { NotificationsProvider } = await import("@context/notifications/NotificationsContext");

beforeEach(() => {
  state.access = ["lead"];
  state.rows = null;
  txnCalls.length = 0;
});

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <CcHistoryPage />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

/** HistoryFilterPopover.tsx — the five filters live behind one trigger. */
const openFilters = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Advanced Filter" }));

const pick = async (label: string, option: string) => {
  await openFilters();
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
  // The popover has no Apply — the field has already committed — but it stays
  // open, and while it is open the grid behind it is aria-hidden.
  fireEvent.click(await screen.findByRole("button", { name: "Close filters" }));
};

// submission-history/index.tsx:74-76,142-156 — a lead or finance narrows by
// person, card and lead as well as status. The port had status alone, so
// finding one person's spend meant reading the whole table.
describe("narrowing the history", () => {
  it("offers the extra filters to someone who can see others", async () => {
    show();
    await openFilters();
    for (const l of ["Filter by User", "Filter by Card"]) {
      expect(await screen.findByRole("combobox", { name: l })).toBeInTheDocument();
    }
  });

  // HistoryFilterPopover.tsx:172 — the lead filter is finance's alone, and even
  // then only once the rows could have a lead worth filtering by. The port
  // offered it to any lead, who can only ever be looking at their own name.
  it("keeps the lead filter to finance", async () => {
    show();
    await openFilters();
    expect(screen.queryByRole("combobox", { name: "Filter by Lead" })).not.toBeInTheDocument();
  });

  it("offers it to finance", async () => {
    state.access = ["finance"];
    show();
    await openFilters();
    expect(await screen.findByRole("combobox", { name: "Filter by Lead" })).toBeInTheDocument();
  });

  it("offers none of them to a plain employee, whose list is already their own", async () => {
    state.access = [];
    show();
    await waitFor(() => expect(screen.getByText("Mine")).toBeInTheDocument());
    await openFilters();
    expect(screen.queryByRole("combobox", { name: "Filter by User" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Close filters" }));
    expect(screen.queryByText("Theirs")).not.toBeInTheDocument();
  });

  it("filters to one person", async () => {
    show();
    await pick("Filter by User", "them@wso2.com");
    await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
    expect(screen.getByText("Theirs")).toBeInTheDocument();
  });

  it("filters to one card", async () => {
    show();
    await pick("Filter by Card", "1111");
    await waitFor(() => expect(screen.queryByText("Theirs")).not.toBeInTheDocument());
  });

  it("matches a lead within a card's comma-separated list", async () => {
    // Finance, because that is who the lead filter is for.
    state.access = ["finance"];
    show();
    // lead-a is the second of two leads on "Theirs" and the only one on "Mine".
    await pick("Filter by Lead", "lead-a@wso2.com");
    await waitFor(() => expect(screen.getByText("Mine")).toBeInTheDocument());
    expect(screen.getByText("Theirs")).toBeInTheDocument();

    await pick("Filter by Lead", "lead-b@wso2.com");
    await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
  });

  // The Lead select exists only on the statuses that could have one, and
  // `ccHistoryActiveFilters` gates its chip on the same rule. Left applied
  // once it is hidden it narrows the list with nothing on screen saying so
  // and no chip to clear — the period filter already avoids this the same way.
  describe("the Lead filter, on a status that hides it", () => {
    // "All statuses" rather than one of the pending ones: it hides Lead just
    // the same, but leaves every row in the list, so what this asserts is the
    // lead filter letting go — not the status filter emptying the grid.
    it("stops narrowing the list", async () => {
      state.access = ["finance"];
      show();
      await pick("Filter by Lead", "lead-b@wso2.com");
      await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());

      // "Mine" belongs to lead-a, so it must come back rather than stay
      // filtered out by a control that is no longer on screen.
      await pick("Filter by Status", "All statuses");
      await waitFor(() => expect(screen.getByText("Mine")).toBeInTheDocument());
    });

    it("is not shown as narrowing anything either", async () => {
      state.access = ["finance"];
      show();
      await pick("Filter by Lead", "lead-b@wso2.com");
      expect(await screen.findByText("Lead: lead-b@wso2.com")).toBeInTheDocument();

      await pick("Filter by Status", "Pending Lead");
      await waitFor(() =>
        expect(screen.queryByText("Lead: lead-b@wso2.com")).not.toBeInTheDocument(),
      );
    });

    it("comes back when the status shows it again", async () => {
      state.access = ["finance"];
      show();
      await pick("Filter by Lead", "lead-b@wso2.com");
      await pick("Filter by Status", "All statuses");
      await waitFor(() => expect(screen.getByText("Mine")).toBeInTheDocument());

      // Gated on the way out, not cleared: the choice survives the round trip,
      // exactly as the period does.
      await pick("Filter by Status", "Completed");
      await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
      // getAllByText: the chip is on the page and in the popover, which is
      // still mounted through its closing transition.
      expect(screen.getAllByText("Lead: lead-b@wso2.com").length).toBeGreaterThan(0);
    });
  });
});

// TransactionDetailsDialog.tsx. The port typed leadApprovedDate,
// financeApprovedDate, financeApproverEmail and reportSequenceNumber and
// rendered none of them, so there was no way to see who approved what, or when.
describe("what became of a transaction", () => {
  it("shows the approval trail", async () => {
    show();
    fireEvent.click((await screen.findAllByRole("button", { name: "view details" }))[0]);

    expect(await screen.findByText("Lead Approved Date")).toBeInTheDocument();
    expect(screen.getByText("Finance Approved Date")).toBeInTheDocument();
    expect(screen.getByText("fin@wso2.com")).toBeInTheDocument();
  });

  it("shows the categorisation the table has no room for", async () => {
    show();
    fireEvent.click((await screen.findAllByRole("button", { name: "view details" }))[0]);
    for (const label of ["Expense Category", "Job Number", "Product Unit", "Business Unit"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Integration")).toBeInTheDocument();
  });
});

// :232 — `leadEmail?.split(",")[0]`. The field is the card's comma-separated
// assigned-lead list, so showing it whole would name several people as having
// approved one transaction. :230-335 also distinguishes "never happened" from
// "not recorded", which a bare dash does not.
describe("the approval trail names one lead", () => {
  it("shows only the first assigned lead", async () => {
    show();
    // Row 2's card carries two leads.
    fireEvent.click((await screen.findAllByRole("button", { name: "view details" }))[1]);

    const label = await screen.findByText("Lead approver");
    const value = label.parentElement as HTMLElement;
    expect(value).toHaveTextContent("lead-b@wso2.com");
    expect(value).not.toHaveTextContent("lead-a@wso2.com");
  });

  it("says why a value is missing rather than showing a dash", async () => {
    show();
    // Row 3 has been submitted and approved by nobody.
    fireEvent.click((await screen.findAllByRole("button", { name: "view details" }))[2]);

    const dateLabel = await screen.findByText("Lead Approved Date");
    expect(dateLabel.parentElement).toHaveTextContent("(not approved)");
    expect(screen.getByText("Lead approver").parentElement).toHaveTextContent(
      "(not provided)",
    );
  });
});

// The grid is the source's own (submission-history/index.tsx:221-415), and its
// wording is what drifted: every header had been renamed or dropped and no test
// held any of them. These do.
describe("the history grid says what the source says", () => {
  beforeEach(() => {
    state.access = ["finance"];
  });

  it("shows the columns the source shows by default", async () => {
    show();
    for (const header of [
      "ID",
      "NetSuite Report No.",
      "Description",
      "Date",
      "Amount($)",
      "CC Number",
      "Submitted User",
      "Submitted Date",
      "Attachments",
      "Status",
      "View Details",
    ]) {
      expect(await screen.findByRole("columnheader", { name: header })).toBeInTheDocument();
    }
  });

  it("holds the other ten back until asked for", async () => {
    show();
    await screen.findByRole("columnheader", { name: "ID" });
    // :559-571 — defined, but off at the start.
    for (const header of [
      "Lead Approver",
      "Finance Approver",
      "Expense Category",
      "Expense Type",
      "Product Unit",
      "Business Unit",
      "Job Number",
      "Sub Region",
      "Lead Approved Date",
      "Finance Approved Date",
    ]) {
      expect(screen.queryByRole("columnheader", { name: header })).toBeNull();
    }
  });

  it("leaves the currency to the header, as the source does", async () => {
    show();
    await screen.findByRole("columnheader", { name: "Amount($)" });
    // utils.ts:44-49 — formatCurrency renders a bare number; the ($) in the
    // header is what names the currency. Rendering "USD 500.00" under it shows
    // the symbol twice.
    expect(screen.getAllByText("500.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("USD 500.00")).toBeNull();
  });

  it("marks a transaction whose card has been closed", async () => {
    show();
    // :262-269 — row 2 sits on card 2222, which is Inactive.
    expect(await screen.findByText("2222 (Inactive)")).toBeInTheDocument();
    expect(screen.queryByText("1111 (Inactive)")).toBeNull();
  });

  it("says N/A for a date that has not happened", async () => {
    // Submitted Date is the only nullable date shown by default, so the row
    // has to be one that never got submitted for the placeholder to surface.
    // Cast: the fixture array's inferred element union pins empPostedDate to a
    // string, and this row is precisely the case where it is not one.
    state.rows = [
      { ...rows[2], id: 9, empPostedDate: null },
    ] as unknown as typeof rows;
    show();
    await screen.findByRole("columnheader", { name: "Submitted Date" });
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("offers the toolbar the source offers, export included", async () => {
    show();
    await screen.findByRole("columnheader", { name: "ID" });
    // :43-61 — the source names its toolbar buttons; v8's one-prop toolbar
    // leaves them as bare icons, and Export is the least guessable of them.
    // Asserted on the visible label rather than the accessible name, because
    // the label is the thing that was missing — MUI gives the columns button
    // an aria-label of its own ("Select columns") either way.
    for (const label of ["Columns", "Density", "Export"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // A field, not a magnifier you have to click first — the source shows the
    // box, and v8's composed toolbar hides it behind its own trigger.
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    // The source's toolbar has no Filters button.
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
  });
});

describe("Submitted User is gated on seeing other people", () => {
  it("is hidden from a plain employee, whose list is their own", async () => {
    state.access = [];
    show();
    await screen.findByRole("columnheader", { name: "ID" });
    expect(screen.queryByRole("columnheader", { name: "Submitted User" })).toBeNull();
  });
});

// HistoryFilterPopover.tsx:115-124, :233-274 — the trigger counts what is
// narrowing the list, and the chips say what it is. The port had neither.
describe("saying what is narrowing the list", () => {
  it("counts nothing when nothing is narrowed", async () => {
    show();
    const trigger = await screen.findByRole("button", { name: "Advanced Filter" });
    expect(trigger.textContent).toBe("");
  });

  it("puts a chip on the page for each active filter", async () => {
    show();
    await pick("Filter by User", "them@wso2.com");
    // :96-111 — `Type: Label`, not the bare value.
    expect(await screen.findByText("User: them@wso2.com")).toBeInTheDocument();
  });

  it("names the period rather than its day count", async () => {
    show();
    await pick("Filter by period", "Last 30 Days");
    expect(await screen.findByText("Period: Last 30 Days")).toBeInTheDocument();
  });

  it("clears one filter without disturbing the others", async () => {
    show();
    await pick("Filter by User", "them@wso2.com");
    await pick("Filter by Card", "2222 (Inactive)");
    await screen.findByText("Card: 2222");

    // The chip's own delete, not Reset.
    const chip = screen.getByText("User: them@wso2.com").closest(".MuiChip-root")!;
    fireEvent.click(chip.querySelector(".MuiChip-deleteIcon")!);

    await waitFor(() => expect(screen.queryByText("User: them@wso2.com")).toBeNull());
    expect(screen.getByText("Card: 2222")).toBeInTheDocument();
  });

  it("offers nothing to reset until something is narrowed", async () => {
    show();
    await openFilters();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("puts everything back at once", async () => {
    show();
    await pick("Filter by User", "them@wso2.com");
    await openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.queryByText("User: them@wso2.com")).toBeNull());
  });
});

// AttachmentButton.tsx:294-336 — two icons on every row, and the tooltip is
// what says whether there is anything behind them.
describe("the attachment icons", () => {
  it("say what is there and what is not", async () => {
    show();
    await screen.findAllByRole("gridcell");
    // The fixture's first row carries a receipt and no contract.
    expect(screen.getAllByLabelText("receipt-attachment")[0]).toBeEnabled();
    expect(screen.getAllByLabelText("contract-attachment")[0]).toBeDisabled();
  });

  it("are offered on every row, not only where a file exists", async () => {
    show();
    await screen.findAllByRole("gridcell");
    // The port rendered an em-dash when neither file was attached, so a row
    // with a receipt and no contract said nothing at all about the contract.
    const receipts = screen.getAllByLabelText("receipt-attachment");
    const contracts = screen.getAllByLabelText("contract-attachment");
    expect(receipts.length).toBe(contracts.length);
    expect(receipts.length).toBeGreaterThan(1);
  });
});

// index.tsx:432-450 — the source says two different things about an empty grid.
describe("an empty grid", () => {
  it("blames the filters when the filters are what emptied it", async () => {
    show();
    // Nothing in the fixture is still waiting to be submitted.
    await pick("Filter by Status", "Pending Submission");
    expect(await screen.findByText("No transactions match the selected filters")).toBeInTheDocument();
  });

  it("says the period is empty when nothing is narrowed", async () => {
    state.rows = [];
    show();
    // The window is named, because "nothing here" is usually a question about
    // the window rather than about the data.
    expect(await screen.findByText("No submitted transactions for last 7 days")).toBeInTheDocument();
  });
});

// The period control is gated on the status (`ccHistoryFieldsShown`), and so is
// its chip. Leaving `days` in the query once both are hidden puts an invisible
// window on the list: pick a short period on Completed, switch to Pending Lead,
// and older rows disappear with no control and no chip to explain it.
describe("the period filter once the status hides it", () => {
  it("stops narrowing the window", async () => {
    show();
    await pick("Filter by period", "Last 30 Days");
    const narrowed = txnCalls.at(-1)!.dateFrom!;

    await pick("Filter by Status", "Pending Lead");
    const after = txnCalls.at(-1)!.dateFrom!;

    // `dateFrom` is required by the backend, so the window opens up rather than
    // going away: an earlier date is a wider window.
    expect(Date.parse(after)).toBeLessThan(Date.parse(narrowed));
  });
});
