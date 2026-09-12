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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { localIsoDateOffset } from "@utils/localDate";

// The page leaves for the claims list once a claim is in, so the test needs to
// see where it went.
const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@hooks/useAccessToken", () => ({ useAccessToken: () => async () => "token" }));
vi.mock("@asgardeo/react", () => ({ useAsgardeo: () => ({ isSignedIn: true }) }));

const draftLine = {
  // Derived from the clock, not hardcoded: the form refuses a bill date older
  // than `pastDateRestrictionDays` (30 in this fixture), so a fixed date makes
  // every test that EDITS this line start failing once that many days pass —
  // Save stays disabled, the dialog never closes, and the failure looks like a
  // missing button rather than an expired fixture.
  date: localIsoDateOffset(-5),
  amount: 40,
  currency: "USD",
  currencyConversionRate: 300,
  reimbursementAmount: 12000,
  reimbursementCurrency: "LKR",
  expenseTypeId: 3,
  expenseType: "Taxi",
  comment: "Airport transfer",
  receiptUrl: "r1.pdf",
  travelJobNumber: "JOB-1",
};

const state = {
  // `onBehalfOfEmail` is part of the saved draft on the wire (`types.bal:26-31`)
  // — who it was being filed for, which decides whether this form may offer it.
  draft: null as { transactions: unknown[]; onBehalfOfEmail?: string | null } | null,
  managerEmail: "lead@wso2.com" as string | null,
  employees: [
    { workEmail: "lead@wso2.com", firstName: "Ada", lastName: "Lovelace", employeeThumbnail: null },
  ] as unknown[],
};

vi.mock("../useExpense", () => ({
  useExpenseAppData: () => ({
    data: {
      userInfo: {
        workEmail: "me@wso2.com",
        firstName: "Me",
        lastName: "Myself",
        managerEmail: state.managerEmail,
      },
      enableLeadView: false,
      enableFinanceView: false,
      currencyCode: "LKR",
      countryCode: "LK",
      travels: [{ jobNumber: "JOB-1", customerName: null, engagementCode: null, country: null, productUnit: null, businessUnit: null }],
      draft: state.draft,
      pastDateRestrictionDays: 30,
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
  useExpenseEmployees: () => ({ data: state.employees, isLoading: false, isError: false }),
  useExpenseTypes: () => ({ data: [{ id: 3, type: "Taxi" }], isLoading: false, isError: false }),
  useExchangeRates: () => ({ data: [{ currencyCode: "USD", exchangeRate: 300 }], isLoading: false, isError: false }),
}));

const submitMutate = vi.fn();
const draftRemove = vi.fn();
vi.mock("../useExpenseMutations", () => ({
  useExpenseReceiptUpload: () => ({ mutateAsync: vi.fn(async () => "r.pdf"), isPending: false }),
  useSubmitExpenseClaim: () => ({ mutate: submitMutate, isPending: false, isError: false, error: null }),
  useExpenseDraftSync: () => ({
    save: { mutateAsync: vi.fn(async () => undefined) },
    remove: { mutate: draftRemove, mutateAsync: vi.fn(async () => undefined) },
  }),
}));

vi.mock("../../components/FinanceShell", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { default: ExpenseNewClaimPage } = await import("./ExpenseNewClaimPage");
const { NotificationsProvider } = await import("@context/notifications/NotificationsContext");

beforeEach(() => {
  submitMutate.mockClear();
  navigate.mockClear();
  draftRemove.mockClear();
  state.draft = null;
  state.managerEmail = "lead@wso2.com";
});

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <ExpenseNewClaimPage />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

// NewClaim.tsx:200-216,263-270. The port restored a saved draft silently, which
// makes a stale draft look like work in progress and leaves no way to start
// fresh without deleting lines you never entered this session.
describe("a saved draft is offered, not assumed", () => {
  it("is not loaded on arrival", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    expect(await screen.findByRole("button", { name: "Restore Draft" })).toBeInTheDocument();
    expect(screen.queryByText("Taxi")).not.toBeInTheDocument();
  });

  it("loads when restored", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    expect(await screen.findByText("Taxi")).toBeInTheDocument();
    expect(await screen.findByText("Draft restored successfully")).toBeInTheDocument();
  });

  it("keeps the reimbursement total the draft was saved with", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    expect(
      await screen.findByRole("button", { name: "Submit claim (Rs. 12,000.00)" }),
    ).toBeInTheDocument();
  });

  it("offers nothing to restore when there is no draft", async () => {
    show();
    await screen.findByText(/No expenses yet/);
    expect(screen.queryByRole("button", { name: "Restore Draft" })).not.toBeInTheDocument();
  });

  it("warns before a new line discards the draft", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    expect(await screen.findByText("Draft Deletion Warning")).toBeInTheDocument();
  });

  // NewClaim.tsx:53 — `canRestoreDraft` also requires the draft to belong to
  // whoever the form is filing for. This form only ever files the reader's own
  // claim, so a draft saved while filing FOR somebody else is not offered: its
  // lines carry that person's job numbers and would be filed as the reader's
  // own spend.
  it("does not offer a draft that was being filed for somebody else", async () => {
    state.draft = { transactions: [draftLine], onBehalfOfEmail: "yukthi@wso2.com" };
    show();
    await screen.findByText(/No expenses yet/);
    expect(screen.queryByRole("button", { name: "Restore Draft" })).not.toBeInTheDocument();
  });

  // One draft slot per person, shared with the submitter screen: adding a line
  // here overwrites it whoever it belonged to, so the warning still stands.
  it("still warns before discarding somebody else's draft", async () => {
    state.draft = { transactions: [draftLine], onBehalfOfEmail: "yukthi@wso2.com" };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    expect(await screen.findByText("Draft Deletion Warning")).toBeInTheDocument();
  });

  it("does not warn once there is no draft to lose", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    expect(await screen.findByText("Add an expense")).toBeInTheDocument();
  });
});

// NewClaim.tsx:225-248 — the claim leaves for someone else to review, so it is
// confirmed rather than sent on one click, and the message names the lead.
describe("submitting is confirmed", () => {
  it("asks before sending, and names the lead", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));

    expect(await screen.findByText("Claim Submission Confirmation")).toBeInTheDocument();
    // AppHandler.tsx:28 resolves the name from /employees.
    expect(screen.getByText(/\(Ada Lovelace\)/)).toBeInTheDocument();
    expect(submitMutate).not.toHaveBeenCalled();
  });

  it("falls back to the address when the name is unknown", async () => {
    state.employees = [];
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));
    expect(await screen.findByText(/\(lead@wso2\.com\)/)).toBeInTheDocument();
    state.employees = [
      { workEmail: "lead@wso2.com", firstName: "Ada", lastName: "Lovelace", employeeThumbnail: null },
    ];
  });

  it("omits the parenthetical entirely when there is no lead", async () => {
    state.managerEmail = null;
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));
    await screen.findByText("Claim Submission Confirmation");
    // NewClaim.tsx:240-242 renders no empty "()" when neither name nor email is known.
    expect(screen.queryByText(/\(\s*\)/)).not.toBeInTheDocument();
  });

  it("sends once confirmed", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() => expect(submitMutate).toHaveBeenCalled());
  });
});

// NewClaim.tsx:139 passes AccessMode.EDIT_DELETE — a line can be corrected in
// place. The port could only remove and retype it, which on this form means
// re-picking the job number, expense type, currency and receipt.
describe("correcting a line", () => {
  it("opens the line's values for editing", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit expense" }));

    expect(await screen.findByText("Edit expense")).toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Airport transfer")).toBeInTheDocument();
  });

  it("replaces the line rather than adding another", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit expense" }));
    fireEvent.change(await screen.findByDisplayValue("40"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save expense" }));

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Remove expense" })).toHaveLength(1),
    );
    // 50 USD at the mocked rate of 300 = 15,000 reimbursed.
    expect(
      screen.getByRole("button", { name: "Submit claim (Rs. 15,000.00)" }),
    ).toBeInTheDocument();
  });

  it("adds a second line when not editing", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    expect(await screen.findByText("Add an expense")).toBeInTheDocument();
    // A fresh line starts empty rather than carrying the edited one's values.
    expect(screen.queryByDisplayValue("Airport transfer")).not.toBeInTheDocument();
  });
});

// ExpenseForm.tsx:133-143 compares the bill date against a timestamp
// (`now - N days`) with isAfter, and the date is midnight — so midnight of N
// days ago is never after it. The oldest date accepted is N-1 days ago:
// "within the last N days" counting today as the first. The port's inclusive
// min allowed one day more, and did not check the typed value at all.
// The clock is frozen just after midnight UTC, which is the previous evening
// in the suite's timezone. That is exactly the window where a calendar date
// read from `toISOString()` and one read from local fields name different days,
// and it is the only window in which this class of bug shows itself.
describe("the date bound near midnight UTC", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T02:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bounds the picker by the local calendar day, not the UTC one", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    const field = await screen.findByLabelText("Bill date");
    // 30-day restriction, so the oldest accepted date is 29 days back from the
    // local day (30 Aug here), not from the UTC one (31 Aug).
    expect(field).toHaveAttribute("min", localIsoDateOffset(-29));
    expect(field).toHaveAttribute("max", localIsoDateOffset(0));
  });
});

describe("how far back a bill date may go", () => {
  const daysAgo = (n: number) => localIsoDateOffset(-n);

  it("bounds the picker at N-1 days, not N", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    // pastDateRestrictionDays is 30 in the fixture.
    expect(await screen.findByLabelText("Bill date")).toHaveAttribute("min", daysAgo(29));
  });

  it("refuses a typed date that is one day too old", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), {
      target: { value: daysAgo(30) },
    });
    expect(await screen.findByText("Date within last 30 days required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });

  it("accepts the oldest date the source accepts", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), {
      target: { value: daysAgo(29) },
    });
    await waitFor(() =>
      expect(screen.queryByText("Date within last 30 days required")).not.toBeInTheDocument(),
    );
  });
});

// Raised on PR #30. The source's picker sets maxDate={new Date()}
// (CustomDatePicker.tsx:73), so a bill is never dated in the future. The port's
// native input carries `max`, but the attribute takes no part in `valid` — and
// the field is typeable, so a future date reached the claim.
describe("a bill cannot be dated in the future", () => {
  const inDays = (n: number) => localIsoDateOffset(n);

  it("refuses a typed future date", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), {
      target: { value: inDays(3) },
    });
    expect(await screen.findByText("Bill date cannot be in the future")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });

  it("accepts today", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), {
      target: { value: inDays(0) },
    });
    await waitFor(() =>
      expect(screen.queryByText("Bill date cannot be in the future")).not.toBeInTheDocument(),
    );
  });

  it("refuses an empty date", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });
});


// A submitted claim should have a visible result. Leaving an emptied form on
// screen makes it look like nothing happened, and the claim it produced is the
// one thing worth seeing.
describe("after a claim goes in", () => {
  /** A claim with one line in it, sent and confirmed. */
  async function submitClaim() {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() => expect(submitMutate).toHaveBeenCalled());
  }

  it("goes to the expense list, not the OPD one", async () => {
    await submitClaim();
    submitMutate.mock.calls[0][1].onSuccess();
    expect(navigate).toHaveBeenCalledWith("/me/claims/expense", { replace: true });
  });

  // Back should not return to a form that has already been sent.
  it("replaces the form in history rather than stacking on it", async () => {
    await submitClaim();
    submitMutate.mock.calls[0][1].onSuccess();
    expect(navigate.mock.calls.at(-1)?.[1]).toMatchObject({ replace: true });
  });

  it("stays put when the submit fails", async () => {
    await submitClaim();
    submitMutate.mock.calls[0][1].onError(new Error("nope"));
    expect(navigate).not.toHaveBeenCalled();
  });
});
