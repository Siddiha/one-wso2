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
  date: localIsoDateOffset(-10),
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
  draft: null as { transactions: unknown[]; onBehalfOfEmail?: string | null } | null,
  managerEmail: "lead@wso2.com" as string | null,
  employees: [
    { workEmail: "lead@wso2.com", firstName: "Ada", lastName: "Lovelace", employeeThumbnail: null },
  ] as unknown[],
  onBehalfOfEmployees: [] as string[],
  onBehalfOfTravels: [] as { jobNumber: string; customerName: string | null }[],
  rates: [{ currencyCode: "USD", exchangeRate: 300 }] as { currencyCode: string; exchangeRate: number }[],
};

const submitMutate = vi.fn();
const draftRemove = vi.fn();
const draftSave = vi.fn(async () => undefined);

vi.mock("./useExpenseSubmitter", () => ({
  useSubmitterAppData: () => ({
    data: {
      userInfo: {
        workEmail: "me@wso2.com",
        firstName: "Me",
        lastName: "Myself",
        managerEmail: state.managerEmail,
      },
      enableLeadView: false,
      enableFinanceView: true,
      currencyCode: "LKR",
      countryCode: "LK",
      travels: [
        {
          jobNumber: "JOB-1",
          customerName: null,
          engagementCode: null,
          country: null,
          productUnit: null,
          businessUnit: null,
        },
      ],
      draft: state.draft,
      pastDateRestrictionDays: 30,
      onBehalfOfEmployees: state.onBehalfOfEmployees,
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
  useOnBehalfOfTravels: () => ({ data: state.onBehalfOfTravels, isLoading: false, isError: false }),
  useSubmitterExpenseTypes: () => ({ data: [{ id: 3, type: "Taxi" }], isLoading: false, isError: false }),
  useSubmitClaimForEmployee: () => ({ mutate: submitMutate, isPending: false, isError: false, error: null }),
  useSubmitterDraftSync: () => ({
    save: { mutateAsync: draftSave },
    remove: { mutate: draftRemove, mutateAsync: vi.fn(async () => undefined) },
  }),
}));

vi.mock("../useExpense", () => ({
  useExpenseEmployees: () => ({ data: state.employees, isLoading: false, isError: false }),
  useExchangeRates: () => ({ data: state.rates, isLoading: false, isError: false }),
}));

const uploadMutate = vi.fn(async () => "r.pdf");
vi.mock("../useExpenseMutations", () => ({
  useExpenseReceiptUpload: () => ({ mutateAsync: uploadMutate, isPending: false }),
}));

vi.mock("../../components/FinanceShell", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { default: ExpenseSubmitterPage } = await import("./ExpenseSubmitterPage");
const { NotificationsProvider } = await import("@context/notifications/NotificationsContext");

beforeEach(() => {
  submitMutate.mockClear();
  navigate.mockClear();
  draftRemove.mockClear();
  draftSave.mockClear();
  uploadMutate.mockClear();
  state.draft = null;
  state.managerEmail = "lead@wso2.com";
  state.employees = [
    { workEmail: "lead@wso2.com", firstName: "Ada", lastName: "Lovelace", employeeThumbnail: null },
  ];
  state.onBehalfOfEmployees = [];
  state.onBehalfOfTravels = [];
  state.rates = [{ currencyCode: "USD", exchangeRate: 300 }];
});

afterEach(() => {
  const cancel = screen.queryByRole("button", { name: "Cancel" });
  if (cancel) fireEvent.click(cancel);
});

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <ExpenseSubmitterPage />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

// The whole reason this screen exists separately from the Me-side form: a
// finance user files FOR someone else. The employee goes on the payload;
// without it the backend files the claim against the submitter, which is the
// wrong person's money.
describe("filing on behalf of someone else", () => {
  it("offers no picker to someone with nobody to file for", async () => {
    show();
    await screen.findByText(/haven't added any expenses yet/);
    expect(screen.queryByLabelText("Submitting for")).not.toBeInTheDocument();
  });

  // The job numbers offered must be the CLAIM OWNER's. Offering the
  // submitter's own would file the line against a job the employee never
  // travelled on.
  it("swaps in the chosen employee's job numbers, not the submitter's", async () => {
    state.onBehalfOfEmployees = ["colleague@wso2.com"];
    state.employees = [
      { workEmail: "lead@wso2.com", firstName: "Ada", lastName: "Lovelace", employeeThumbnail: null },
      { workEmail: "colleague@wso2.com", firstName: "Grace", lastName: "Hopper", employeeThumbnail: null },
    ];
    state.onBehalfOfTravels = [{ jobNumber: "JOB-HERS", customerName: null }];
    show();

    // Pick the employee before any line exists — the only time it is offered.
    fireEvent.change(await screen.findByLabelText("Submitting for"), { target: { value: "Grace" } });
    fireEvent.click(await screen.findByText("Grace Hopper"));

    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    // The form says whose claim this line joins...
    expect(await screen.findByText("(for Grace Hopper)")).toBeInTheDocument();
    // ...and offers her job numbers, not the signed-in user's JOB-1.
    fireEvent.mouseDown(screen.getByLabelText("Job number"));
    expect(await screen.findByRole("option", { name: /JOB-HERS/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /JOB-1/ })).not.toBeInTheDocument();
  });

  it("puts the chosen employee on the submitted claim", async () => {
    state.onBehalfOfEmployees = ["colleague@wso2.com"];
    state.employees = [
      { workEmail: "colleague@wso2.com", firstName: "Grace", lastName: "Hopper", employeeThumbnail: null },
    ];
    state.onBehalfOfTravels = [{ jobNumber: "JOB-HERS", customerName: null }];
    show();
    fireEvent.change(await screen.findByLabelText("Submitting for"), { target: { value: "Grace" } });
    fireEvent.click(await screen.findByText("Grace Hopper"));
    await addOneLine();

    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(submitMutate).toHaveBeenCalledWith(
        expect.objectContaining({ onBehalfOfEmail: "colleague@wso2.com" }),
        expect.anything(),
      ),
    );
  });

  // Filing for someone else routes to THEIR lead, so the confirmation must not
  // name the submitter's own lead.
  it("does not name your own lead when the claim is for someone else", async () => {
    state.onBehalfOfEmployees = ["colleague@wso2.com"];
    state.employees = [
      { workEmail: "lead@wso2.com", firstName: "Ada", lastName: "Lovelace", employeeThumbnail: null },
      { workEmail: "colleague@wso2.com", firstName: "Grace", lastName: "Hopper", employeeThumbnail: null },
    ];
    state.onBehalfOfTravels = [{ jobNumber: "JOB-HERS", customerName: null }];
    show();
    fireEvent.change(await screen.findByLabelText("Submitting for"), { target: { value: "Grace" } });
    fireEvent.click(await screen.findByText("Grace Hopper"));
    await addOneLine();
    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));

    expect(await screen.findByText(/on behalf of/)).toBeInTheDocument();
    expect(screen.queryByText(/Ada Lovelace/)).not.toBeInTheDocument();
  });

  // A claim filed for yourself must not carry a stale employee from a previous
  // draft — null is what tells the backend "this one is mine".
  it("submits as yourself when nobody is picked", async () => {
    state.draft = { transactions: [draftLine] };
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Restore Draft" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(submitMutate).toHaveBeenCalledWith(
        expect.objectContaining({ onBehalfOfEmail: null }),
        expect.anything(),
      ),
    );
  });
});

// A saved draft is offered rather than restored silently, which would make a
// stale draft look like work in progress.
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

  // Restoring also restores WHOSE draft it was, so it is only offered for
  // A draft saved for Myself belongs to Myself, so picking someone else starts
  // a fresh claim for them rather than carrying your own draft over.
  it("is not offered once an employee is picked", async () => {
    state.onBehalfOfEmployees = ["colleague@wso2.com"];
    state.employees = [
      { workEmail: "lead@wso2.com", firstName: "Ada", lastName: "Lovelace", employeeThumbnail: null },
      { workEmail: "colleague@wso2.com", firstName: "Grace", lastName: "Hopper", employeeThumbnail: null },
    ];
    state.draft = { transactions: [draftLine] };
    show();
    expect(await screen.findByRole("button", { name: "Restore Draft" })).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Submitting for"), { target: { value: "Grace" } });
    fireEvent.click(await screen.findByText("Grace Hopper"));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Restore Draft" })).not.toBeInTheDocument(),
    );
  });

  // A draft belongs to whoever it was being filed FOR. Offering it under
  // "Myself" put a colleague's draft on your own empty claim, and restoring it
  // then switched the picker to them without being asked.
  // Restoring an on-behalf draft is not supported yet, so the button must not
  // appear in that case at all — neither on your own claim (the bug: a
  // colleague's draft offered under "Myself") nor on theirs.
  describe("a draft saved for a colleague", () => {
    beforeEach(() => {
      state.onBehalfOfEmployees = ["colleague@wso2.com"];
      state.employees = [
        { workEmail: "colleague@wso2.com", firstName: "Grace", lastName: "Hopper", employeeThumbnail: null },
      ];
      state.draft = { transactions: [draftLine], onBehalfOfEmail: "colleague@wso2.com" };
    });

    it("is not offered while the picker is on Myself", async () => {
      show();
      await screen.findByText(/haven't added any expenses yet/);
      expect(screen.queryByRole("button", { name: "Restore Draft" })).not.toBeInTheDocument();
    });

    // The draft table is keyed on the caller's email alone, so there is one
    // slot per person: adding a line for anyone overwrites it. The warning
    // therefore has to appear even where restoring is not on offer.
    it("still warns that adding a line will destroy it", async () => {
      show();
      fireEvent.change(await screen.findByLabelText("Submitting for"), { target: { value: "Grace" } });
      fireEvent.click(await screen.findByText("Grace Hopper"));

      fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
      expect(await screen.findByText("Draft Deletion Warning")).toBeInTheDocument();
      // ...and the line form only opens once the loss is accepted.
      expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    });

    it("is not offered even once that colleague is picked", async () => {
      show();
      fireEvent.change(await screen.findByLabelText("Submitting for"), { target: { value: "Grace" } });
      fireEvent.click(await screen.findByText("Grace Hopper"));

      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Restore Draft" })).not.toBeInTheDocument(),
      );
    });
  });

  it("saves the employee onto the autosaved draft", async () => {
    state.onBehalfOfEmployees = ["colleague@wso2.com"];
    state.employees = [
      { workEmail: "colleague@wso2.com", firstName: "Grace", lastName: "Hopper", employeeThumbnail: null },
    ];
    state.onBehalfOfTravels = [{ jobNumber: "JOB-HERS", customerName: null }];
    show();
    fireEvent.change(await screen.findByLabelText("Submitting for"), { target: { value: "Grace" } });
    fireEvent.click(await screen.findByText("Grace Hopper"));
    await addOneLine();

    await waitFor(() =>
      expect(draftSave).toHaveBeenCalledWith(
        expect.objectContaining({ onBehalfOfEmail: "colleague@wso2.com" }),
      ),
    );
  });
});

/**
 * Fill the line dialog and add it to the claim. The receipt is required, so it
 * is dropped on the upload area rather than picked through a file dialog.
 */
async function addOneLine({ amount = "40" }: { amount?: string } = {}) {
  fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
  fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: amount } });

  fireEvent.mouseDown(screen.getByLabelText("Expense type"));
  fireEvent.click(await screen.findByRole("option", { name: "Taxi" }));

  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Airport transfer" } });

  const zone = await screen.findByText(/Drop a receipt here/);
  const file = new File(["x"], "taxi.pdf", { type: "application/pdf" });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  await waitFor(() => expect(uploadMutate).toHaveBeenCalled());

  const add = await screen.findByRole("button", { name: "Add expense" });
  await waitFor(() => expect(add).not.toBeDisabled());
  fireEvent.click(add);
}

// Creating a claim from nothing — the path a submitter actually takes, as
// opposed to restoring a draft someone already built.
describe("creating a claim from scratch", () => {
  it("adds a filled-in line to the claim", async () => {
    show();
    await addOneLine();

    expect(await screen.findByText("EXPENSE ITEM 1")).toBeInTheDocument();
    expect(screen.getByText("Taxi")).toBeInTheDocument();
    expect(screen.getByText("Airport transfer")).toBeInTheDocument();
  });

  it("submits the line it was given", async () => {
    show();
    await addOneLine();

    fireEvent.click(await screen.findByRole("button", { name: /Submit claim/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(submitMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: [expect.objectContaining({ amount: 40, expenseTypeId: 3, receiptUrl: "r.pdf" })],
        }),
        expect.anything(),
      ),
    );
  });

  it("adds a second line rather than replacing the first", async () => {
    show();
    await addOneLine();
    await addOneLine({ amount: "10" });

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Remove expense" })).toHaveLength(2),
    );
  });
});

// A foreign-currency line is converted at the fetched rate. A missing rate must
// NOT collapse to 1 — that would submit the raw foreign amount as if it were
// already in the reimbursement currency.
describe("converting a foreign-currency amount", () => {
  it("prices the line at the fetched rate", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.mouseDown(screen.getByLabelText("Currency"));
    fireEvent.click(await screen.findByRole("option", { name: "USD" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });

    // 50 USD at the mocked rate of 300.
    expect(await screen.findByText("Rs. 15,000.00")).toBeInTheDocument();
    expect(screen.getByText("(1 USD = 300 LKR)")).toBeInTheDocument();
  });

  it("carries the converted figure onto the claim total", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.mouseDown(screen.getByLabelText("Currency"));
    fireEvent.click(await screen.findByRole("option", { name: "USD" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });
    fireEvent.mouseDown(screen.getByLabelText("Expense type"));
    fireEvent.click(await screen.findByRole("option", { name: "Taxi" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Airport transfer" } });
    const zone = await screen.findByText(/Drop a receipt here/);
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(["x"], "t.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(uploadMutate).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Add expense" }));

    // The line, and the card's Total Amount footer, both in LKR.
    await waitFor(() => expect(screen.getAllByText("Rs. 15,000.00").length).toBeGreaterThan(0));
  });

  // A missing rate must NOT collapse to 1: that would price 50 USD as Rs. 50
  // and let the raw foreign amount through as if it were already converted.
  it("refuses to price a line when no rate covers the currency", async () => {
    state.rates = [{ currencyCode: "USD", exchangeRate: 300 }, { currencyCode: "EUR", exchangeRate: 0 }];
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.mouseDown(screen.getByLabelText("Currency"));
    fireEvent.click(await screen.findByRole("option", { name: "USD" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });
    expect(await screen.findByText("Rs. 15,000.00")).toBeInTheDocument();

    // Now drop the rate list, as a date with no published rates would.
    state.rates = [];
    fireEvent.change(screen.getByLabelText("Bill date"), {
      target: { value: localIsoDateOffset(-1) },
    });

    expect(await screen.findByText(/No exchange rate available for USD/)).toBeInTheDocument();
    // Neither converted nor passed through raw.
    expect(screen.queryByText("Rs. 15,000.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Rs. 50.00")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });
});

// The bill date is typeable, so `min`/`max` on the input steer but do not
// enforce — both ends are checked in the form's own validity.
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
    fireEvent.change(await screen.findByLabelText("Bill date"), { target: { value: daysAgo(30) } });
    expect(await screen.findByText("Date within last 30 days required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });

  it("accepts the oldest date the source accepts", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), { target: { value: daysAgo(29) } });
    await waitFor(() =>
      expect(screen.queryByText("Date within last 30 days required")).not.toBeInTheDocument(),
    );
  });

  it("refuses a typed future date", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), {
      target: { value: localIsoDateOffset(3) },
    });
    expect(await screen.findByText("Bill date cannot be in the future")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });

  it("refuses an empty date", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Bill date"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });
});

// The receipt can be dropped on the form, not only picked through a file
// dialog. A dropped file skips the input's `accept` filter, so the type check
// has to be the form's own.
describe("attaching a receipt", () => {
  const openForm = async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    return await screen.findByText(/Drop a receipt here/);
  };

  it("uploads a file dropped on the receipt area", async () => {
    const zone = await openForm();
    const file = new File(["x"], "taxi.pdf", { type: "application/pdf" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(uploadMutate).toHaveBeenCalled());
    expect(await screen.findByText("taxi.pdf")).toBeInTheDocument();
  });

  it("refuses a file type the backend would reject", async () => {
    const zone = await openForm();
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(await screen.findByText(/Invalid file type/)).toBeInTheDocument();
    expect(uploadMutate).not.toHaveBeenCalled();
  });

  // A receipt is required for the line to validate, so a pointer-only control
  // makes the whole form impossible to complete from the keyboard.
  it("opens the file picker from the keyboard", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    const zone = await screen.findByRole("button", { name: /Add a receipt/ });
    expect(zone).toHaveAttribute("tabindex", "0");

    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clicked = vi.spyOn(picker, "click");
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(clicked).toHaveBeenCalled();

    fireEvent.keyDown(zone, { key: " " });
    expect(clicked).toHaveBeenCalledTimes(2);
    clicked.mockRestore();
  });

  it("names the attached receipt on the control once one is on", async () => {
    const zone = await openForm();
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "taxi.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(uploadMutate).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: /Receipt taxi\.pdf/ })).toBeInTheDocument();
  });

  it("refuses a multi-file drop rather than silently taking the first", async () => {
    const zone = await openForm();
    const files = [
      new File(["x"], "a.pdf", { type: "application/pdf" }),
      new File(["y"], "b.pdf", { type: "application/pdf" }),
    ];
    fireEvent.drop(zone, { dataTransfer: { files } });
    expect(await screen.findByText(/more than one file/)).toBeInTheDocument();
    expect(uploadMutate).not.toHaveBeenCalled();
  });

  it("will not add a line with no receipt attached", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "40" } });
    fireEvent.mouseDown(screen.getByLabelText("Expense type"));
    fireEvent.click(await screen.findByRole("option", { name: "Taxi" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Airport transfer" } });

    expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });
});
