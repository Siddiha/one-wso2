/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CcApproveDetail } from "./CcApproveDetail";
import type { CcTransaction } from "./ccTypes";

vi.mock("@hooks/useAccessToken", () => ({ useAccessToken: () => async () => "token" }));
vi.mock("../components/ReceiptViewer", () => ({ ReceiptViewer: () => null }));

const txn = {
  id: 10384,
  txnDescription: "UBER TRIP SAN FRANCISCO CA",
  txnAmount: 24.66,
  txnDate: "2023-03-07",
  employeeEmail: "yukthi@wso2.com",
  leadEmail: "suhanr@wso2.com",
  financeApproverEmail: null,
  empPostedDate: "2025-03-31",
  leadApprovedDate: null,
  financeApprovedDate: null,
  expenseCategoryLabel: "Infra - Cloud",
  expenseTypeLabel: "CLO-INT-GCP-Subs",
  txnComment: null,
} as unknown as CcTransaction;

const openDetails = async () => {
  const user = userEvent.setup();
  render(<CcApproveDetail txn={txn} canEdit={false} onEdit={() => {}} />);
  await user.click(screen.getByRole("button", { name: /Submission details/ }));
};

// The approval trail reads as three columns of two: who, then when they acted.
describe("submission details", () => {
  it("lays the trail out three to a row", async () => {
    await openDetails();
    // auto-fit sized the track count to whatever fitted, which put four fields
    // on the first row and left each date under the wrong person.
    const grid = screen.getByText("Submitted User").closest("div")?.parentElement;
    expect(grid).toHaveStyle({ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" });
  });

  it("puts each date in the same column as the person it belongs to", async () => {
    await openDetails();
    const labels = ["Submitted User", "Lead Approver", "Finance Approver", "Submitted Date", "Lead Approved Date", "Finance Approved Date"];
    const grid = screen.getByText("Submitted User").closest("div")?.parentElement;
    const rendered = Array.from(grid?.children ?? []).map((c) => c.textContent ?? "");
    // Three columns filled row by row: index i and index i+3 share a column.
    labels.forEach((label, i) => expect(rendered[i]).toContain(label));
  });

  it("says so plainly where nobody has acted yet", async () => {
    await openDetails();
    expect(screen.getByText("yukthi@wso2.com")).toBeInTheDocument();
    expect(screen.getByText("suhanr@wso2.com")).toBeInTheDocument();
    expect(screen.getAllByText("(not approved yet)").length).toBe(3);
  });
});
