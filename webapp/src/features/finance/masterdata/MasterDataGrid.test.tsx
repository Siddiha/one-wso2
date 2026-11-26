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
import MasterDataGrid from "./MasterDataGrid";
import type { MasterDataRow, MasterDataTab } from "./masterDataTypes";

const creditCard = {
  id: 1,
  ccNumber: "1234-1234",
  ccProviderCode: "SVB",
  comment: "sddd",
  employeeEmail: "abinash@wso2.com",
  leadEmails: ["abbas@wso2.com"],
  status: "inactive",
};

const expenseType = {
  id: 1,
  expenseCategoryId: 1,
  expenseCategory: "CC-Infra",
  expenseDescription: null,
  glCodeId: 1,
  glCode: "62001-004",
  glCodeInternalId: 1,
  glAccountName: "Infra",
  costCenter: "Infra",
  expenseType: "Actually Lucidchart",
  expenseTypeDescription: null,
  engagementCodes: ["SAL-GEN"],
  engagementCodeSuffixes: [],
  status: "inactive",
};

const invoiceAccountMapping = {
  id: 14,
  internalId: "351",
  accountNumber: "61033-003",
  accountClassification: "Travel - Air Ticket",
  engagementCodes: ["RND-GEN-INT"],
  engagementCodeSuffixes: ["RND-CON"],
  invCostTypeId: 1,
  costType: "Air Ticket",
  department: "Engineering",
  status: "active",
};

const subsidiary = {
  id: 1,
  taxCodeInternalId: 7,
  taxCode: "LK",
  legalName: "WSO2 Lanka",
  code: "LK01",
};

function show(tab: MasterDataTab, row: MasterDataRow) {
  return render(
    <MasterDataGrid
      tab={tab}
      rows={[row]}
      loading={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

describe("the master-data table's row actions", () => {
  // The credit-card endpoint behind Delete is a soft delete — it sets
  // `status = 'inactive'` and the list filters nothing, so the row stays put.
  // On a card already inactive it did nothing observable whatsoever, which is
  // a button promising an action it cannot perform.
  it("offers no Delete on Credit Cards", () => {
    show("creditCards", creditCard as MasterDataRow);

    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  // Expense Types goes the same way, for the same reason: its delete is a
  // soft one too. The reference check that guarded it has moved onto the
  // update path, so retiring a type through the toggle is still refused when
  // active claims carry it.
  it("offers no Delete on Expense Types", () => {
    show("expenseTypes", expenseType as MasterDataRow);

    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  // Invoice Account Mappings too. Retiring one is `status = 'inactive'`,
  // which is exactly what stops Travel matching it — a hard delete would
  // throw away the audit trail on a table that decides where money posts.
  it("offers no Delete on Invoice Account Mappings", () => {
    show("invoiceAccountMappings", invoiceAccountMapping as MasterDataRow);

    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  // Cost Type is the column that separates a Travel Invoice mapping from a
  // Per diem one — they are one table, not two, so without it the rows are
  // indistinguishable on screen.
  it("shows the cost type a mapping is filed under", () => {
    show("invoiceAccountMappings", invoiceAccountMapping as MasterDataRow);

    expect(screen.getByText("Air Ticket")).toBeInTheDocument();
  });

  // Subsidiaries and Departments keep theirs — they carry no status column,
  // so a delete is the only way to retire one.
  it("keeps Delete on the tabs that have no status toggle", () => {
    show("subsidiaries", subsidiary as MasterDataRow);

    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete")).toBeInTheDocument();
  });
});

// The account name and internal ID have no column of their own on this tab,
// so the info tooltip is the only place they appear. Reachable by pointer
// alone, they would not exist at all for anyone using a keyboard or a screen
// reader, which on the table that decides where money posts is not a
// cosmetic gap.
describe("the master-data table's hidden detail", () => {
  it("names the fields behind the info icon, and lets a keyboard reach them", () => {
    show("invoiceAccountMappings", invoiceAccountMapping as MasterDataRow);

    const icon = screen.getByRole("img", {
      name: "Account Name: Travel - Air Ticket, Internal ID: 351",
    });
    expect(icon).toHaveAttribute("tabindex", "0");
  });

  it("says N/A for a detail the row does not carry, as the tooltip does", () => {
    show("invoiceAccountMappings", {
      ...invoiceAccountMapping,
      internalId: "",
    } as MasterDataRow);

    expect(
      screen.getByRole("img", { name: "Account Name: Travel - Air Ticket, Internal ID: N/A" }),
    ).toBeInTheDocument();
  });

  // Capped at two chips on this tab, so a mapping with three codes keeps one
  // in the tooltip only.
  it("names the whole code list when the cell is showing part of it", () => {
    show("invoiceAccountMappings", {
      ...invoiceAccountMapping,
      engagementCodes: ["RND-GEN-INT", "MKT-EVT-IND", "SAL-GEN"],
    } as MasterDataRow);

    const cell = screen.getByLabelText("RND-GEN-INT, MKT-EVT-IND, SAL-GEN");
    expect(cell).toHaveAttribute("tabindex", "0");
  });

  // Nothing hidden, nothing to announce: a label repeating the one chip
  // already on screen would be read out twice.
  it("leaves a cell that hides nothing unlabelled and out of the tab order", () => {
    show("invoiceAccountMappings", invoiceAccountMapping as MasterDataRow);

    expect(screen.queryByLabelText("RND-GEN-INT")).not.toBeInTheDocument();
  });
});
