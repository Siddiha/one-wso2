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
  /** Invoice-account-mapping form's engagement code / department option lists. */
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
      {/* Outside the scrolling content, not at the foot of it. This is how a
          record is retired, and on the longer forms it used to sit below the
          fold — so the one control a reader goes looking for when they want a
          mapping gone was the one they had to scroll to find. */}
      <StatusToggle value={(form as { status?: string }).status} onChange={set} />
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
        </>
      );
    }

    case "invoiceAccountMappings": {
      const f = form as InvoiceAccountMappingPayload;
      const costTypeOptions = (costTypes ?? []).map((c) => ({ id: c.id, label: c.name }));

      // The mapping stores the NetSuite account's number, name and internal
      // ID as three loose columns, and all three come from one row of the GL
      // code table. So they are reported by a single GL Code picker rather
      // than typed into three boxes that can disagree with each other — and
      // with NetSuite — one character at a time.
      // Labelled with the code and the account name, not the code alone: the
      // Autocomplete filters on the label, and someone adding a mapping knows
      // "the sponsorship account" far more often than its number. The table
      // itself still leads with the code, which is the unique half.
      const glCodeOptions = (glCodes ?? []).map((g) => ({
        id: g.id,
        label: g.glAccountName ? `${g.glCode} — ${g.glAccountName}` : g.glCode,
      }));
      // Resolved back out of the stored account number rather than kept as
      // its own state, so there is one source of truth and an existing row
      // opens with its GL code already shown. `glCodeId` is deliberately not
      // part of the payload: the backend stores the three columns, not the
      // reference, and sending it would be a 400 on a closed record.
      const pickedGlCode = (glCodes ?? []).find((g) => g.glCode === f.accountNumber);
      // A row written before this picker existed can carry an account number
      // that matches no GL code. Its stored values are still shown and the
      // rest of the row stays editable; saying so is better than an empty
      // picker above three filled boxes with no explanation.
      const unmatchedAccount = !pickedGlCode && f.accountNumber.trim().length > 0;

      const applyGlCode = (glCodeId: number) => {
        const picked = (glCodes ?? []).find((g) => g.id === glCodeId);
        if (!picked) {
          setMany({ accountNumber: "", accountClassification: "", internalId: "" });
          return;
        }
        setMany({
          accountNumber: picked.glCode,
          accountClassification: picked.glAccountName,
          internalId: String(picked.internalId),
          // `costCenter` is the GL code table's own `department` column — the
          // backend serves that column under this name. It seeds the field
          // below rather than replacing it, since a mapping may be filed
          // under a different department than its account's default.
          department: picked.costCenter ?? "",
        });
      };

      // Flagged here rather than on the chips themselves: a rejected value is
      // about the pair of lists, and naming the offending codes back is more
      // use than reddening a field that already looks filled in.
      const badCodes = invalidEngagementCodes(f);
      return (
        <>
          <IdSelectInput
            id="invCostTypeId"
            label="Cost Type"
            value={f.invCostTypeId}
            options={costTypeOptions}
            required
            helperText="What is being billed — e.g. Air Ticket, Hotel, or Currency for per diem"
            onChange={set}
          />
          <IdSelectInput
            id="glCodeId"
            label="GL Code"
            value={pickedGlCode?.id ?? 0}
            options={glCodeOptions}
            required
            helperText="The NetSuite account this posts to, by its code — e.g. 61033-003"
            onChange={(_id, value) => applyGlCode(value)}
          />
          {unmatchedAccount && (
            <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
              This mapping's account is not one of the GL codes on file, so the GL Code box above
              is empty. Its stored values are shown below and everything else on this form can
              still be edited — picking a GL Code will replace them.
            </Alert>
          )}
          {/* Read-only: all three are filled in by the GL Account above. */}
          <TextInput
            id="accountClassification"
            label="Account Classification"
            value={f.accountClassification}
            required
            disabled
            helperText="The GL account's name in NetSuite"
            onChange={() => {}}
          />
          <TextInput
            id="accountNumber"
            label="Account Number"
            value={f.accountNumber}
            required
            disabled
            onChange={() => {}}
          />
          <TextInput
            id="internalId"
            label="NetSuite Internal ID"
            value={f.internalId}
            required
            disabled
            onChange={() => {}}
          />
          <SelectInput
            id="department"
            label="Department"
            value={f.department}
            options={mappingAutoComplete?.departments ?? []}
            required={false}
            freeSolo
            helperText="Seeded from the GL Code. Leave blank for an Intercompany mapping."
            onChange={set}
          />
          {/* Boxed together under a warning line for the same reason the
              expense-type pair is: the rule binding these two fields is not
              visible from either one on its own. */}
          <Alert severity="warning" variant="outlined" sx={{ mt: 2, mb: 1 }}>
            Please fill in at least one of the following fields
          </Alert>
          <Box sx={{ pl: 0.5 }}>
            <MultiSelectInput
              id="engagementCodes"
              label="Engagement Codes"
              values={f.engagementCodes}
              options={mappingAutoComplete?.engagementCodes ?? []}
              required={false}
              helperText="Pick a code already in use, or type a new one and press Enter"
              onChange={set}
            />
            <MultiSelectInput
              id="engagementCodeSuffixes"
              label="Engagement Code Suffixes"
              values={f.engagementCodeSuffixes}
              options={mappingAutoComplete?.engagementCodeSuffixes ?? []}
              required={false}
              helperText="Matches any engagement code ending in this. Type and press Enter"
              onChange={set}
            />
          </Box>
          {/* Info, not an error: nothing has gone wrong until one of these
              is actually typed, and the format is worth reading beforehand. */}
          <Alert severity={badCodes.length > 0 ? "warning" : "info"} variant="outlined" sx={{ mt: 1 }}>
            {badCodes.length > 0
              ? "These cannot be saved as typed — use letters, digits, hyphens, dots or " +
                `underscores only, one code per entry: ${badCodes.join(" \u00b7 ")}`
              : "Codes may use letters, digits, hyphens, dots and underscores, one code per entry."}
          </Alert>
        </>
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
        </>
      );
    }
  }
}

/**
 * Active / inactive, for the two tabs that retire a record by status.
 *
 * Renders nothing while creating — `value` is absent in exactly that case,
 * the status being no part of either Add payload. See `initialFormData`.
 *
 * Either direction can be refused with a 409: retiring an expense type that
 * active claims still carry, and reactivating one whose Gl code is inactive.
 */
function StatusToggle({
  value,
  onChange,
}: {
  value?: string;
  onChange: (key: string, value: string) => void;
}) {
  if (value === undefined) return null;
  const active = value === MASTER_DATA_STATUS.active;
  return (
    <FormControlLabel
      // Its own padding, now that it sits between the content and the
      // actions rather than inside the scrolling field list.
      sx={{ px: 3, py: 1.5, mr: 0 }}
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
