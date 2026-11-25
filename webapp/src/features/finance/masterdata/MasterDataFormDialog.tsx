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
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  Typography,
} from "@wso2/oxygen-ui";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { MASTER_DATA_FORM_COPY, MASTER_DATA_SNACK } from "./masterDataUiText";
import {
  changedFields,
  initialFormData,
  invalidEngagementCodes,
  isFormComplete,
  isUnchanged,
} from "./masterDataForm";
import {
  CreditCardNumberInput,
  IdSelectInput,
  MultiSelectInput,
  SelectInput,
  TextInput,
} from "./masterDataFields";
import {
  describeUpdateError,
  useCreateMasterData,
  useUpdateMasterData,
} from "./useMasterDataMutations";
import { useCountries } from "./useMasterData";
import {
  CREDIT_CARD_PROVIDERS,
  MASTER_DATA_STATUS,
  type CreditCardPayload,
  type DepartmentPayload,
  type ExpenseTypeAutoComplete,
  type ExpenseTypePayload,
  type GlCode,
  type InvoiceAccountMappingAutoComplete,
  type InvoiceAccountMappingPayload,
  type InvoiceCostType,
  type MasterDataPayload,
  type MasterDataRow,
  type MasterDataTab,
  type SubsidiaryPayload,
} from "./masterDataTypes";

/**
 * The mapping form, one field per row.
 *
 * Read top to bottom like the other four tabs, but kept short enough to sit
 * on screen whole: no field is allowed to grow, the account details are one
 * line rather than three boxes, and the two rules about the code fields are
 * one line rather than two alerts.
 */
const MAPPING_FORM_SX = {
  display: "grid",
  gridTemplateColumns: "1fr",
  rowGap: 0.5,
} as const;

/**
 * The tabs whose status toggle sits between the dialog content and its
 * actions, rather than at the foot of the field list.
 *
 * Only the mapping form, which is the long one: there the toggle fell below
 * the fold, so the one control a reader goes looking for when they want a
 * mapping retired was the one they had to scroll to find. The shorter forms
 * have room for it in the field list and keep it there.
 */
const STATUS_BELOW_CONTENT: readonly MasterDataTab[] = ["invoiceAccountMappings"];

/**
 * Add / edit, for every tab.
 *
 * One dialog rather than one per tab: the submit path, the enable rule and
 * the snackbars are identical across them, and only the field list differs.
 * The field list is the `switch` at the bottom.
 *
 * Submit is enabled only when the form is complete AND — when editing —
 * something has actually changed. Pressing it on an unchanged record would
 * PATCH an empty body.
 */
export default function MasterDataFormDialog({
  tab,
  open,
  row,
  glCodes,
  autoComplete,
  employeeEmails,
  costTypes,
  mappingAutoComplete,
  onClose,
}: {
  tab: MasterDataTab;
  open: boolean;
  /** Absent = creating. Present = editing that record. */
  row?: MasterDataRow;
  /** Department form's GL Code dropdown. */
  glCodes?: GlCode[];
  /** Expense-type form's category / GL code / type option lists. */
  autoComplete?: ExpenseTypeAutoComplete;
  /** Credit-card form's employee + lead pickers. */
  employeeEmails?: string[];
  /** Invoice-account-mapping form's Cost Type dropdown. */
  costTypes?: InvoiceCostType[];
  /** Invoice-account-mapping form's engagement code and suffix option lists. */
  mappingAutoComplete?: InvoiceAccountMappingAutoComplete;
  onClose: () => void;
}) {
  const isCreate = !row;
  const copy = MASTER_DATA_FORM_COPY[tab];
  const { showSuccess, showError } = useNotifications();
  const create = useCreateMasterData(tab);
  const update = useUpdateMasterData(tab);
  // Only the subsidiary form asks for a country, so the other three tabs do
  // not pay for the request.
  const countries = useCountries(tab === "subsidiaries" && open);

  // Seeded once per mount. The page keys this dialog on the row being edited,
  // so opening a different record remounts it rather than carrying the last
  // one's values across.
  const [form, setForm] = useState<MasterDataPayload>(() => initialFormData(tab, row));

  const pending = create.isPending || update.isPending;
  const complete = isFormComplete(tab, form);
  const unchanged = row ? isUnchanged(row, form) : false;
  const canSubmit = complete && !unchanged && !pending;

  const set = (key: string, value: string | number | string[]) =>
    setForm((prev) => {
      // Switching provider empties the number. AMEX and SVB have different
      // formats, so a number typed for one is invalid for the other, and
      // leaving it in place would show a filled field that silently fails
      // validation.
      if (key === "ccProviderCode" && value !== (prev as CreditCardPayload).ccProviderCode) {
        return { ...prev, ccProviderCode: value as string, ccNumber: "" };
      }
      return { ...prev, [key]: value };
    });

  // Several fields at once, for a picker that fills in more than its own box:
  // the mapping form's GL Code reports the account number, name and internal
  // ID together, and setting them one at a time would be three renders in
  // which the form is briefly inconsistent.
  const setMany = (patch: Record<string, string | number | string[]>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (row) {
      const patch = changedFields(row, form);
      update.mutate(
        { id: row.id, patch },
        {
          onSuccess: () => {
            showSuccess(MASTER_DATA_SNACK.success.updated);
            onClose();
          },
          // The patch says which refusal a 409 was: retiring or reactivating.
          onError: (error) => showError(describeUpdateError(error, patch)),
        },
      );
    } else {
      create.mutate(form, {
        onSuccess: () => {
          showSuccess(MASTER_DATA_SNACK.success.added);
          onClose();
        },
        onError: () => showError(MASTER_DATA_SNACK.error.adding),
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="master-data-form-title"
    >
      <DialogTitle id="master-data-form-title">
        {isCreate ? copy.addTitle : copy.editTitle}
      </DialogTitle>
      <DialogContent dividers>
        <Fields
          tab={tab}
          form={form}
          set={set}
          setMany={setMany}
          glCodes={glCodes}
          autoComplete={autoComplete}
          employeeEmails={employeeEmails}
          costTypes={costTypes}
          mappingAutoComplete={mappingAutoComplete}
          countryCurrency={countries.data ?? {}}
        />
      </DialogContent>
      {STATUS_BELOW_CONTENT.includes(tab) && (
        <StatusToggle value={(form as { status?: string }).status} onChange={set} belowContent />
      )}
      <DialogActions>
        <Button onClick={onClose} disabled={pending} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isCreate ? "Submit" : "Update"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** The one thing that differs per tab: which fields, in which order. */
function Fields({
  tab,
  form,
  set,
  setMany,
  glCodes,
  autoComplete,
  employeeEmails,
  costTypes,
  mappingAutoComplete,
  countryCurrency,
}: {
  tab: MasterDataTab;
  form: MasterDataPayload;
  set: (key: string, value: string | number | string[]) => void;
  setMany: (patch: Record<string, string | number | string[]>) => void;
  glCodes?: GlCode[];
  autoComplete?: ExpenseTypeAutoComplete;
  employeeEmails?: string[];
  costTypes?: InvoiceCostType[];
  mappingAutoComplete?: InvoiceAccountMappingAutoComplete;
  /** ISO 4217 currency code by country. */
  countryCurrency: Readonly<Record<string, string>>;
}) {
  switch (tab) {
    case "subsidiaries": {
      const f = form as SubsidiaryPayload;
      return (
        <>
          <TextInput
            id="legalName"
            label="Subsidiary Legal Name"
            value={f.legalName}
            required
            onChange={set}
          />
          <TextInput id="code" label="Subsidiary Code" value={f.code} required onChange={set} />
          <TextInput
            id="taxCodeInternalId"
            label="Tax ID"
            value={f.taxCodeInternalId}
            required
            numeric
            onChange={set}
          />
          <TextInput id="taxCode" label="Tax Code" value={f.taxCode} required onChange={set} />
          <SelectInput
            id="country"
            label="Country"
            value={f.country}
            options={Object.keys(countryCurrency)}
            required
            onChange={set}
          />
          {/* Read-only preview, not part of the payload. */}
          <TextInput
            id="currencyCodePreview"
            label="Currency Code"
            value={countryCurrency[f.country] ?? ""}
            required={false}
            disabled
            onChange={() => {}}
          />
        </>
      );
    }

    // The GL Code dropdown shows the code and reports its row id, which is
    // what the payload carries.
    case "departments": {
      const f = form as DepartmentPayload;
      const options = (glCodes ?? []).map((g) => ({ id: g.id, label: g.glCode }));
      return (
        <>
          <TextInput
            id="employeeDepartment"
            label="Department"
            value={f.employeeDepartment}
            required
            onChange={set}
          />
          <TextInput
            id="engagementCode"
            label="Engagement Code"
            value={f.engagementCode}
            required
            onChange={set}
          />
          <IdSelectInput
            id="glCodeId"
            label="GL Code"
            value={f.glCodeId}
            options={options}
            required
            onChange={set}
          />
        </>
      );
    }

    case "expenseTypes": {
      const f = form as ExpenseTypePayload;
      return (
        <>
          <IdSelectInput
            id="expenseCategoryId"
            label="Expense Category"
            value={f.expenseCategoryId}
            options={autoComplete?.expenseCategoryIds ?? []}
            required
            onChange={set}
          />
          <IdSelectInput
            id="glCodeId"
            label="Gl Code"
            value={f.glCodeId}
            options={autoComplete?.glCodeIds ?? []}
            required
            onChange={set}
          />
          <SelectInput
            id="expenseType"
            label="Expense Type"
            value={f.expenseType}
            options={autoComplete?.expenseTypes ?? []}
            required
            freeSolo
            onChange={set}
          />
          <TextInput
            id="expenseTypeDescription"
            label="Expense Type Description"
            value={f.expenseTypeDescription}
            required={false}
            multiline
            onChange={set}
          />
          {/* Boxed together under a warning line, because the rule binding
              these two fields is not visible from either one on its own. */}
          <Alert severity="warning" variant="outlined" sx={{ mt: 2, mb: 1 }}>
            Please fill in at least one of the following fields
          </Alert>
          <Box sx={{ pl: 0.5 }}>
            <MultiSelectInput
              id="engagementCodes"
              label="Engagement Codes"
              values={f.engagementCodes}
              options={autoComplete?.engagementCodes ?? []}
              required={false}
              onChange={set}
            />
            <MultiSelectInput
              id="engagementCodeSuffixes"
              label="Engagement Code Suffixes"
              values={f.engagementCodeSuffixes}
              options={autoComplete?.engagementCodeSuffixes ?? []}
              required={false}
              onChange={set}
            />
          </Box>
          <StatusToggle value={f.status} onChange={set} />
        </>
      );
    }

    case "invoiceAccountMappings": {
      const f = form as InvoiceAccountMappingPayload;
      const costTypeOptions = (costTypes ?? []).map((c) => ({ id: c.id, label: c.name }));

      // The mapping stores the NetSuite account's number, name and internal
      // ID as three loose columns, and all three come from one row of the GL
      // code table. So they are reported by a single GL Code picker rather
      // than typed into three boxes that can disagree with each other, and
      // with NetSuite, one character at a time.
      //
      // Labelled with the code and the account name, because the
      // Autocomplete filters on the label and someone adding a mapping knows
      // "the sponsorship account" more often than its number.
      const glCodeOptions = (glCodes ?? []).map((g) => ({
        id: g.id,
        label: g.glAccountName ? `${g.glCode} - ${g.glAccountName}` : g.glCode,
      }));
      // Resolved back out of the stored account number rather than kept as
      // its own state, so there is one source of truth and an existing row
      // opens with its GL code already shown. `glCodeId` is deliberately not
      // part of the payload: the backend stores the three columns, not the
      // reference, and sending it would be a 400 on a closed record.
      const pickedGlCode = (glCodes ?? []).find((g) => g.glCode === f.accountNumber);
      // A row written before this picker existed can carry an account number
      // that matches no GL code. Its stored values are still shown and the
      // rest of the row stays editable.
      const unmatchedAccount = !pickedGlCode && f.accountNumber.trim().length > 0;

      const applyGlCode = (glCodeId: number) => {
        const picked = (glCodes ?? []).find((g) => g.id === glCodeId);
        if (!picked) {
          setMany({ accountNumber: "", accountClassification: "", internalId: "", department: "" });
          return;
        }
        setMany({
          accountNumber: picked.glCode,
          accountClassification: picked.glAccountName,
          internalId: String(picked.internalId),
          // `costCenter` is the GL code table's own `department` column, and
          // it is the whole of what the Department field below shows.
          department: picked.costCenter ?? "",
        });
      };

      // Some GL codes carry no department, and a blank one is a real value
      // on this table rather than a gap, so an empty box has to read as an
      // answer instead of an unfilled field.
      const departmentHelp = !f.department
        ? pickedGlCode
          ? "This GL code has no department."
          : "Filled in from the GL code."
        : undefined;

      const badCodes = invalidEngagementCodes(f);
      return (
        <Box sx={MAPPING_FORM_SX}>
          <IdSelectInput
            id="invCostTypeId"
            label="Cost Type"
            value={f.invCostTypeId}
            options={costTypeOptions}
            required
            onChange={set}
          />
          <IdSelectInput
            id="glCodeId"
            label="GL Code"
            value={pickedGlCode?.id ?? 0}
            options={glCodeOptions}
            required
            onChange={(_id, value) => applyGlCode(value)}
          />

          {/* The account the GL Code resolves to, on one line. These are not
              inputs any more, they are confirmation of what the picker just
              filled in, and three full-width boxes of them were most of the
              reason this form had to be scrolled. */}
          {f.accountNumber.trim().length > 0 && (
            <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: "action.hover" }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {f.accountClassification || "-"}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                Account {f.accountNumber}
                {f.internalId ? ` \u00b7 NetSuite internal ID ${f.internalId}` : ""}
                {unmatchedAccount ? " \u00b7 not one of the GL codes on file" : ""}
              </Typography>
            </Box>
          )}

          {/* Filled in by the GL Code picker above rather than typed. The
              department a mapping posts to is a property of the NetSuite
              account, so one entered here by hand could only disagree with
              it. Still shown, because it is stored on the mapping and read
              back in the table's Department column. */}
          <TextInput
            id="department"
            label="Department"
            value={f.department}
            required={false}
            disabled
            helperText={departmentHelp}
            onChange={() => {}}
          />

          <MultiSelectInput
            id="engagementCodes"
            label="Engagement Codes"
            values={f.engagementCodes}
            options={mappingAutoComplete?.engagementCodes ?? []}
            required={false}
            hideHelper
            scrollChips
            onChange={set}
          />
          <MultiSelectInput
            id="engagementCodeSuffixes"
            label="Engagement Code Suffixes"
            values={f.engagementCodeSuffixes}
            options={mappingAutoComplete?.engagementCodeSuffixes ?? []}
            required={false}
            hideHelper
            scrollChips
            onChange={set}
          />

          {/* One line in place of two Alert boxes. Both rules are about the
              pair of fields above, and two bordered boxes to say so cost
              more height than the fields they were explaining. */}
          <Typography
            sx={{
              fontSize: 12,
              lineHeight: 1.45,
              color: badCodes.length > 0 ? "error.main" : "text.secondary",
            }}
          >
            {badCodes.length > 0
              ? `Cannot be saved as typed: ${badCodes.join(" \u00b7 ")}. Use letters, digits, hyphens, dots or underscores only, one code per entry.`
              : "Fill in at least one field, pressing Enter after each value. A suffix is matched on the engagement code's second part, so RND-GEN is found for RND-GEN-INT."}
          </Typography>
        </Box>
      );
    }

    case "creditCards": {
      const f = form as CreditCardPayload;
      const emails = employeeEmails ?? [];
      return (
        <>
          <SelectInput
            id="ccProviderCode"
            label="CC Provider Code"
            value={f.ccProviderCode}
            options={CREDIT_CARD_PROVIDERS}
            required
            onChange={set}
          />
          <CreditCardNumberInput
            id="ccNumber"
            label="CC Number"
            value={f.ccNumber}
            providerCode={f.ccProviderCode}
            required
            onChange={set}
          />
          <SelectInput
            id="employeeEmail"
            label="Employee Email"
            value={f.employeeEmail}
            options={emails}
            required
            onChange={set}
          />
          <MultiSelectInput
            id="leadEmails"
            label="Lead Email / Emails"
            values={f.leadEmails}
            options={emails}
            required
            onChange={set}
          />
          <TextInput
            id="comment"
            label="Comment"
            value={f.comment}
            required={false}
            multiline
            onChange={set}
          />
          <StatusToggle value={f.status} onChange={set} />
        </>
      );
    }
  }
}

/**
 * Active / inactive, for the three tabs that retire a record by status.
 *
 * Renders nothing while creating: `value` is absent in exactly that case,
 * the status being no part of any Add payload. See `initialFormData`.
 *
 * Either direction can be refused with a 409: retiring an expense type that
 * active claims still carry, and reactivating one whose Gl code is inactive.
 */
function StatusToggle({
  value,
  onChange,
  belowContent = false,
}: {
  value?: string;
  onChange: (key: string, value: string) => void;
  /**
   * Padded for sitting between the dialog content and its actions, instead
   * of spaced for the foot of the field list. See `STATUS_BELOW_CONTENT`.
   */
  belowContent?: boolean;
}) {
  if (value === undefined) return null;
  const active = value === MASTER_DATA_STATUS.active;
  return (
    <FormControlLabel
      sx={belowContent ? { px: 3, py: 1.5, mr: 0 } : { mt: 0.5 }}
      control={
        <Switch
          checked={active}
          onChange={(_e, checked) =>
            onChange("status", checked ? MASTER_DATA_STATUS.active : MASTER_DATA_STATUS.inactive)
          }
        />
      }
      label={active ? "Active" : "Inactive"}
    />
  );
}
