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

// The subscription an opportunity covers (Subs_Start_Date__c /
// Subs_End_Date__c), worded once for every place that shows it.

import { formatDate } from "@features/sales/cado2/quotes/form/draftForm";

interface SubscriptionDates {
  readonly subsStartDate?: string | null;
  readonly subsEndDate?: string | null;
}

export const NO_SUBSCRIPTION_DATES = "No subscription dates in Salesforce";

/**
 * The period on its own: "1 Feb 2027 – 31 Jan 2028", "From 1 Feb 2027",
 * "Until 31 Jan 2028", or "No subscription dates in Salesforce".
 */
export function subscriptionPeriod(o: SubscriptionDates): string {
  const { subsStartDate: start, subsEndDate: end } = o;
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return `From ${formatDate(start)}`;
  if (end) return `Until ${formatDate(end)}`;
  return NO_SUBSCRIPTION_DATES;
}

/**
 * As a line under an opportunity's name: "Subscription 1 Feb 2027 – 31 Jan
 * 2028", "Subscription until 31 Jan 2028", or "No subscription dates in
 * Salesforce". Null when the dates aren't known at all (an opportunity
 * Salesforce no longer lists), as opposed to Salesforce having none.
 */
export function subscriptionLine(o: SubscriptionDates): string | null {
  if (o.subsStartDate === undefined && o.subsEndDate === undefined) return null;
  const period = subscriptionPeriod(o);
  if (period === NO_SUBSCRIPTION_DATES) return period;
  return `Subscription ${o.subsStartDate && o.subsEndDate ? period : period.charAt(0).toLowerCase() + period.slice(1)}`;
}
