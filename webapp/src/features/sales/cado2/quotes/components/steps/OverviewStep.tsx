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

import { useCallback, useState, type JSX, type ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Alert, AlertTitle, Box, Chip, DatePickers, MenuItem, Stack, TextField, Typography } from "@wso2/oxygen-ui";
import {
  useAccountContacts,
  useAccountOpportunities,
  useActiveLegalEntities,
  useCurrencies,
} from "@features/sales/cado2/quotes/api/useQuoteApi";
import type { Account, Opportunity } from "@features/sales/cado2/quotes/api/quoteTypes";
import {
  BriefcaseIcon,
  Building2Icon,
  CalendarDaysIcon,
  LandmarkIcon,
  RepeatIcon,
} from "@wso2/oxygen-ui-icons-react";
import {
  addressFrom,
  emptyAddress,
  emptyContact,
  formatDate,
  parseDateString,
  toDateString,
  type DraftFormValues,
} from "@features/sales/cado2/quotes/form/draftForm";
import SalesforceFindings, { type Finding } from "@features/sales/cado2/quotes/components/SalesforceFindings";
import { formatMoney } from "@features/sales/cado2/utils/money";
import AccountPicker from "@features/sales/cado2/quotes/components/pickers/AccountPicker";
import OpportunityPicker from "@features/sales/cado2/quotes/components/pickers/OpportunityPicker";
import SectionCard from "@features/sales/cado2/components/section-card/SectionCard";
import { expectedRenewalStart, renewalStartWarning } from "@features/sales/cado2/quotes/form/renewalStart";
import { useFieldIssue } from "@features/sales/cado2/quotes/components/fieldIssues";

const { DatePicker } = DatePickers;

interface OverviewStepProps {
  /** After the first save the account and opportunity are fixed (UI choice 3). */
  readonly locked: boolean;
}

/** The saved opportunity, when Salesforce no longer lists it (shown locked). */
function lockedOpportunity(id: string, name: string): Opportunity {
  return {
    id,
    name: name || id,
    stageName: null,
    closeDate: null,
    createdDate: null,
    currencyIsoCode: null,
    isWon: null,
    isClosed: null,
    directChannel: null,
    dealType: null,
    partner: null,
    recordTypeName: null,
    dealKind: "OTHER",
    arr: null,
  };
}

/** A step section: the app-wide section card with its fields stacked. */
function Section({
  title,
  icon,
  aside,
  children,
}: {
  title: string;
  icon: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SectionCard title={title} icon={icon} aside={aside}>
      <Stack spacing={2}>{children}</Stack>
    </SectionCard>
  );
}

const DEAL_KIND_LABEL = { FIRST_SALE: "First Sale", RENEWAL: "Renewal", EXPANSION: "Expansion" } as const;

/** Stage ②: what Salesforce has for the chosen account (the deal details belong to each opportunity). */
function accountFindings(
  account: { place: string; salesRegion: string; subRegion: string },
  opportunities: number,
  contacts: number,
): Finding[] {
  // No "Account" line: the chosen account is shown just above, more prominently.
  return [
    ...(account.place ? [{ key: "location", label: "Location", value: account.place }] : []),
    // Required to quote (D59).
    { key: "region", label: "Sales region", value: account.salesRegion || "Not set in Salesforce", warning: !account.salesRegion },
    // Informational: never blocks.
    { key: "subRegion", label: "Sub-region", value: account.subRegion || "Not set in Salesforce" },
    {
      key: "opportunities",
      label: "Open opportunities",
      value: opportunities ? `${opportunities} found, newest first` : "None found",
      warning: opportunities === 0,
    },
    { key: "contacts", label: "Contacts", value: contacts ? `${contacts} found` : "None found" },
  ];
}

/**
 * Stage ③: what Salesforce says about the chosen opportunity.
 * Problems only Salesforce can fix are warning lines here.
 */
function dealFindings(v: DraftFormValues, o: Opportunity | undefined): Finding[] {
  const out: Finding[] = [];
  if (v.dealKind === "OTHER") {
    out.push({
      key: "kind",
      label: "Deal kind",
      value: `${v.recordTypeName ? `“${v.recordTypeName}”` : "No record type"}: the approvals treat it as a First Sale`,
      warning: true,
    });
  } else if (v.dealKind) {
    out.push({ key: "kind", label: "Deal kind", value: DEAL_KIND_LABEL[v.dealKind] });
  }
  if (v.dealType === "DIRECT") {
    out.push({ key: "channel", label: "Channel", value: "Direct deal" });
  } else if (v.dealType === "PARTNER") {
    out.push(
      v.partner?.name
        ? { key: "channel", label: "Channel", value: `Partner-led · ${v.partner.name}${v.partner.role ? ` (${v.partner.role})` : ""}` }
        : { key: "channel", label: "Channel", value: "Partner-led, but no primary partner in Salesforce. Add it there.", warning: true },
    );
  } else {
    out.push({
      key: "channel",
      label: "Channel",
      value: "Salesforce doesn't say whether this is direct or partner-led (Direct_Channel__c). Set it on the opportunity.",
      warning: true,
    });
  }
  // The subscription it covers (2026-10-09), not its pipeline stage.
  if (o) {
    out.push({
      key: "subscription",
      label: "Subscription",
      value:
        o.subsStartDate && o.subsEndDate
          ? `${formatDate(o.subsStartDate)} – ${formatDate(o.subsEndDate)}`
          : o.subsStartDate
            ? `From ${formatDate(o.subsStartDate)}`
            : "No subscription dates in Salesforce",
    });
  }
  if (o?.arr !== null && o?.arr !== undefined) {
    out.push({ key: "arr", label: "ARR in Salesforce", value: `${o.currencyIsoCode ?? ""} ${formatMoney(o.arr.toFixed(2))}`.trim() });
  }
  return out;
}

/** Step ① Overview. */
export default function OverviewStep({ locked }: OverviewStepProps): JSX.Element {
  const { control, setValue, getValues } = useFormContext<DraftFormValues>();
  const [accountId, isRenewal, opportunityId] = useWatch({
    control,
    name: ["accountId", "isRenewal", "opportunityId"],
  });
  const values = useWatch({ control }) as DraftFormValues;
  // The rest of the step appears once Salesforce's findings for the deal are showing
  // (at once on a saved draft, whose account and opportunity are fixed).
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const markRevealed = useCallback(() => setRevealedFor(opportunityId), [opportunityId]);
  const showRest = Boolean(opportunityId) && (locked || revealedFor === opportunityId);

  // Open opportunities to quote (2026-10-09); a renewal renews closed-won ones.
  const opportunities = useAccountOpportunities(accountId || null);
  const wonOpportunities = useAccountOpportunities(isRenewal && accountId ? accountId : null, "won");
  const contacts = useAccountContacts(accountId || null);
  const legalEntities = useActiveLegalEntities();
  // For pre-filling the quote's currency from the opportunity.
  const currencies = useCurrencies();

  const oppIssue = useFieldIssue("sfOpportunityId");
  const startIssue = useFieldIssue("subscriptionStartDate");

  const accountAddress = useWatch({ control, name: "accountAddress" });
  const accountSalesRegion = useWatch({ control, name: "accountSalesRegion" });
  const accountSubRegion = useWatch({ control, name: "accountSubRegion" });

  const chooseAccount = (a: Account | null) => {
    setValue("accountId", a?.id ?? "", { shouldDirty: true });
    setValue("accountName", a?.name ?? "", { shouldDirty: true });
    setValue("accountAddress", a?.billingAddress ?? null, {
      shouldDirty: true,
    });
    setValue("accountSalesRegion", a?.salesRegion ?? "", { shouldDirty: true });
    setValue("accountSubRegion", a?.subRegion ?? "", { shouldDirty: true });
    // A different account invalidates everything taken from the old one.
    for (const f of ["opportunityId", "opportunityName"] as const) setValue(f, "", { shouldDirty: true });
    setValue("dealType", null, { shouldDirty: true });
    setValue("partner", null, { shouldDirty: true });
    setValue("dealKind", "", { shouldDirty: true });
    setValue("recordTypeName", "", { shouldDirty: true });
    setValue("isRenewal", false, { shouldDirty: true });
    setValue("previousOpportunityIds", [], { shouldDirty: true });
    for (const f of ["billingContact", "securityContact"] as const)
      setValue(f, { ...emptyContact }, { shouldDirty: true });
    setValue("billTo", { ...emptyAddress }, { shouldDirty: true });
    setValue("shipTo", { ...emptyAddress }, { shouldDirty: true });
  };

  const chooseOpportunity = (o: Opportunity | undefined) => {
    if (!o) return;
    setValue("opportunityId", o.id, { shouldDirty: true });
    setValue("opportunityName", o.name ?? "", { shouldDirty: true });
    setValue("dealType", o.dealType, { shouldDirty: true });
    setValue("partner", o.partner, { shouldDirty: true });
    // Salesforce decides whether this is a renewal.
    setValue("dealKind", o.dealKind, { shouldDirty: true });
    setValue("recordTypeName", o.recordTypeName ?? "", { shouldDirty: true });
    setValue("isRenewal", o.dealKind === "RENEWAL", { shouldDirty: true });
    if (o.dealKind !== "RENEWAL") setValue("previousOpportunityIds", [], { shouldDirty: true });
    // Pre-fill addresses: partner deals bill the partner and ship
    // to the customer; direct deals bill and ship to the customer.
    const v = getValues();
    const customer = addressFrom(v.accountId, v.accountName, v.accountAddress);
    // Currency and price book from the opportunity: its products all
    // come from one book. Only a currency CadO2 offers; Products & Pricing
    // drops a book with no active products in it, and says why.
    const offered = Boolean(o.currencyIsoCode && currencies.data?.includes(o.currencyIsoCode));
    setValue("currencyIsoCode", offered ? (o.currencyIsoCode ?? "") : "", { shouldDirty: true });
    setValue("defaultPricebookId", offered ? (o.pricebook?.id ?? "") : "", { shouldDirty: true });
    setValue("defaultPricebookName", offered ? (o.pricebook?.name ?? "") : "", { shouldDirty: true });
    if (o.dealType === "PARTNER" && o.partner?.id) {
      setValue("billTo", addressFrom(o.partner.id, o.partner.name ?? "", o.partner.billingAddress), {
        shouldDirty: true,
      });
      setValue("shipTo", customer, { shouldDirty: true });
      setValue("shipToSameAsBillTo", false, { shouldDirty: true });
    } else {
      setValue("billTo", customer, { shouldDirty: true });
      setValue("shipTo", { ...emptyAddress }, { shouldDirty: true });
      setValue("shipToSameAsBillTo", true, { shouldDirty: true });
    }
  };

  const previousOptions = (wonOpportunities.data ?? []).filter((o) => o.id !== opportunityId);

  // A renewal starts the day after the renewed opportunity ends (2026-10-09):
  // filled in when it is chosen; the AM may change it, with a warning.
  const [previousIds, startDate] = useWatch({ control, name: ["previousOpportunityIds", "startDate"] });
  const renewedOf = (ids: readonly string[]) => (wonOpportunities.data ?? []).filter((o) => ids.includes(o.id));
  const expectedStart = isRenewal ? expectedRenewalStart(renewedOf(previousIds)) : null;
  const renewedWithoutEnd = isRenewal ? renewedOf(previousIds).filter((o) => !o.subsEndDate) : [];
  const chooseRenewed = (ids: string[]) => {
    setValue("previousOpportunityIds", ids, { shouldDirty: true });
    const expected = expectedRenewalStart(renewedOf(ids));
    if (expected) setValue("startDate", expected.date, { shouldDirty: true });
  };

  // Watched, not read once: picking an account re-renders on its id before
  // the name is set, and a one-off read would show the old (empty) name.
  const accountName = useWatch({ control, name: "accountName" });
  const opportunityName = useWatch({ control, name: "opportunityName" });

  return (
    <Stack spacing={2.5}>
      <Section
        title="Customer & opportunity"
        icon={<Building2Icon size={18} />}
        aside={locked ? <Chip size="small" variant="outlined" label="Fixed after first save" /> : undefined}
      >
        {/* Account first; the opportunity list appears once it is chosen (F5 feedback). */}
        <AccountPicker
          chosenName={accountId ? accountName : ""}
          chosenPlace={[accountAddress?.city, accountAddress?.country].filter(Boolean).join(", ")}
          locked={locked}
          onChoose={chooseAccount}
        />
        {locked ? (
          <Typography variant="body2" color="text.secondary">
            The account and opportunity can&apos;t change after the first save. For a different opportunity, start a new
            quote.
          </Typography>
        ) : null}

        {accountId ? (
          <SalesforceFindings
            key={accountId}
            title="Found in Salesforce for this account"
            loading={opportunities.isPending || contacts.isPending}
            findings={accountFindings(
              {
                place: [accountAddress?.city, accountAddress?.country].filter(Boolean).join(", "),
                salesRegion: accountSalesRegion,
                subRegion: accountSubRegion,
              },
              (opportunities.data ?? []).length,
              (contacts.data ?? []).length,
            )}
            animate={!locked}
          />
        ) : null}

        {/* Approvals will route on the region (2026-10-07): the quote can't go on without it. */}
        {accountId && !accountSalesRegion ? (
          <Alert severity="error" role="alert">
            <AlertTitle>This account has no sales region in Salesforce</AlertTitle>
            CadO2 needs the account&apos;s Sales Region (<code>Sales_Regions__c</code>) to route approvals. Ask your
            Salesforce admin to set it on the account, then choose the account again
            {locked ? " (or save the draft to refresh it)" : ""}.
          </Alert>
        ) : null}

        {accountId && (locked || !opportunities.isPending) ? (
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <BriefcaseIcon size={16} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Opportunity
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Open ones, newest first
              </Typography>
            </Stack>
            <OpportunityPicker
              label="Opportunity"
              opportunities={
                locked && !(opportunities.data ?? []).some((o) => o.id === opportunityId)
                  ? [lockedOpportunity(opportunityId, opportunityName)]
                  : (opportunities.data ?? [])
              }
              loading={opportunities.isPending}
              selected={opportunityId ? [opportunityId] : []}
              onChange={([id]) => chooseOpportunity(opportunities.data?.find((o) => o.id === id))}
              locked={locked}
              error={oppIssue}
              emptyText="This account has no open opportunities in Salesforce."
            />
          </Box>
        ) : null}

        {opportunityId ? (
          <SalesforceFindings
            key={opportunityId}
            title="What Salesforce says about this deal"
            loading={!locked && opportunities.isPending}
            findings={dealFindings(values, opportunities.data?.find((o) => o.id === opportunityId))}
            animate={!locked}
            onDone={markRevealed}
          />
        ) : null}
      </Section>

      {/* Everything else waits for the account and the deal (2026-09-28). */}
      {showRest ? (
        <>
          {/* Salesforce says it's a renewal: which opportunities does it renew? */}
          {isRenewal ? (
            <Section title="Renewal" icon={<RepeatIcon size={18} />}>
              <Controller
                name="previousOpportunityIds"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Choose the closed-won opportunities this renews; several when co-terminated deals are consolidated. Their
                      ARR is compared with this quote&apos;s to check for a downsell, and the quote starts the day after they end.
                    </Typography>
                    <OpportunityPicker
                      label="Previous opportunities"
                      multiple
                      opportunities={previousOptions}
                      loading={wonOpportunities.isPending}
                      selected={field.value}
                      onChange={chooseRenewed}
                      emptyText="This account has no closed-won opportunities in Salesforce."
                    />
                  </Box>
                )}
              />
            </Section>
          ) : null}

          {/* The currency moved to Products & Pricing, next to the price book. */}
          <Section title="WSO2 legal entity" icon={<LandmarkIcon size={18} />}>
            <Controller
              name="legalEntityId"
              control={control}
              render={({ field }) => (
                <TextField {...field} select label="WSO2 legal entity" size="small" fullWidth required sx={{ maxWidth: 480 }}>
                  {(legalEntities.data ?? []).map((le) => (
                    <MenuItem key={le.id} value={String(le.id)}>
                      {le.name} ({le.country})
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Section>

          <Section title="Start date" icon={<CalendarDaysIcon size={18} />}>
            <Controller
              name="startDate"
              control={control}
              render={({ field }) => (
                <DatePicker
                  label="Start date"
                  value={parseDateString(field.value)}
                  onChange={(d: Date | null) => field.onChange(d && !Number.isNaN(d.getTime()) ? toDateString(d) : "")}
                  slotProps={{
                    textField: {
                      size: "small",
                      required: true,
                      error: Boolean(startIssue),
                      helperText:
                        startIssue ??
                        (expectedStart && field.value === expectedStart.date
                          ? `The day after ${expectedStart.fromName || "the renewed opportunity"} ends`
                          : "The subscription term is set with the products"),
                      sx: { maxWidth: 240 },
                    },
                  }}
                />
              )}
            />
            {/* The AM may start another day; it is pointed out, never blocked (2026-10-09). */}
            {expectedStart && startDate && startDate !== expectedStart.date ? (
              <Alert severity="warning" role="status">
                {renewalStartWarning(startDate, expectedStart)}. Deal Desk will see this.
              </Alert>
            ) : null}
            {renewedWithoutEnd.length ? (
              <Alert severity="info" variant="outlined">
                {renewedWithoutEnd.map((o) => o.name ?? o.id).join(", ")} {renewedWithoutEnd.length === 1 ? "has" : "have"} no
                subscription end date in Salesforce (<code>Subs_End_Date__c</code>), so the start date can&apos;t be
                worked out from {renewedWithoutEnd.length === 1 ? "it" : "them"}. Choose it.
              </Alert>
            ) : null}
          </Section>
        </>
      ) : null}

    </Stack>
  );
}
