/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { describe, expect, it } from "vitest";
import {
  FINANCE_APPS,
  FINANCE_ITEM_IDS,
  FINANCE_PERSPECTIVE_APPS,
  ME_FINANCE_APPS,
} from "./financeApps";
import { PERSPECTIVES } from "./perspectives";

// Which perspective an app belongs to is a decision, and nothing used to record
// it — the apps simply appeared wherever the registry happened to be spread.

const keys = (apps: readonly { key: string }[]) => apps.map((a) => a.key);
const paths = (apps: readonly { items: readonly { path?: string }[] }[]) =>
  apps.flatMap((a) => a.items.map((i) => i.path ?? ""));

describe("where each finance app lives", () => {
  // Everyone files claims. Not everyone has a corporate card, which is why the
  // card app is not part of the set every employee needs.
  //
  // "expense" covers the same ground as "claims" → Expense under Me, but with
  // its own screens (expense/submitter, expense/history) rather than the Me
  // ones — the Finance side can file for another employee, which the Me side
  // cannot. It keeps its own registry key, distinct from "claims", which is
  // what the other invariants below actually depend on.
  it("keeps claims with the person, and both the card and expense claims with finance", () => {
    expect(keys(ME_FINANCE_APPS)).toEqual(["claims"]);
    expect(keys(FINANCE_PERSPECTIVE_APPS)).toEqual(["expense", "cc"]);
  });

  it("puts every app KEY in exactly one of the two", () => {
    expect(keys(FINANCE_APPS).sort()).toEqual(["cc", "claims", "expense"]);
    const overlap = keys(ME_FINANCE_APPS).filter((k) => keys(FINANCE_PERSPECTIVE_APPS).includes(k));
    expect(overlap).toEqual([]);
  });

  // A path under the wrong perspective is a rail entry that navigates out of
  // the perspective it was clicked in.
  it("gives each app paths under the perspective it is surfaced in", () => {
    for (const path of paths(ME_FINANCE_APPS)) expect(path.startsWith("/me/")).toBe(true);
    for (const path of paths(FINANCE_PERSPECTIVE_APPS)) {
      expect(path.startsWith("/finance/")).toBe(true);
    }
  });

  // Moving an app means it leaves where it was. Registering it in both places
  // would show it twice with two sets of URLs, and only one set has routes.
  it("takes the card app out of Me, not just adds it to Finance", () => {
    const me = PERSPECTIVES.find((p) => p.key === "me");
    const meSectionIds = (me?.sections ?? []).map((s) => s.id);
    for (const app of FINANCE_PERSPECTIVE_APPS) {
      expect(meSectionIds, `${app.key} is still under Me`).not.toContain(`sec-app-${app.key}`);
    }
    // ...and the one that stayed is still there.
    for (const app of ME_FINANCE_APPS) {
      expect(meSectionIds).toContain(`sec-app-${app.key}`);
    }
  });

  it("routes every finance item through the finance gate", () => {
    for (const app of FINANCE_APPS) {
      for (const item of app.items) {
        expect(FINANCE_ITEM_IDS.has(item.id), `${item.id} bypasses the gate`).toBe(true);
      }
    }
  });

  // The rail renders the Finance perspective's own sections; an app registered
  // for it that never reaches those sections would simply not appear.
  it("surfaces the finance-perspective apps in that perspective", () => {
    const finance = PERSPECTIVES.find((p) => p.key === "finance");
    const sectionIds = (finance?.sections ?? []).map((s) => s.id);
    // And the reverse: an app under Me must not also appear here.
    for (const app of ME_FINANCE_APPS) {
      expect(sectionIds).not.toContain(`sec-app-${app.key}`);
    }
    // `appsToSections` prefixes the section id — the app key alone is not what
    // ends up in the rail.
    for (const app of FINANCE_PERSPECTIVE_APPS) {
      expect(sectionIds, `${app.key} is registered but not surfaced`).toContain(
        `sec-app-${app.key}`,
      );
    }
  });
});
