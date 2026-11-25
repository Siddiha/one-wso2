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

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpenseMonthlyBreakdownTable } from "./ExpenseMonthlyBreakdownTable";
import type { ExpenseReportMonthlyItem } from "../expenseTypes";

const COLUMNS = ["Air Ticket", "Accommodation"];

const ITEMS: ExpenseReportMonthlyItem[] = [
  {
    month: "2026-01",
    label: "Jan 2026",
    amounts: [
      { expenseType: "Air Ticket", amount: 300 },
      { expenseType: "Accommodation", amount: 100 },
    ],
    total: 400,
    percentageOfTotal: 40,
  },
  {
    month: "2026-02",
    label: "Feb 2026",
    amounts: [
      { expenseType: "Air Ticket", amount: 500 },
      { expenseType: "Accommodation", amount: 100 },
    ],
    total: 600,
    percentageOfTotal: 60,
  },
];

/** The rules emotion wrote for `cell`, as one string. */
const styleFor = (cell: HTMLElement): string => {
  const classes = Array.from(cell.classList).map((name) => `.${name}`);
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((text) => classes.some((name) => text.startsWith(name)))
    .join(" ");
};

const cellLabelled = (label: string): HTMLElement =>
  screen.getAllByRole("cell").concat(screen.getAllByRole("columnheader")).find(
    (cell) => cell.textContent === label,
  )!;

describe("ExpenseMonthlyBreakdownTable", () => {
  it("puts categories on rows and months across the header", () => {
    render(<ExpenseMonthlyBreakdownTable expenseTypeColumns={COLUMNS} items={ITEMS} currency="USD" />);

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Category", "Jan 2026", "Feb 2026", "Total", "%"]);
    expect(screen.getByText("Air Ticket")).toBeInTheDocument();
    expect(screen.getByText("Accommodation")).toBeInTheDocument();
  });

  // The pinned column is the one thing on this table that is read over the
  // top of other content, so each of its cells has to be opaque in its own
  // right. A translucent one lets the month figures scrolling behind it show
  // through, which on a totals row reads as a wrong number rather than as a
  // styling slip.
  it.each(["Category", "Air Ticket", "Total"])(
    "paints the pinned %s cell with no transparency left in it",
    (label) => {
      render(<ExpenseMonthlyBreakdownTable expenseTypeColumns={COLUMNS} items={ITEMS} currency="USD" />);

      const css = styleFor(cellLabelled(label));
      expect(css).toContain("position: sticky");
      // Composited as images rather than a colour: the footer row's own `& td`
      // rule outranks a cell class on background-color.
      expect(css).toContain("background-image");
      // An opaque page colour at the bottom of the stack is what makes the
      // whole stack opaque, whatever sits above it.
      expect(css).toContain("--oxygen-palette-background-default");
    },
  );

  // Fixing the transparency by painting the cell plain `background.paper`
  // would have dropped the footer shade and left the Total cell looking like
  // an ordinary body row.
  it("keeps the footer shade on the pinned Total cell", () => {
    render(<ExpenseMonthlyBreakdownTable expenseTypeColumns={COLUMNS} items={ITEMS} currency="USD" />);

    expect(styleFor(cellLabelled("Total"))).toContain("--oxygen-palette-action-hover");
  });

  it("says so rather than drawing an empty table when the period has no claims", () => {
    render(<ExpenseMonthlyBreakdownTable expenseTypeColumns={COLUMNS} items={[]} currency="USD" />);

    expect(screen.getByText("No claims in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
