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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The expense app is behind a preview flag, so the registry is no longer a
 * constant — it depends on `window.config`. Everything here therefore imports
 * it fresh per state rather than at the top of the file.
 */
type FinanceApps = typeof import("./financeApps");

async function load(preview: { expenseSubmitter?: boolean } = {}): Promise<FinanceApps> {
  vi.resetModules();
  window.config = {
    ...(window.config ?? {}),
    ONE_WSO2_PREVIEW_FEATURES: preview,
  } as Window["config"];
  return import("./financeApps");
}

const originalConfig = window.config;
beforeEach(() => vi.resetModules());
afterEach(() => {
  window.config = originalConfig;
});

// Which perspective an app belongs to is a decision, and nothing used to record
// it — the apps simply appeared wherever the registry happened to be spread.

const keys = (apps: readonly { key: string }[]) => apps.map((a) => a.key);
const paths = (apps: readonly { items: readonly { path?: string }[] }[]) =>
  apps.flatMap((a) => a.items.map((i) => i.path ?? ""));

describe("where each finance app lives", () => {
  // Everyone files claims. Not everyone has a corporate card, which is why the
  // card app is not part of the set every employee needs.
  //
  // "expense" is a deliberate exception to "each app lives in exactly one
  // place": its New Claim route under Finance renders a submitter page for the
  // same claims "claims" → Expense under Me files — a second door onto the same
  // room, not a fork. It is behind a preview flag until the two doors are
  // reconciled, so every assertion below states which state it is describing.
  it("keeps claims with the person, and the card app with finance", async () => {
    const { ME_FINANCE_APPS, FINANCE_PERSPECTIVE_APPS } = await load();
    expect(keys(ME_FINANCE_APPS)).toEqual(["claims"]);
    expect(keys(FINANCE_PERSPECTIVE_APPS)).toEqual(["cc"]);
  });

  it("adds the expense app to finance only when the preview flag is on", async () => {
    const off = await load({ expenseSubmitter: false });
    expect(keys(off.FINANCE_PERSPECTIVE_APPS)).toEqual(["cc"]);

    const on = await load({ expenseSubmitter: true });
    expect(keys(on.FINANCE_PERSPECTIVE_APPS)).toEqual(["expense", "cc"]);
  });

  it("is hidden by an absent flag, not only by an explicit false", async () => {
    // Production ships no entry at all; safety must not depend on remembering
    // to write `false`.
    const { FINANCE_PERSPECTIVE_APPS } = await load();
    expect(keys(FINANCE_PERSPECTIVE_APPS)).not.toContain("expense");
  });

  it("puts every app KEY in exactly one of the two", async () => {
    for (const preview of [{}, { expenseSubmitter: true }]) {
      const { FINANCE_APPS, ME_FINANCE_APPS, FINANCE_PERSPECTIVE_APPS } = await load(preview);
      const overlap = keys(ME_FINANCE_APPS).filter((k) =>
        keys(FINANCE_PERSPECTIVE_APPS).includes(k),
      );
      expect(overlap).toEqual([]);
      expect(keys(FINANCE_APPS)).toContain("claims");
      expect(keys(FINANCE_APPS)).toContain("cc");
    }
  });

  // A path under the wrong perspective is a rail entry that navigates out of
  // the perspective it was clicked in.
  it("gives each app paths under the perspective it is surfaced in", async () => {
    for (const preview of [{}, { expenseSubmitter: true }]) {
      const { ME_FINANCE_APPS, FINANCE_PERSPECTIVE_APPS } = await load(preview);
      for (const path of paths(ME_FINANCE_APPS)) expect(path.startsWith("/me/")).toBe(true);
      for (const path of paths(FINANCE_PERSPECTIVE_APPS)) {
        expect(path.startsWith("/finance/")).toBe(true);
      }
    }
  });

  it("routes every finance item through the finance gate, in both states", async () => {
    for (const preview of [{}, { expenseSubmitter: true }]) {
      const { FINANCE_APPS, FINANCE_ITEM_IDS } = await load(preview);
      for (const app of FINANCE_APPS) {
        for (const item of app.items) {
          expect(FINANCE_ITEM_IDS.has(item.id), `${item.id} bypasses the gate`).toBe(true);
        }
      }
    }
  });

  // Hiding the entry must not take the whole app down: FINANCE_EYEBROW is built
  // at module load by looking apps up in the registry, and an absent app used to
  // throw there before anything rendered.
  it("still builds its eyebrows when the expense app is hidden", async () => {
    const { FINANCE_EYEBROW } = await load();
    expect(FINANCE_EYEBROW.claims.label).toBeTruthy();
    expect(FINANCE_EYEBROW.cc.label).toBeTruthy();
    expect(FINANCE_EYEBROW.expense.label).toBeTruthy();
  });
});
