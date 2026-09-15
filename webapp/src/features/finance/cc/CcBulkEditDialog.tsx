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

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { describeError } from "../util/financeError";
import { Field, FieldLabel, FieldRow, Placeholder } from "./ccFormFields";
import {
  applyBulkEdit,
  clearBulkDependents,
  CC_BULK_EDIT_EMPTY,
  type CcBulkEditForm,
} from "./ccPendingSubmissions";
import { useCcMenus } from "./useCc";
import { CC_MARKETING_CATEGORY, CC_TRAVEL_CATEGORY, type CcTransaction } from "./ccTypes";

const COMMENT_MAX = 30;

/**
 * Categorise several transactions at once — the source's EditPaneModal.
 *
 * Only the fields you fill in are applied; everything left blank is untouched
 * on every selected row, so this can set just a comment across twelve rows
 * without flattening the categories they already have.
 *
 * Deliberately matching the source and worth stating, because both look like
 * omissions: there is **no confirmation step**, and the selection is **not
 * cleared** after Apply — the reader usually wants to submit the rows they
 * just finished, and clearing would make them tick all twelve again.
 */
export function CcBulkEditDialog({
  open,
  txns,
  onClose,
  onApply,
}: {
  open: boolean;
  /** The selected rows, with any unsaved categorisation already applied. */
  txns: CcTransaction[];
  onClose: () => void;
  onApply: (rows: CcTransaction[]) => Promise<void>;
}) {
  const menus = useCcMenus();
  const [form, setForm] = useState<CcBulkEditForm>(CC_BULK_EDIT_EMPTY);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = menus.expenseTypes.data?.categories ?? [];
  const subRegions = menus.subRegions.data?.subRegions ?? [];
  const productUnits = useMemo(() => menus.units.data?.productUnits ?? [], [menus.units.data]);
  const businessUnits = useMemo(() => menus.units.data?.businessUnits ?? [], [menus.units.data]);
  const typeOptions = form.expenseCategory
    ? menus.expenseTypes.data?.types[form.expenseCategory] ?? []
    : [];

  const unitOptions = useMemo(
    () => productUnits.map((pu, i) => ({ i, label: `${pu} — ${businessUnits[i] ?? ""}` })),
    [productUnits, businessUnits],
  );

  // EditPaneModal.tsx:214-228 — a travel row's units come from its job number,
  // so the unit field is not offered; sub-region is a marketing-only field.
  //
  // With no category chosen the question is the selection's own: offer the unit
  // while at least one selected row is not Travel, and hide it when every one
  // of them is, rather than showing a control that `applyBulkEdit` would refuse
  // to apply to any of them.
  const showProductUnit = form.expenseCategory
    ? form.expenseCategory !== CC_TRAVEL_CATEGORY
    : txns.some((t) => t.expenseCategoryLabel !== CC_TRAVEL_CATEGORY);
  const showSubRegion = form.expenseCategory.startsWith(CC_MARKETING_CATEGORY);

  const set = (field: keyof CcBulkEditForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value, ...clearBulkDependents(field, prev) }));

  const close = () => {
    setForm(CC_BULK_EDIT_EMPTY);
    setError(null);
    onClose();
  };

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await onApply(applyBulkEdit(form, txns, { productUnits, businessUnits }));
      setForm(CC_BULK_EDIT_EMPTY);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
        Edit multiple credit card records
        <Typography sx={{ fontSize: 12.5, color: "text.secondary", fontWeight: 400 }}>
          {txns.length} selected · only the fields you fill in are changed
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <FieldRow>
            <Field label="Expense Category">
              <Select
                value={form.expenseCategory}
                disabled={applying}
                onChange={(e) => set("expenseCategory", String(e.target.value))}
                displayEmpty
                renderValue={(v) => (v ? String(v) : <Placeholder />)}
              >
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
            </Field>
            <Field label="Expense Type">
              <Select
                value={form.expenseType}
                disabled={applying || !form.expenseCategory}
                onChange={(e) => set("expenseType", String(e.target.value))}
                displayEmpty
                renderValue={(v) => (v ? String(v) : <Placeholder />)}
              >
                {typeOptions.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </Field>
          </FieldRow>

          <Box>
            <FieldLabel>Comment</FieldLabel>
            <TextField
              size="small"
              fullWidth
              disabled={applying}
              value={form.comment}
              onChange={(e) => set("comment", e.target.value.slice(0, COMMENT_MAX))}
              placeholder="Applied to every selected transaction"
              helperText={`${form.comment.length}/${COMMENT_MAX}`}
              inputProps={{ "aria-label": "Comment", maxLength: COMMENT_MAX }}
            />
          </Box>

          <FieldRow>
            {showProductUnit && (
              <Field label="Product Unit">
                <Select
                  value={form.productUnit}
                  disabled={applying}
                  onChange={(e) => set("productUnit", String(e.target.value))}
                  displayEmpty
                  renderValue={(v) =>
                    v === "" ? <Placeholder /> : unitOptions[Number(v)]?.label ?? String(v)
                  }
                >
                  {unitOptions.map((o) => (
                    <MenuItem key={o.i} value={String(o.i)}>
                      {o.label}
                    </MenuItem>
                  ))}
                </Select>
              </Field>
            )}
            {showSubRegion && (
              <Field label="Sub Region">
                <Select
                  value={form.subRegion}
                  disabled={applying}
                  onChange={(e) => set("subRegion", String(e.target.value))}
                  displayEmpty
                  renderValue={(v) => (v ? String(v) : <Placeholder />)}
                >
                  {subRegions.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </Field>
            )}
          </FieldRow>

          {error && <Alert severity="error" sx={{ fontSize: 12.5 }}>{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" variant="outlined" onClick={close} disabled={applying}>
          Close
        </Button>
        <Button size="small" variant="contained" onClick={() => void apply()} disabled={applying}>
          {applying ? "Applying…" : "Apply"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
