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

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MasterDataFormDialog from "./MasterDataFormDialog";
import { NotificationsProvider } from "@context/notifications/NotificationsContext";
import type { CreditCard, GlCode, MasterDataRow } from "./masterDataTypes";

vi.mock("./useMasterDataMutations", () => ({
  useCreateMasterData: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMasterData: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMasterData: () => ({ mutate: vi.fn(), isPending: false }),
  describeDeleteError: () => "",
}));

// The country list is served by the backend; the form is what is under test.
vi.mock("./useMasterData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useMasterData")>()),
  useCountries: () => ({ data: { "Sri Lanka": "LKR", Germany: "EUR" } }),
}));

const card: CreditCard = {
  id: 1,
  ccNumber: "1234-1234",
  ccProviderCode: "SVB",
  comment: "sddd",
  employeeEmail: "abinash@wso2.com",
  leadEmails: ["abbas@wso2.com"],
  // Capitalised on purpose: the column carries both spellings.
  status: "Inactive",
};

function show(row?: MasterDataRow) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <MasterDataFormDialog
          tab="creditCards"
          open
          row={row}
          employeeEmails={["abinash@wso2.com", "abbas@wso2.com"]}
          onClose={vi.fn()}
        />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

describe("the credit-card form's status toggle", () => {
  it("offers it when editing, reading the stored status whatever its casing", () => {
    show(card as MasterDataRow);

    const toggle = screen.getByRole("switch");
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("flips to active, and only then offers Update", async () => {
    const user = userEvent.setup();
    show(card as MasterDataRow);

    // Nothing has changed yet, so there is nothing to submit.
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();

    await user.click(screen.getByRole("switch"));

    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  // A new card is created active by the backend, which hardcodes the value;
  // AddCreditCardPayload is a closed record there, so sending the field would
  // be a 400 rather than a no-op.
  it("offers no toggle when creating", () => {
    show(undefined);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  // Expense types carry the same toggle, for the same reason.
  it("offers it on the expense-type form too", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NotificationsProvider>
          <MasterDataFormDialog
            tab="expenseTypes"
            open
            row={
              {
                id: 1,
                expenseCategoryId: 1,
                glCodeId: 1,
                expenseType: "Actually Lucidchart",
                expenseTypeDescription: null,
                engagementCodes: ["SAL-GEN"],
                engagementCodeSuffixes: [],
                status: "inactive",
              } as unknown as MasterDataRow
            }
            onClose={vi.fn()}
          />
        </NotificationsProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});

function showSubsidiaries() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <MasterDataFormDialog tab="subsidiaries" open onClose={vi.fn()} />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

describe("the subsidiary form's country", () => {
  it("offers the countries a subsidiary may be registered in", async () => {
    const user = userEvent.setup();
    showSubsidiaries();

    await user.click(screen.getByRole("combobox", { name: /Country/ }));

    expect(await screen.findByRole("option", { name: "Sri Lanka" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Germany" })).toBeInTheDocument();
  });

  it("keeps the chosen country", async () => {
    const user = userEvent.setup();
    showSubsidiaries();

    await user.click(screen.getByRole("combobox", { name: /Country/ }));
    await user.click(await screen.findByRole("option", { name: "Sri Lanka" }));

    expect(screen.getByRole("combobox", { name: /Country/ })).toHaveValue("Sri Lanka");
  });

  it("shows the currency the chosen country will be saved with", async () => {
    const user = userEvent.setup();
    showSubsidiaries();

    await user.click(screen.getByRole("combobox", { name: /Country/ }));
    await user.click(await screen.findByRole("option", { name: "Sri Lanka" }));

    expect(screen.getByLabelText(/Currency Code/)).toHaveValue("LKR");
  });

  it("does not let that currency be typed over", () => {
    showSubsidiaries();
    expect(screen.getByLabelText(/Currency Code/)).toBeDisabled();
  });
});

const GL_CODES: GlCode[] = [
  {
    id: 7,
    internalId: 1335,
    glCode: "61023-003",
    glAccountName: "Discretionary Marketing : Events Travel",
    costCenter: "Marketing",
  },
  // A GL code with no department of its own. Blank is a real value on this
  // table, so the form has to say so rather than look unfilled.
  { id: 8, internalId: 1400, glCode: "16001-001", glAccountName: "Intercompany", costCenter: null },
];

const mapping = {
  id: 91,
  internalId: "1335",
  accountNumber: "61023-003",
  accountClassification: "Discretionary Marketing : Events Travel",
  engagementCodes: ["MKT-EVT-IND"],
  engagementCodeSuffixes: [],
  invCostTypeId: 1,
  costType: "Air Ticket",
  department: "Marketing",
  status: "Active",
} as unknown as MasterDataRow;

function showMapping(row?: MasterDataRow) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <MasterDataFormDialog
          tab="invoiceAccountMappings"
          open
          row={row}
          glCodes={GL_CODES}
          costTypes={[{ id: 1, name: "Air Ticket" }]}
          mappingAutoComplete={{
            engagementCodes: ["MKT-EVT-IND"],
            engagementCodeSuffixes: ["MKT-EVT"],
            departments: ["Marketing"],
            costTypes: [{ id: 1, label: "Air Ticket" }],
          }}
          onClose={vi.fn()}
        />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

describe("the invoice account mapping form's department", () => {
  it("takes it from the GL code rather than from the reader", async () => {
    const user = userEvent.setup();
    showMapping();

    expect(screen.getByLabelText(/Department/)).toHaveValue("");

    await user.click(screen.getByRole("combobox", { name: /GL Code/ }));
    await user.click(
      await screen.findByRole("option", { name: "61023-003 - Discretionary Marketing : Events Travel" }),
    );

    expect(screen.getByLabelText(/Department/)).toHaveValue("Marketing");
  });

  it("does not let it be typed over", () => {
    showMapping();
    expect(screen.getByLabelText(/Department/)).toBeDisabled();
  });

  // Picking a second GL code has to replace the first one's department, not
  // leave it behind on an account it has nothing to do with.
  it("replaces it on a new GL code, and says so when that one carries none", async () => {
    const user = userEvent.setup();
    showMapping();

    await user.click(screen.getByRole("combobox", { name: /GL Code/ }));
    await user.click(
      await screen.findByRole("option", { name: "61023-003 - Discretionary Marketing : Events Travel" }),
    );
    await user.click(screen.getByRole("combobox", { name: /GL Code/ }));
    await user.click(await screen.findByRole("option", { name: "16001-001 - Intercompany" }));

    expect(screen.getByLabelText(/Department/)).toHaveValue("");
    expect(screen.getByText("This GL code has no department.")).toBeInTheDocument();
  });

  // An em dash reads as a word break rather than a separator at this size,
  // and the account names themselves already contain punctuation.
  it("separates a GL code from its account name with a plain dash", async () => {
    const user = userEvent.setup();
    showMapping();

    await user.click(screen.getByRole("combobox", { name: /GL Code/ }));

    const option = await screen.findByRole("option", { name: /^61023-003/ });
    expect(option.textContent).toContain("61023-003 - Discretionary Marketing");
    expect(option.textContent).not.toContain("\u2014");
  });
});

describe("the invoice account mapping form's status toggle", () => {
  // Nothing is ever filed inactive, so the backend stores a create active and
  // the Add form has no toggle to get wrong.
  it("offers none when creating", () => {
    showMapping();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("still offers one when editing, which is how a mapping is retired", () => {
    showMapping(mapping);
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
