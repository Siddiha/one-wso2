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

import type { JSX } from "react";
import { Stack, Typography } from "@wso2/oxygen-ui";
import { LandmarkIcon } from "@wso2/oxygen-ui-icons-react";
import { formatDate } from "@features/sales/cado2/quotes/form/draftForm";
import { renewalStartWarning } from "@features/sales/cado2/quotes/form/renewalStart";
import { termLabel, type QuoteSheet } from "@features/sales/cado2/quotes/sheet/sheetModel";
import SheetCard, { Fact, FactGrid } from "@features/sales/cado2/components/section-card/SectionCard";

const BILLING = { ANNUAL: "Annually in advance", UPFRONT: "Upfront, whole term" };

/** The term fact: its dates and mode, or the start date alone for services only. */
function termFact(sheet: QuoteSheet): { label: string; value: string; hint: string } {
  if (!sheet.recurring) {
    return { label: "Start date", value: sheet.startDate ? formatDate(sheet.startDate) : "", hint: "No subscription term: services only" };
  }
  return {
    label: "Subscription term",
    value: sheet.startDate && sheet.endDate ? `${formatDate(sheet.startDate)} – ${formatDate(sheet.endDate)}` : "",
    hint: termLabel(sheet),
  };
}

/** Who sells, for how long, and how it is billed. */
export default function DealSection({ sheet }: { sheet: QuoteSheet }): JSX.Element {
  const term = termFact(sheet);
  return (
    <SheetCard title="Deal" icon={<LandmarkIcon size={18} />}>
      <FactGrid>
        <Fact
          label="Deal type"
          value={sheet.dealType === "PARTNER" ? "Partner deal" : sheet.dealType === "DIRECT" ? "Direct deal" : "Unknown"}
          hint={sheet.dealType ? undefined : "Salesforce has no Direct / Partner value"}
        />
        <Fact label="Sales region" value={sheet.salesRegion || "Not set in Salesforce"} />
        <Fact label="Sub-region" value={sheet.subRegion || "Not set"} />
        <Fact label="WSO2 legal entity" value={sheet.legalEntity?.name} hint={sheet.legalEntity?.address} />
        <Fact label={term.label} value={term.value} hint={term.hint} />
        {sheet.recurring ? <Fact label="Billing" value={sheet.billingFrequency ? BILLING[sheet.billingFrequency] : ""} /> : null}
        <Fact label="Currency" value={sheet.currency} />
        {sheet.pricebookName ? (
          <Fact label="Price book" value={sheet.pricebookName} hint="The Salesforce opportunity's; every line is priced from it" />
        ) : null}
        {sheet.isRenewal ? (
          <Fact
            label="Renews"
            value={
              sheet.previousOpportunities.length ? (
                <Stack spacing={0.25}>
                  {sheet.previousOpportunities.map((n) => (
                    <Typography key={n} variant="body2" sx={{ fontWeight: 500 }}>
                      {n}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                `${sheet.previousOpportunityCount} previous opportunit${sheet.previousOpportunityCount === 1 ? "y" : "ies"}`
              )
            }
            hint={
              sheet.renewalStart?.differs && sheet.startDate ? (
                <Typography variant="caption" color="warning.main">
                  ⚠ {renewalStartWarning(sheet.startDate, sheet.renewalStart)}
                </Typography>
              ) : sheet.renewalStart ? (
                `Starts the day after ${sheet.renewalStart.fromName || "it"} ends`
              ) : (
                "Previous ARR not available yet"
              )
            }
          />
        ) : null}
        <Fact label="Pricing rules" value={sheet.pricingRulesVersion} />
      </FactGrid>
    </SheetCard>
  );
}
