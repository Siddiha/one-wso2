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

import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { describeError } from "@api/errors";
import ErrorNotice from "@components/error-notice/ErrorNotice";
import { ACCOUNT_TYPE_LABEL } from "@features/my/api/derive";
import { useBanks } from "@features/my/api/useBanks";
import { useCreateBankAccountRequest } from "@features/my/api/useCreateBankAccountRequest";
import {
  consultancyAllowedLocations,
  initialConsultancyBankLocation,
} from "@features/my/api/bankingRules";
import type { AccountType, Bank, CustomLocationMapEntry } from "@features/my/api/types";
import {
  banksLocationKey,
  buildCreateBankAccountRequestPayload,
  todayIsoDate,
  validateAccountHolder,
  validateBankInfo,
  type BankAccountFormErrors,
  type BankAccountFormValues,
} from "../util/bankAccountRequestForm";

const BLANK_VALUES: BankAccountFormValues = {
  accountName: "",
  beneficiaryAddress: "",
  beneficiaryCity: "",
  accountHolderCountry: "",
  accountNumber: "",
  bankLocation: "",
  bankName: "",
  bankSwiftCode: "",
  bankCode: "",
  bankAddress: "",
  branchName: "",
  branchCode: "",
};

type DialogStep = "holder" | "bank" | "review";
const STEP_ORDER: DialogStep[] = ["holder", "bank", "review"];
const STEP_LABELS = ["Account Holder Info", "Bank Info", "Finish"];

export interface BankAccountRequestDialogProps {
  accountType: AccountType;
  employeeEmail: string;
  /** The full country list the Account Holder's Country step picks from — banking app-config's own `allCountries`. */
  allCountries: string[];
  /** The employee's own work location — folded into the Bank Location step's options, same as the source app. */
  employeeWorkLocation: string | undefined;
  /** Banking app-config's `customLocationMap` — narrows Consultancy's Bank Location options. */
  customLocationMap: CustomLocationMapEntry[];
  /**
   * Offers every Bank Location on file rather than the ones the employee's own work
   * location allows. Set when an Admin raises the request for somebody else, since an
   * employee based in one country can hold a Consultancy account with a bank in another
   * and only the Admin is in a position to say so.
   */
  allowAnyBankLocation?: boolean;
  onClose: () => void;
  /** Called after a successful submission — the caller closes the dialog and refetches. */
  onSuccess: () => void;
}

// The Account Holder Info -> Bank Info -> Finish flow behind each panel's
// Edit Account action, matching the source app's own Stepper dialog step
// order and field grouping, rebuilt with this app's own component library.
// Always starts blank: a Change Request is a new submission, not an
// in-place edit of the current Active account — the source app's own form
// does the same regardless of whether one already exists.
//
// Two fields deliberately don't line up with each other: Account Holder's
// Country (step 1) picks from the full allCountries list, while Bank
// Location (step 2) picks from the banks actually on file plus the
// employee's own work location — that's the source app's own behaviour for
// every Account Type except Consultancy, whose Bank Location is narrowed to
// the `customLocationMap` entry for the employee's work location (or just
// that location when there is no entry), and starts pre-selected.
export default function BankAccountRequestDialog({
  accountType,
  employeeEmail,
  allCountries,
  employeeWorkLocation,
  customLocationMap,
  allowAnyBankLocation = false,
  onClose,
  onSuccess,
}: BankAccountRequestDialogProps) {
  const [step, setStep] = useState<DialogStep>("holder");
  const isConsultancy = accountType === "CONSULTANCY";
  const consultancyLocations = useMemo(
    () => (isConsultancy ? consultancyAllowedLocations(employeeWorkLocation, customLocationMap) : []),
    [isConsultancy, employeeWorkLocation, customLocationMap],
  );
  const [values, setValues] = useState<BankAccountFormValues>(() => ({
    ...BLANK_VALUES,
    bankLocation: isConsultancy
      ? initialConsultancyBankLocation(employeeWorkLocation, consultancyLocations)
      : "",
  }));
  const [errors, setErrors] = useState<BankAccountFormErrors>({});
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [invalidCountryAcknowledged, setInvalidCountryAcknowledged] = useState(false);

  const banksQuery = useBanks(true);
  const mutation = useCreateBankAccountRequest();

  const stepIndex = STEP_ORDER.indexOf(step);

  const bankLocations = useMemo(() => {
    if (isConsultancy && !allowAnyBankLocation) return consultancyLocations;
    const set = new Set((banksQuery.data?.banks ?? []).map((b) => b.bankLocation));
    if (employeeWorkLocation) set.add(employeeWorkLocation);
    // The unrestricted list stays a superset of the restricted one. A mapped
    // location can be an abbreviation the bank records do not carry — "US"
    // against their "United States" — and that is the value the form starts
    // on, so leaving it out would strand an Admin who moved away from it with
    // no way back.
    for (const location of consultancyLocations) set.add(location);
    // Backend order first, then the employee's own location and any mapped
    // ones that were missing from it. Left unsorted so the banks on file keep
    // the order the backend returned them in.
    return Array.from(set);
  }, [isConsultancy, allowAnyBankLocation, consultancyLocations, banksQuery.data, employeeWorkLocation]);

  // The employee's own work location is missing from the Bank Location
  // options — only reachable for Consultancy, when its customLocationMap
  // entry leaves the work location out. Just informs, like the source app.
  const showInvalidCountry =
    Boolean(employeeWorkLocation) &&
    !bankLocations.includes(employeeWorkLocation as string) &&
    !invalidCountryAcknowledged;

  const banksForLocation = useMemo(
    () => (banksQuery.data?.banks ?? []).filter(
        (b) => b.bankLocation === banksLocationKey(values.bankLocation),
      ),
    [banksQuery.data, values.bankLocation],
  );

  function set<K extends keyof BankAccountFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  // Picking a location or bank starts the Bank Info fields that depend on it
  // over: stale validation messages on the address/branch fields go away.
  function clearDependentErrors() {
    setErrors((e) => ({ ...e, bankAddress: undefined, branchName: undefined, branchCode: undefined }));
  }

  function selectBankLocation(next: string) {
    clearDependentErrors();
    setValues((v) => ({
      ...v,
      bankLocation: next,
      // A bank picked under the old location doesn't necessarily exist
      // under the new one — reset rather than carry over a mismatched pair.
      bankName: "",
      bankSwiftCode: "",
      bankCode: "",
    }));
  }

  function selectBank(selected: Bank | null) {
    clearDependentErrors();
    setValues((v) => ({
      ...v,
      // The address belongs to the bank it was typed for.
      bankAddress: "",
      bankName: selected?.bankName ?? "",
      bankSwiftCode: selected?.swiftCode ?? "",
      bankCode: selected?.bankCode ?? "",
    }));
  }

  function goToBankInfo() {
    const found = validateAccountHolder(values, accountType);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep("bank");
  }

  function goToReview() {
    const found = validateBankInfo(values, accountType);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep("review");
  }

  // One request at a time. A ref rather than the mutation's own pending flag:
  // that only flips after a re-render, and the confirmation's Yes button stays
  // clickable while the dialog fades out, so a quick second press would
  // otherwise send a second request (a second NetSuite update for
  // Reimbursement and Consultancy).
  const sending = useRef(false);

  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setConfirming(false);
    setSubmitError(undefined);
    try {
      await mutation.mutateAsync(
        buildCreateBankAccountRequestPayload(values, accountType, employeeEmail),
      );
      onSuccess();
    } catch (err) {
      setSubmitError(describeError(err));
    } finally {
      sending.current = false;
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{ACCOUNT_TYPE_LABEL[accountType]} bank account</DialogTitle>
      <DialogContent>
        <Stepper activeStep={stepIndex} sx={{ mb: 3 }}>
          {STEP_LABELS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === "holder" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Account Holder's Name"
              value={values.accountName}
              onChange={(e) => set("accountName", e.target.value)}
              error={Boolean(errors.accountName)}
              helperText={errors.accountName}
              fullWidth
            />
            <TextField
              label="Account Holder's Address"
              value={values.beneficiaryAddress}
              onChange={(e) => set("beneficiaryAddress", e.target.value)}
              error={Boolean(errors.beneficiaryAddress)}
              helperText={errors.beneficiaryAddress}
              fullWidth
            />
            {isConsultancy && (
              <TextField
                label="Account Holder's City"
                value={values.beneficiaryCity}
                onChange={(e) => set("beneficiaryCity", e.target.value)}
                error={Boolean(errors.beneficiaryCity)}
                helperText={errors.beneficiaryCity}
                fullWidth
                // aria-required rather than `required`: the field is required
                // for Consultancy, but `required` makes MUI append an asterisk
                // to the label, which this app's other required fields don't
                // carry either.
                slotProps={{ htmlInput: { "aria-required": true } }}
              />
            )}
            <Autocomplete
              options={allCountries}
              value={values.accountHolderCountry || null}
              onChange={(_, next) => set("accountHolderCountry", next ?? "")}
              renderInput={(p) => (
                <TextField
                  {...p}
                  label="Account Holder's Country"
                  error={Boolean(errors.accountHolderCountry)}
                  helperText={errors.accountHolderCountry}
                />
              )}
            />
            <TextField
              label="Account No"
              value={values.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              error={Boolean(errors.accountNumber)}
              helperText={errors.accountNumber}
              fullWidth
            />
            <Alert severity="warning">
              Please make sure to enter your address in the following format — Address P.O.Box or
              Street, City. Sample — No23, Galle road, Colombo.
            </Alert>
          </Box>
        )}

        {step === "bank" &&
          (banksQuery.isError ? (
            <ErrorNotice error={banksQuery.error} onRetry={() => banksQuery.refetch()}>
              Couldn&apos;t load the bank list.
            </ErrorNotice>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Autocomplete
                options={bankLocations}
                value={values.bankLocation || null}
                onChange={(_, next) => selectBankLocation(next ?? "")}
                renderInput={(p) => (
                  <TextField
                    {...p}
                    label="Bank Location"
                    error={Boolean(errors.bankLocation)}
                    helperText={errors.bankLocation}
                  />
                )}
              />
              <Autocomplete
                options={banksForLocation}
                loading={banksQuery.isLoading}
                getOptionLabel={(b) => `${b.bankName} (${b.swiftCode})`}
                value={banksForLocation.find((b) => b.bankName === values.bankName) ?? null}
                onChange={(_, next) => selectBank(next)}
                renderInput={(p) => (
                  <TextField
                    {...p}
                    label="Bank Name and Swift Code"
                    error={Boolean(errors.bankName || errors.bankSwiftCode)}
                    helperText={errors.bankName ?? errors.bankSwiftCode}
                  />
                )}
              />
              <TextField
                label="Bank Code"
                value={values.bankCode}
                error={Boolean(errors.bankCode)}
                helperText={errors.bankCode}
                fullWidth
                slotProps={{ input: { readOnly: true } }}
              />
              <TextField
                label="Bank Address"
                value={values.bankAddress}
                onChange={(e) => set("bankAddress", e.target.value)}
                error={Boolean(errors.bankAddress)}
                helperText={errors.bankAddress}
                fullWidth
              />
              {!isConsultancy && (
                <Box sx={{ display: "flex", gap: 2 }}>
                  <TextField
                    label="Branch Name"
                    value={values.branchName}
                    onChange={(e) => set("branchName", e.target.value)}
                    error={Boolean(errors.branchName)}
                    helperText={errors.branchName}
                    fullWidth
                  />
                  <TextField
                    label="Branch Code"
                    value={values.branchCode}
                    onChange={(e) => set("branchCode", e.target.value)}
                    error={Boolean(errors.branchCode)}
                    helperText={errors.branchCode}
                    fullWidth
                  />
                </Box>
              )}
            </Box>
          ))}

        {step === "review" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1 }}>
                Account Information
              </Typography>
              <ReviewRow label="Account Name" value={values.accountName} />
              <ReviewRow label="Account Number" value={values.accountNumber} />
              <ReviewRow label="Account Type" value={ACCOUNT_TYPE_LABEL[accountType]} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1 }}>
                Beneficiary Information
              </Typography>
              <ReviewRow label="Account Holder Address" value={values.beneficiaryAddress} />
              {isConsultancy && (
                <ReviewRow label="Account Holder City" value={values.beneficiaryCity.trim()} />
              )}
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1 }}>
                Bank Information
              </Typography>
              <ReviewRow label="Bank Name" value={values.bankName} />
              <ReviewRow label="Bank Location" value={values.bankLocation} />
              <ReviewRow label="Bank Swift Code" value={values.bankSwiftCode} />
              <ReviewRow label="Bank Code" value={values.bankCode} />
              <ReviewRow label="Bank Address" value={values.bankAddress} />
            </Box>
            {!isConsultancy && (
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1 }}>
                  Branch Information
                </Typography>
                <ReviewRow label="Branch Name" value={values.branchName} />
                <ReviewRow label="Branch Code" value={values.branchCode} />
              </Box>
            )}
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1 }}>
                Payment Information
              </Typography>
              <ReviewRow label="Payment Method" value="Bank Transfer" />
              <ReviewRow label="Effective From" value={todayIsoDate()} />
            </Box>
            {submitError && <Alert severity="error">{submitError}</Alert>}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {step !== "holder" && (
          <Button onClick={() => setStep(STEP_ORDER[stepIndex - 1])}>Back</Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        {step === "holder" && <Button variant="contained" onClick={goToBankInfo}>Continue</Button>}
        {step === "bank" && <Button variant="contained" onClick={goToReview}>Continue</Button>}
        {step === "review" && (
          <Button
            variant="contained"
            onClick={() => setConfirming(true)}
            disabled={mutation.isPending}
            loading={mutation.isPending}
          >
            Save
          </Button>
        )}
      </DialogActions>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Confirm Change Request</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to make this bank account change?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={mutation.isPending} loading={mutation.isPending}>
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showInvalidCountry} onClose={() => setInvalidCountryAcknowledged(true)}>
        <DialogTitle>Invalid Country</DialogTitle>
        <DialogContent>
          <Typography>Your country is not available in the bank locations.</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setInvalidCountryAcknowledged(true)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}
