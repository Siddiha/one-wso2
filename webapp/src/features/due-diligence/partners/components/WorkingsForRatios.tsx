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

import { useState } from "react";
import { Alert, Button, Menu, MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@wso2/oxygen-ui";
import { humanizeHttpError } from "@api/http";
import { useDueDiligenceGate } from "@features/due-diligence/api/useDueDiligenceGate";
import { useSaveCreditScoreItems } from "../api/useCreditScore";
import type { CreditScoreItem } from "../api/creditScoreTypes";
import { checkObjectComplete } from "./creditScoreMath";

const FIELDS = ["currentAssets", "currentLiability", "cash", "investments", "totalDebt", "totalAssets", "revenue", "profit", "exchangeRate"] as const;
type Field = (typeof FIELDS)[number];

const ROWS: { label: string; field: Exclude<Field, "exchangeRate"> }[] = [
  { label: "Current Assets", field: "currentAssets" },
  { label: "Current Liability", field: "currentLiability" },
  { label: "Cash", field: "cash" },
  { label: "Investments", field: "investments" },
  { label: "Total Debt", field: "totalDebt" },
  { label: "Total Assets", field: "totalAssets" },
  { label: "Revenue", field: "revenue" },
  { label: "Profit", field: "profit" },
];

// Ported from the source app's Resellers/ResellerDashboard/CreditScore/WorkingsForRatios.js's
// YEAR_COLUMN_DEFS — which column each header's "swap with" menu offers.
const YEAR_COLUMN_DEFS = [
  { col: 1, label: "Year Before (N-2)", swapTargets: [{ targetCol: 2, targetLabel: "Prior Year (N-1)" }, { targetCol: 3, targetLabel: "Current (N)" }] },
  { col: 2, label: "Prior Year (N-1)", swapTargets: [{ targetCol: 1, targetLabel: "Year Before (N-2)" }, { targetCol: 3, targetLabel: "Current (N)" }] },
  { col: 3, label: "Current (N)", swapTargets: [{ targetCol: 1, targetLabel: "Year Before (N-2)" }, { targetCol: 2, targetLabel: "Prior Year (N-1)" }] },
] as const;

type DraftYear = Record<Field, number | "">;

// Ported from the source app's returnCellUSD — deliberately no guard against
// a zero/blank exchange rate: the source shows the raw division result
// (Infinity, or NaN for a null rate) rather than hiding or substituting it,
// and the old app is the reference this preview has to match exactly.
function usdCellText(raw: number | "", rate: number | ""): string {
  const value = Math.round((Number(raw) / Number(rate)) * 100) / 100;
  return `$ ${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function blankYear(companyId: string, year: number): DraftYear & { companyId: number; year: number } {
  return {
    companyId: Number(companyId),
    year,
    // "" (not 0) for every field the admin actually types into — 0 is a
    // real, distinct value here (a company can genuinely have 0 profit), so
    // seeding these fields with 0 let an untouched table pass
    // checkObjectComplete's "Table can not be Empty" guard silently.
    // exchangeRate is left at 0: unlike the rest, it's not directly
    // user-facing for a US Dollar company (its input row only renders for
    // other currencies — see `currency !== "US Dollar"` below), so treating
    // it as "unset" here would block every USD company's table from ever
    // being submittable. That gap already exists in the source app, which
    // exempts exchangeRate from this same completeness check outright.
    currentAssets: "",
    currentLiability: "",
    cash: "",
    investments: "",
    totalDebt: "",
    totalAssets: "",
    revenue: "",
    profit: "",
    exchangeRate: 0,
  };
}

/**
 * Ported from the source app's Resellers/ResellerDashboard/CreditScore/WorkingsForRatios.js
 * — the raw-financials input table (superuser-only editing), with the
 * year-column swap menu and USD-converted preview.
 */
export default function WorkingsForRatios({
  companyId,
  currency,
  savedYears,
}: {
  companyId: string;
  currency: string;
  savedYears?: { 1: CreditScoreItem; 2: CreditScoreItem; 3: CreditScoreItem };
}) {
  const gate = useDueDiligenceGate();
  const saveItems = useSaveCreditScoreItems(companyId);

  // A saved item's exchangeRate can be null (never set); the draft's own
  // type doesn't carry null, so it normalizes to 0 here, on load only.
  const toDraft = (item: CreditScoreItem): DraftYear & { companyId: number; year: number } => ({
    ...item,
    exchangeRate: item.exchangeRate ?? 0,
  });

  const initial = (): Record<1 | 2 | 3, DraftYear & { companyId: number; year: number }> =>
    savedYears
      ? { 1: toDraft(savedYears[1]), 2: toDraft(savedYears[2]), 3: toDraft(savedYears[3]) }
      : { 1: blankYear(companyId, 1), 2: blankYear(companyId, 2), 3: blankYear(companyId, 3) };

  const [years, setYears] = useState(initial);
  const [editable, setEditable] = useState(!savedYears);
  const [disabled, setDisabled] = useState(Boolean(savedYears));
  const [submitted, setSubmitted] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; col: 1 | 2 | 3 } | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; severity: "success" | "error" | "warning"; message: string }>({
    open: false,
    severity: "success",
    message: "",
  });

  const setField = (year: 1 | 2 | 3, field: Field, value: string) => {
    setSubmitted(false);
    const parsed = value === "" ? "" : parseFloat(value);
    setYears((prev) => ({ ...prev, [year]: { ...prev[year], [field]: parsed } }));
  };

  const swapColumns = (colA: 1 | 2 | 3, colB: 1 | 2 | 3) => {
    setYears((prev) => {
      const a = { ...prev[colA] };
      const b = { ...prev[colB] };
      for (const field of FIELDS) {
        const tmp = a[field];
        a[field] = b[field];
        b[field] = tmp;
      }
      return { ...prev, [colA]: { ...a, year: colA }, [colB]: { ...b, year: colB } };
    });
    setMenuAnchor(null);
  };

  const submit = () => {
    setSubmitted(true);
    if (!checkObjectComplete(years[1]) || !checkObjectComplete(years[2]) || !checkObjectComplete(years[3])) {
      setSnack({ open: true, severity: "error", message: "Table can not be Empty" });
      return;
    }
    setEditable(false);
    setDisabled(true);
    const payload = ([1, 2, 3] as const).map((y) => years[y] as unknown as CreditScoreItem);
    saveItems.mutate(payload, {
      onSuccess: () => setSnack({ open: true, severity: "success", message: "Success" }),
      onError: (err) => {
        setSnack({ open: true, severity: "error", message: humanizeHttpError(err) });
        setEditable(true);
        setDisabled(false);
      },
    });
  };

  const renderCell = (year: 1 | 2 | 3, field: Field) =>
    disabled ? (
      <TableCell>{years[year][field] !== "" ? years[year][field] : ""}</TableCell>
    ) : (
      <TableCell>
        <TextField
          type="number"
          size="small"
          value={years[year][field]}
          onChange={(e) => setField(year, field, e.target.value)}
          error={submitted && years[year][field] === ""}
          slotProps={{ htmlInput: { min: 0, style: { textAlign: "end" } } }}
        />
      </TableCell>
    );

  return (
    <Stack spacing={1.5}>
      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>

      <Typography sx={{ fontWeight: 600 }}>{currency}</Typography>
      <TableContainer sx={{ border: 1, borderColor: "divider" }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: "background.default" }}>
            <TableRow>
              <TableCell>Items</TableCell>
              <TableCell>Currency</TableCell>
              {YEAR_COLUMN_DEFS.map(({ col, label, swapTargets }) => (
                <TableCell key={col}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <span>{label}</span>
                    {editable && (
                      <Button size="small" sx={{ minWidth: 0, ml: "auto" }} onClick={(e) => setMenuAnchor({ el: e.currentTarget, col })}>
                        ⋮
                      </Button>
                    )}
                  </Stack>
                  {editable && (
                    <Menu anchorEl={menuAnchor?.col === col ? menuAnchor.el : null} open={menuAnchor?.col === col} onClose={() => setMenuAnchor(null)}>
                      {swapTargets.map(({ targetCol, targetLabel }) => (
                        <MenuItem key={targetCol} onClick={() => swapColumns(col, targetCol as 1 | 2 | 3)}>
                          Swap with {targetLabel}
                        </MenuItem>
                      ))}
                    </Menu>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {ROWS.map(({ label, field }) => (
              <TableRow key={field}>
                <TableCell>{label}</TableCell>
                <TableCell>{currency}</TableCell>
                {renderCell(1, field)}
                {renderCell(2, field)}
                {renderCell(3, field)}
              </TableRow>
            ))}
            {currency !== "US Dollar" && (
              <TableRow>
                <TableCell>Exchange Rate</TableCell>
                <TableCell />
                {renderCell(1, "exchangeRate")}
                {renderCell(2, "exchangeRate")}
                {renderCell(3, "exchangeRate")}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {gate.hasRole("superRole") && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          {!editable ? (
            <Button size="small" variant="outlined" onClick={() => { setEditable(true); setDisabled(false); }}>
              Edit
            </Button>
          ) : (
            savedYears && (
              <Button size="small" variant="outlined" onClick={() => { setEditable(false); setDisabled(true); }}>
                Cancel
              </Button>
            )
          )}
          <Button size="small" variant="contained" onClick={submit} disabled={!editable || saveItems.isPending}>
            Submit
          </Button>
        </Stack>
      )}

      {currency !== "US Dollar" &&
        !editable &&
        checkObjectComplete(years[1]) &&
        checkObjectComplete(years[2]) &&
        checkObjectComplete(years[3]) && (
          <>
            <Typography sx={{ fontWeight: 600 }}>US Dollar</Typography>
            <TableContainer sx={{ border: 1, borderColor: "divider" }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: "background.default" }}>
                  <TableRow>
                    <TableCell>Items</TableCell>
                    <TableCell>Currency</TableCell>
                    {YEAR_COLUMN_DEFS.map(({ col, label }) => (
                      <TableCell key={col}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ROWS.map(({ label, field }) => (
                    <TableRow key={field}>
                      <TableCell>{label}</TableCell>
                      <TableCell>USD</TableCell>
                      <TableCell>{usdCellText(years[1][field], years[1].exchangeRate)}</TableCell>
                      <TableCell>{usdCellText(years[2][field], years[2].exchangeRate)}</TableCell>
                      <TableCell>{usdCellText(years[3][field], years[3].exchangeRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
    </Stack>
  );
}
