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
          <TableCell sx={{ ...STICKY_SX, bgcolor: "background.paper" }}>Category</TableCell>
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
            <TableCell sx={{ ...CELL_SX, ...STICKY_SX, bgcolor: "background.paper" }}>
              {row.expenseType}
            </TableCell>
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
          <TableCell sx={{ ...CELL_SX, ...STICKY_SX }}>Total</TableCell>
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
