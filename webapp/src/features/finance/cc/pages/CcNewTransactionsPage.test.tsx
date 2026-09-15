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
import { render, screen, waitFor, waitForElementToBeRemoved, within } from "@testing-library/react";
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
  employeeEmail: "me@wso2.com",
  leadEmail: "lead@wso2.com,deputy@wso2.com",
  financeApproverEmail: null,
  empPostedDate: null,
  leadApprovedDate: null,
  financeApprovedDate: null,
  reportSequenceNumber: null,
  status: "new",
};

// Deliberately listed incomplete-first, so the sort has something to do.
const incomplete: CcTransaction = { ...base, id: 1, txnDescription: "Hotel" };
const complete: CcTransaction = {
  ...base,
  id: 2,
  txnDescription: "Flight",
  txnAmount: 900,
  expenseCategoryLabel: "Software",
  expenseTypeLabel: "Subscriptions",
  txnComment: "Team licence",
  productUnit: "Integration",
  businessUnit: "Platform",
};
/** On the other card, so switching cards has something to switch to. */
const onSecondCard: CcTransaction = {
  ...base,
  id: 3,
  ccNumber: "2222",
  txnDescription: "Taxi",
  txnAmount: 40,
};

vi.mock("../useCc", () => ({
  useCcUserInfo: () => ({ data: { workEmail: "me@wso2.com" }, isLoading: false, isError: false }),
  useCreditCards: () => ({
    data: [
      { id: 1, ccNumber: "1111", label: "Mine", status: "Active", employeeEmail: "me@wso2.com", bankCode: "amex", countNew: 2 },
      { id: 2, ccNumber: "2222", label: "Spare", status: "Active", employeeEmail: "me@wso2.com", bankCode: "svb", countNew: 1 },
    ],
    isLoading: false,
    isError: false,
  }),
  useCcTransactions: () => ({
    data: [incomplete, complete, onSecondCard],
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
  // Reassigned per test — a travel job that resolves with no funding sources
  // cannot be charged against, and must never be written.
  useCcJobNumberDetails: () => jobDetails,
}));

let jobDetails: { data: unknown; isError: boolean; isFetching: boolean } = {
  data: undefined,
  isError: false,
  isFetching: false,
};

// Every POST /transactions/save-draft and /transactions/employee-submit.
const drafts: CcTransaction[][] = [];
const submitted: CcTransaction[][] = [];
let saveFails = false;
vi.mock("../useCcMutations", () => ({
  useCcEmployeeSubmit: () => ({
    mutate: (rows: CcTransaction[]) => submitted.push(rows),
    isPending: false,
    isError: false,
    error: null,
  }),
  useCcCardLabel: () => ({ mutate: vi.fn(), isPending: false }),
  useCcSaveDraft: () => ({
    mutateAsync: async (rows: CcTransaction[]) => {
      if (saveFails) throw new Error("backend said no");
      drafts.push(rows);
    },
    isPending: false,
  }),
  useCcAttachment: () => ({
    upload: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("../../components/FinanceShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { default: CcNewTransactionsPage } = await import("./CcNewTransactionsPage");
const { NotificationsProvider } = await import("@context/notifications/NotificationsContext");

beforeEach(() => {
  drafts.length = 0;
  submitted.length = 0;
  saveFails = false;
  jobDetails = { data: undefined, isError: false, isFetching: false };
});
afterEach(() => {
  vi.useRealTimers();
});

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <CcNewTransactionsPage />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

const rowBoxes = async () =>
  (await screen.findAllByRole("checkbox")).filter((b) => b.getAttribute("name") === "select_row");

/** Open a Select by its field caption and choose an option. */
async function pick(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: new RegExp(field) }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const commentBox = () => screen.getAllByRole("textbox", { name: "Comment" })[0];

// NewTransactionsDataGrid.tsx:156-164 — a reader working down the list should
// meet the rows that still need something, not scroll past the finished ones.
describe("the list", () => {
  it("puts complete rows above incomplete ones", async () => {
    show();
    await screen.findByText("Flight");
    const cells = screen.getAllByRole("gridcell").map((c) => c.textContent);
    expect(cells.indexOf("Flight")).toBeLessThan(cells.indexOf("Hotel"));
  });

  it("ticks the rows that are ready to submit", async () => {
    show();
    expect(await screen.findByLabelText("Transaction 2 is ready to submit")).toBeInTheDocument();
    expect(screen.queryByLabelText("Transaction 1 is ready to submit")).toBeNull();
  });

  it("offers search, columns and filters", async () => {
    show();
    await screen.findByText("Hotel");
    for (const name of ["Columns", "Filters", "Search"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("offers no export — nothing here has been submitted yet", async () => {
    show();
    await screen.findByText("Hotel");
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
});

// The screen's whole shape: the list stays visible while a row is categorised.
// The port opened a modal per row, so the reader could not see the list at all.
describe("the categorise panel beside the list", () => {
  it("opens on the first row without being asked", async () => {
    show();
    // Sorted complete-first, so that is the Flight.
    expect(await screen.findByText("2 - Flight")).toBeInTheDocument();
  });

  it("names the lead the row will go to, first of the list", async () => {
    show();
    // EditPane.tsx:916-918 takes leadEmail.split(",")[0].
    expect(await screen.findByText(/Lead Approver: lead@wso2\.com$/)).toBeInTheDocument();
  });

  it("loads the row you click", async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByText("Hotel"));
    expect(await screen.findByText("1 - Hotel")).toBeInTheDocument();
  });

  it("clears the expense type when the category beneath it changes", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    expect(screen.getByRole("combobox", { name: /Expense Type/ })).toHaveTextContent("Subscriptions");

    await pick(user, "Expense Category", "Travel");
    // clearSubFields, utils.ts:73-94 — a Software type must not survive onto a
    // Travel row.
    expect(screen.getByRole("combobox", { name: /Expense Type/ })).not.toHaveTextContent("Subscriptions");
  });

  it("takes the business unit from the product unit, and will not let it be typed", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await pick(user, "Product Unit", "Identity — Security");
    expect(screen.getByRole("textbox", { name: "Business Unit" })).toHaveValue("Security");
    expect(screen.getByRole("textbox", { name: "Business Unit" })).toHaveAttribute("readonly");
  });

  it("asks for a sub region only once the category is Marketing", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    expect(screen.queryByRole("combobox", { name: /Sub Region/ })).toBeNull();
    await pick(user, "Expense Category", "Marketing");
    expect(screen.getByRole("combobox", { name: /Sub Region/ })).toBeInTheDocument();
  });
});

// EditPane.tsx:444-467 saves a part-finished categorisation to /save-draft.
// The port held edits in component state and posted nothing until Submit, so
// leaving the page threw the work away.
describe("keeping a part-finished categorisation", () => {
  it("persists just that row when Save is pressed", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.clear(commentBox());
    await user.type(commentBox(), "Renewal");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts[0]).toHaveLength(1);
    expect(drafts[0][0].id).toBe(2);
    expect(drafts[0][0].txnComment).toBe("Renewal");
  });

  it("will not offer Save until something has changed", async () => {
    show();
    await screen.findByText("2 - Flight");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("autosaves after the source's five seconds, not the util's default second", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");

    await vi.advanceTimersByTimeAsync(2000);
    expect(drafts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3200);
    await waitFor(() => expect(drafts.length).toBeGreaterThan(0));
    expect(screen.getByText("Draft saved")).toBeInTheDocument();
  });
});

// NewTransactionsDataGrid.tsx:484 — `editMode={!isBulkSelected}`. Editing one
// row while others are ticked for a bulk edit would leave two writes racing.
describe("ticking rows for a bulk edit", () => {
  it("puts the panel into read-only and takes Save away", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.click((await rowBoxes())[0]);

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("combobox", { name: /Expense Category/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("applies only the fields that were filled, to every selected row", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    for (const box of await rowBoxes()) await user.click(box);
    await user.click(screen.getByRole("button", { name: /Bulk Edit/ }));

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByRole("textbox", { name: "Comment" }), "Q3 offsite");
    await user.click(dialog.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts[0]).toHaveLength(2);
    expect(drafts[0].map((r) => r.txnComment)).toEqual(["Q3 offsite", "Q3 offsite"]);
    // Untouched fields keep whatever each row already had.
    expect(drafts[0].find((r) => r.id === 2)?.expenseTypeLabel).toBe("Subscriptions");
    expect(drafts[0].find((r) => r.id === 1)?.expenseTypeLabel).toBeNull();
  });

  it("cannot be opened with nothing ticked", async () => {
    show();
    await screen.findByText("Flight");
    expect(screen.getByRole("button", { name: /Bulk Edit/ })).toBeDisabled();
  });
});

// :192-198 — the source refuses a mixed selection outright rather than quietly
// submitting the half that is ready.
describe("submitting", () => {
  it("refuses a selection that contains an incomplete row", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("Flight");
    for (const box of await rowBoxes()) await user.click(box);
    expect(screen.getByRole("button", { name: /Submit/ })).toBeDisabled();
  });

  it("refuses an empty selection", async () => {
    show();
    await screen.findByText("Flight");
    expect(screen.getByRole("button", { name: /Submit/ })).toBeDisabled();
  });

  it("sends the ticked rows once they are all complete", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("Flight");
    // The first row of the sorted list is the complete one.
    await user.click((await rowBoxes())[0]);
    const button = screen.getByRole("button", { name: /Submit/ });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(submitted).toHaveLength(1);
    expect(submitted[0].map((r) => r.id)).toEqual([2]);
  });
});

// :200-251 — half-typed work is never dropped without being offered back.
describe("moving off a row with unsaved edits", () => {
  it("asks before switching rows", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");
    await user.click(screen.getByText("Hotel"));

    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByText("You have unsaved edits. Save before switching context?")).toBeInTheDocument();
    // Still on the row being edited until the reader decides.
    expect(screen.getByText("2 - Flight")).toBeInTheDocument();
  });

  it("does not ask when nothing has been touched", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.click(screen.getByText("Hotel"));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(await screen.findByText("1 - Hotel")).toBeInTheDocument();
  });

  it("saves and moves on when asked to", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");
    await user.click(screen.getByText("Hotel"));
    await user.click(await screen.findByRole("button", { name: "Save & Continue" }));

    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(drafts[0][0].txnComment).toBe("Team licence!");
    expect(await screen.findByText("1 - Hotel")).toBeInTheDocument();
  });

  it("throws the edit away and moves on when asked to", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");
    await user.click(screen.getByText("Hotel"));
    await user.click(await screen.findByRole("button", { name: "Discard & Continue" }));

    expect(await screen.findByText("1 - Hotel")).toBeInTheDocument();
    expect(drafts).toHaveLength(0);
  });

  it("stays put when cancelled", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");
    await user.click(screen.getByText("Hotel"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    // The dialog holds `aria-hidden` on the app behind it until it has finished
    // closing, which hides the panel from every role query.
    await waitForElementToBeRemoved(() => screen.queryByText("Unsaved changes"));

    expect(screen.getByText("2 - Flight")).toBeInTheDocument();
    expect(commentBox()).toHaveValue("Team licence!");
  });

  it("asks before a tick puts the panel into read-only", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");
    await user.click((await rowBoxes())[0]);

    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
  });
});

// Review findings, each with the behaviour that was wrong before it.
describe("a travel job with no funding sources", () => {
  // EditPane.tsx:568-575 — such a job cannot be charged against, so it is never
  // applied. The panel used to save anyway: Save, the autosave and Save &
  // Continue all wrote a travel row against a job finance could not book it to.
  const unusable = {
    data: {
      engagementCode: "ENG-1",
      engagementType: "T&M",
      country: "LK",
      productUnit: "",
      businessUnit: "",
      fundingSources: [],
    },
    isError: false,
    isFetching: false,
  };

  it("says so, and refuses to save the row", async () => {
    jobDetails = unusable;
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await pick(user, "Expense Category", "Travel");

    expect(
      screen.getByText("No funding sources found for the selected Job number."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("is not written by the autosave either", async () => {
    jobDetails = unusable;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    show();
    await screen.findByText("2 - Flight");
    await pick(user, "Expense Category", "Travel");

    await vi.advanceTimersByTimeAsync(6000);
    expect(drafts).toHaveLength(0);
  });
});

// The chip used to read "Draft saved" beside the error alert, because the
// wrapper swallowed the failure — and the hook, believing it, never retried.
describe("an autosave the backend refuses", () => {
  it("says the draft was not saved", async () => {
    saveFails = true;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");

    await vi.advanceTimersByTimeAsync(5200);
    await waitFor(() => expect(screen.getByText("Draft not saved")).toBeInTheDocument());
    expect(screen.queryByText("Draft saved")).toBeNull();
  });
});

// Switching cards replaces the list and the row the panel is on.
describe("switching cards", () => {
  const switchToSpare = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("combobox", { name: "Credit card" }));
    await user.click(await screen.findByRole("option", { name: /2222/ }));
  };

  it("shows that card's transactions", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("Flight");
    await switchToSpare(user);

    expect(await screen.findByText("Taxi")).toBeInTheDocument();
    expect(screen.queryByText("Flight")).toBeNull();
  });

  it("asks first when the panel has unsaved edits", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("2 - Flight");
    await user.type(commentBox(), "!");
    await switchToSpare(user);

    // Without the guard the autosave flushed the edit on the way out and the
    // reader was never offered the choice.
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByText("2 - Flight")).toBeInTheDocument();
  });

  it("drops a selection belonging to the card being left", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText("Flight");
    await user.click((await rowBoxes())[0]);
    expect(screen.getByRole("button", { name: /Bulk Edit/ })).toBeEnabled();

    await switchToSpare(user);
    // `checked` holds ids and the list is filtered by card, so carrying it over
    // left Bulk Edit enabled and badged with rows it no longer had.
    await screen.findByText("Taxi");
    expect(screen.getByRole("button", { name: /Bulk Edit/ })).toBeDisabled();
  });
});
