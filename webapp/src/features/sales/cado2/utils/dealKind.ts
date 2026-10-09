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

import type { Opportunity } from "@features/sales/cado2/quotes/api/quoteTypes";

const KIND_LABEL = { FIRST_SALE: "First Sale", RENEWAL: "Renewal", EXPANSION: "Expansion" } as const;

/**
 * What a deal is, from its Salesforce record type (2026-10-09): First Sale,
 * Renewal or Expansion; any other record type shows its own name, e.g.
 * "Free Trial". Null when Salesforce has none.
 */
export function dealKindLabel(o: Pick<Opportunity, "dealKind" | "recordTypeName">): string | null {
  return o.dealKind === "OTHER" ? o.recordTypeName : KIND_LABEL[o.dealKind];
}
