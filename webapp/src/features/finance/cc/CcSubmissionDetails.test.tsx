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
import { describe, expect, it } from "vitest";

import { CcSubmissionDetails } from "./ccFormFields";
import type { CcTransaction } from "./ccTypes";

const txn = {
  employeeEmail: "yukthi@wso2.com",
  leadEmail: "suhanr@wso2.com",
  financeApproverEmail: null,
  empPostedDate: "2025-03-31",
  leadApprovedDate: null,
  financeApprovedDate: null,
} as unknown as CcTransaction;

const openDetails = async () => {
  const user = userEvent.setup();
  render(<CcSubmissionDetails txn={txn} />);
  await user.click(screen.getByRole("button", { name: /Submission details/ }));
  return screen.getByText("Submitted User").closest("div")?.parentElement;
};

// The Pending Approvals panel shows the same approval trail the Approve
// Submissions screen does, and reads the same way: three columns of two.
describe("the approval trail on Pending Approvals", () => {
  it("lays the trail out three to a row", async () => {
    // auto-fit sized the track count to whatever fitted, which put four fields
    // on the first row and left each date under the wrong person.
    expect(await openDetails()).toHaveStyle({ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" });
  });

  it("puts each date in the same column as the person it belongs to", async () => {
    const grid = await openDetails();
    const rendered = Array.from(grid?.children ?? []).map((c) => c.textContent ?? "");
    // Three columns filled row by row: index i and index i+3 share a column.
    ["Submitted User", "Lead Approver", "Finance Approver", "Submitted Date", "Lead Approved Date", "Finance Approved Date"].forEach(
      (label, i) => expect(rendered[i]).toContain(label),
    );
  });
});
