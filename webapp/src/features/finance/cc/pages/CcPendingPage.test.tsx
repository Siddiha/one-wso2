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
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";

vi.mock("@hooks/useAccessToken", () => ({ useAccessToken: () => async () => "token" }));
vi.mock("@asgardeo/react", () => ({ useAsgardeo: () => ({ isSignedIn: true }) }));

// These two screens render a full DataGrid beside a live form and drive both
// through `userEvent`, which types and clicks one event at a time. Several
// tests land at 4-6s when the whole suite runs in parallel — slow, not hung, so
// the default 5s cuts them off for reasons that have nothing to do with what
// they assert.
vi.setConfig({ testTimeout: 15000 });

import type { CcTransaction } from "../ccTypes";

const base: CcTransaction = {
  id: 1,
  ccNumber: "1111",
  txnDate: "2026-08-20",
  txnDescription: "Still with lead",
  txnAmount: 500,
  expenseTypeId: null,
  expenseCategoryLabel: "Software",
  expenseTypeLabel: "Subscriptions",
  txnComment: "Team licence",
  receiptFileName: null,
  contractFileName: null,
  subRegion: null,
  travelJobNumber: null,
  productUnit: "Integration",
  businessUnit: "Platform",
  employeeEmail: "me@wso2.com",
  leadEmail: "lead@wso2.com,deputy@wso2.com",
  financeApproverEmail: null,
  empPostedDate: "2026-08-21",
  leadApprovedDate: null,
  financeApprovedDate: null,
  reportSequenceNumber: null,
  status: "pending_lead",
};

const withLead: CcTransaction = { ...base, id: 1, status: "pending_lead" };
const withFinance: CcTransaction = {
  ...base,
  id: 2,
  txnDescription: "Gone to finance",
  status: "pending_finance",
  leadApprovedDate: "2026-08-22",
};
/** On the other card, so switching cards has something to switch to. */
const onSecondCard: CcTransaction = {
  ...base,
  id: 3,
  ccNumber: "2222",
  txnDescription: "Taxi",
  status: "pending_lead",
};

vi.mock("../useCc", () => ({
  useCcUserInfo: () => ({ data: { workEmail: "me@wso2.com" }, isLoading: false, isError: false }),
  useCreditCards: () => ({
    data: [
      { id: 1, ccNumber: "1111", label: "Mine", status: "Active", employeeEmail: "me@wso2.com", bankCode: "amex", countPendingLead: 1 },
      { id: 2, ccNumber: "2222", label: "Spare", status: "Active", employeeEmail: "me@wso2.com", bankCode: "svb", countPendingLead: 1 },
    ],
    isLoading: false,
    isError: false,
  }),
  useCcTransactions: () => ({
    data: [withLead, withFinance, onSecondCard],
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
  useCcMenus: () => ({
    expenseTypes: {
      data: {
        categories: ["Software", "Travel", "Marketing"],
        types: { Software: ["Subscriptions", "Licences"], Travel: ["Flights"], Marketing: ["Events"] },
      },
      isError: false,
    },
    subRegions: { data: { subRegions: ["EMEA", "APAC"] }, isError: false },
    units: {
      data: { productUnits: ["Integration", "Identity"], businessUnits: ["Platform", "Security"] },
      isError: false,
    },
    jobNumbers: { data: { jobNumbers: ["JOB-1"] }, isError: false },
  }),
  useCcJobNumberDetails: () => ({ data: undefined, isError: false, isFetching: false }),
}));

/** Every POST /transactions/save-edit the screen makes. */
const edited: CcTransaction[][] = [];
vi.mock("../useCcMutations", () => ({
  useCcSaveEdit: () => ({
    mutateAsync: async (rows: CcTransaction[]) => {
      edited.push(rows);
    },
    isPending: false,
  }),
  useCcCardLabel: () => ({ mutate: vi.fn(), isPending: false }),
  useCcAttachment: () => ({
    upload: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("../../components/FinanceShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { default: CcPendingPage } = await import("./CcPendingPage");
const { NotificationsProvider } = await import("@context/notifications/NotificationsContext");

beforeEach(() => {
  edited.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <CcPendingPage />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

const commentBox = () => screen.getAllByRole("textbox", { name: "Comment" })[0];

describe("the queue", () => {
  it("shows both stages, each with its own chip", async () => {
    show();
    await screen.findByText("Still with lead");
    expect(screen.getByText("Pending Lead")).toBeInTheDocument();
    expect(screen.getByText("Pending Finance")).toBeInTheDocument();
  });

  it("is scoped to the selected card", async () => {
    show();
    await screen.findByText("Still with lead");
    // The third row is on the other card.
    expect(screen.queryByText("Taxi")).toBeNull();
  });

  it("offers no export — this is somebody's spend, not a report", async () => {
    show();
    await screen.findByText("Still with lead");
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
});

// EditPane.tsx:322-328 — a submitted row opens read-only whatever the caller
// says, and only the Edit button moves it.
describe("the panel on a submitted row", () => {
  it("opens read-only, showing values rather than controls", async () => {
    show();
    await screen.findByText("1 - Still with lead");
    expect(screen.queryByRole("combobox", { name: /Expense Category/ })).toBeNull();
    // The value is there as text instead.
    expect(screen.getAllByText("Software").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("offers Edit while the row is still with the lead", async () => {
    show();
    await screen.findByText("1 - Still with lead");
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("offers none once finance has it", async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByText("Gone to finance"));
    await screen.findByText("2 - Gone to finance");
    // :232-237 — correctable while it is with the lead, and not after.
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("reveals the controls on Edit and hides them again on Cancel", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("combobox", { name: /Expense Category/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("combobox", { name: /Expense Category/ })).toBeNull();
  });

  it("names who has had it, once asked", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    // Collapsed by default (EditPane.tsx:674) — this screen is for correcting a
    // row, not auditing it.
    expect(screen.queryByText("Submitted User")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Submission details/ }));
    for (const label of [
      "Submitted User",
      "Lead Approver",
      "Finance Approver",
      "Submitted Date",
      "Lead Approved Date",
      "Finance Approved Date",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // One lead, not the whole assigned list — `leadEmail` carries two here.
    expect(screen.getByText("lead@wso2.com")).toBeInTheDocument();
    // Finance has not seen it, so its approver and both its dates say so.
    expect(screen.getAllByText("(not approved yet)")).toHaveLength(3);
  });
});

// The correction goes back to an approver, so it is written when the reader
// says so — never on a timer.
describe("correcting a row", () => {
  const startEditing = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByRole("button", { name: "Edit" }));
  };

  it("posts just that row to save-edit and drops back to read-only", async () => {
    const user = userEvent.setup();
    show();
    await startEditing(user);
    // One keystroke, not a cleared-and-retyped sentence: `userEvent` types a
    // character at a time and the whole file runs well inside the 5s timeout
    // only if the typing is kept short.
    await user.type(commentBox(), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(edited).toHaveLength(1));
    expect(edited[0]).toHaveLength(1);
    expect(edited[0][0].id).toBe(1);
    expect(edited[0][0].txnComment).toBe("Team licence!");
    // :395-397 — a successful save leaves edit mode.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
  });

  it("will not save a row that is no longer complete", async () => {
    const user = userEvent.setup();
    show();
    await startEditing(user);
    // A submitted row must stay submittable — the source validates on save
    // (:338-380); this refuses before the round trip.
    await user.clear(commentBox());
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("autosaves nothing, however long it is left", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    show();
    await startEditing(user);
    await user.type(commentBox(), "!");

    // EditPane.tsx:441-445 arms the timer for drafts only.
    await vi.advanceTimersByTimeAsync(8000);
    expect(edited).toHaveLength(0);
  });

  it("puts the row back on Discard", async () => {
    const user = userEvent.setup();
    show();
    await startEditing(user);
    await user.type(commentBox(), "!");
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(edited).toHaveLength(0);
    // Back to read-only, with the original value.
    expect(screen.queryByRole("combobox", { name: /Expense Category/ })).toBeNull();
    expect(screen.getByText("Team licence")).toBeInTheDocument();
  });
});

// The source drops a half-typed correction the moment another row is clicked,
// and there is no autosave here to catch it.
describe("moving off a correction", () => {
  it("asks before switching rows", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(commentBox(), "!");
    await user.click(screen.getByText("Gone to finance"));

    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByText("1 - Still with lead")).toBeInTheDocument();
  });

  it("does not ask when nothing has been touched", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByText("Gone to finance"));

    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(await screen.findByText("2 - Gone to finance")).toBeInTheDocument();
  });

  it("saves and moves on when asked to", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(commentBox(), "!");
    await user.click(screen.getByText("Gone to finance"));
    await user.click(await screen.findByRole("button", { name: "Save & Continue" }));

    await waitFor(() => expect(edited).toHaveLength(1));
    expect(edited[0][0].txnComment).toBe("Team licence!");
    expect(await screen.findByText("2 - Gone to finance")).toBeInTheDocument();
  });

  it("asks before switching cards too", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(commentBox(), "!");
    await user.click(screen.getByRole("combobox", { name: "Credit card" }));
    await user.click(await screen.findByRole("option", { name: /2222/ }));

    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
  });
});

// Review findings, each with the behaviour that was wrong before it.
describe("an incomplete correction", () => {
  it("cannot be pushed through the unsaved-changes dialog either", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    // Save is disabled for this, but "Save & Continue" reaches `saveNow()`
    // directly — so the rule has to live on the save path, not on the button.
    await user.clear(commentBox());
    await user.click(screen.getByText("Gone to finance"));
    await user.click(await screen.findByRole("button", { name: "Save & Continue" }));

    expect(edited).toHaveLength(0);
    expect(await screen.findByText(/Please fill in all required fields/)).toBeInTheDocument();
    // Still on the row that needs attention.
    expect(screen.getByText("1 - Still with lead")).toBeInTheDocument();
  });

  it("stops reporting a failure once the edit is discarded", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(commentBox());
    await user.click(screen.getByText("Gone to finance"));
    await user.click(await screen.findByRole("button", { name: "Save & Continue" }));
    await screen.findByText(/Please fill in all required fields/);

    await user.click(screen.getByRole("button", { name: "Discard & Continue" }));
    // The alert described an edit that no longer exists.
    expect(screen.queryByText(/Please fill in all required fields/)).toBeNull();
  });
});

describe("reaching a row by keyboard", () => {
  it("loads it into the panel, as clicking it does", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("1 - Still with lead");
    // The grid turns neither Enter nor Space into a row click of its own.
    const cell = screen.getByText("Gone to finance");
    cell.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("2 - Gone to finance")).toBeInTheDocument();
  });
});
