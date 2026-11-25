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

import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@wso2/oxygen-ui";
import { money } from "../../util/financeFormat";
import { CELL_SX, HEAD_SX } from "../../components/dashboardTableSx";
import { getCategoryBreakdown } from "./expenseDashboardUtils";
import type { ExpenseReportMonthlyItem } from "../expenseTypes";

// "All Time" and a multi-year custom range are not capped at twelve months, so
// the row of month columns can outrun the viewport. The category column is
// pinned to the left edge, which keeps every amount attributable to its row
// however far the table is scrolled.
const STICKY_SX = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  whiteSpace: "nowrap",
} as const;

/** The theme's row shade, the one the footer totals row is tinted with. */
const HOVER_TINT = "var(--oxygen-palette-action-hover)";

/**
 * A pinned cell's geometry, plus a background with no transparency left in
 * it, so the month columns cannot be read through the cell as they scroll
 * underneath it.
 *
 * `action.hover` is translucent in every theme and `background.paper` is in
 * several, so painting a pinned cell with either leaves it see-through. A
 * background COLOUR cannot settle it here either: the footer row shades its
 * cells through a `& td` rule, and that outranks a cell's own class on
 * `background-color`. The shades are therefore stacked as background IMAGES,
 * which nothing else sets, over an opaque page colour at the bottom of the
 * stack — leaving it opaque whatever colour wins underneath.
 *
 * @param tints - Shades to composite on top, nearest the viewer first.
 */
const opaqueSticky = (...tints: readonly string[]) => ({
  ...STICKY_SX,
  backgroundImage: [
    ...tints,
    "var(--oxygen-palette-background-paper)",
    // Last, so it sits at the bottom: opaque, and not another tint.
    "var(--oxygen-palette-background-default)",
  ]
    .map((layer) => `linear-gradient(${layer}, ${layer})`)
    .join(", "),
});

/** One row per expense category, one column per month, with trailing Total and
 *  % columns and a per-month totals row underneath. */
export function ExpenseMonthlyBreakdownTable({
  expenseTypeColumns,
  items,
  currency,
}: {
  expenseTypeColumns: string[];
  items: ExpenseReportMonthlyItem[];
  currency: string;
}) {
  if (items.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: "text.secondary", py: 1.5 }}>
        No claims in this period.
      </Typography>
    );
  }

  const { rows, monthTotals, periodTotal } = getCategoryBreakdown(expenseTypeColumns, items);

  return (
    <Table size="small">
      <TableHead>
        <TableRow sx={HEAD_SX}>
          <TableCell sx={opaqueSticky()}>Category</TableCell>
          {items.map((item) => (
            <TableCell key={item.month} align="right" sx={{ whiteSpace: "nowrap" }}>
              {item.label}
            </TableCell>
          ))}
          <TableCell align="right">Total</TableCell>
          <TableCell align="right">%</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.expenseType}>
            <TableCell sx={{ ...CELL_SX, ...opaqueSticky() }}>{row.expenseType}</TableCell>
            {row.amountsByMonth.map((amount, index) => (
              <TableCell key={items[index].month} align="right" sx={CELL_SX}>
                {money(amount, currency)}
              </TableCell>
            ))}
            <TableCell align="right" sx={CELL_SX}>
              {money(row.total, currency)}
            </TableCell>
            <TableCell align="right" sx={CELL_SX}>
              {row.percentageOfTotal}%
            </TableCell>
          </TableRow>
        ))}
        <TableRow sx={{ "& td": { fontWeight: 700, border: 0, bgcolor: "action.hover" } }}>
          <TableCell sx={{ ...CELL_SX, ...opaqueSticky(HOVER_TINT) }}>Total</TableCell>
          {monthTotals.map((total, index) => (
            <TableCell key={items[index].month} align="right" sx={CELL_SX}>
              {money(total, currency)}
            </TableCell>
          ))}
          <TableCell align="right" sx={CELL_SX}>
            {money(periodTotal, currency)}
          </TableCell>
          <TableCell align="right" sx={CELL_SX}>
            100%
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
