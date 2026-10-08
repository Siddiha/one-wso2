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

/**
 * Features that are built and merged but not yet released.
 *
 * The same bundle ships everywhere and `public/config.js` differs per
 * deployment, so a feature can be live in stage and hidden in prod without
 * branching the build or holding work out of `main`.
 *
 * ```js
 * ONE_WSO2_PREVIEW_FEATURES: { umt: true },
 * ```
 *
 * ## Absent means off
 *
 * A feature nobody has listed is hidden. Prod is safe because nobody touched
 * its config, not because someone remembered to write `false` — the failure
 * mode of the opposite default is a half-finished screen appearing in
 * production on the day it merges.
 *
 * ## This is not the `is*Configured()` contract
 *
 * `apiConfig.ts` hides things when a backend URL is empty, which means *"not
 * wired up"*. This means *"wired up, but not for you yet"*. The two look alike
 * and answer different questions: if a preview feature's backend is also
 * missing, both apply and either one hiding it is correct.
 *
 * ## Delete the gate when the feature ships
 *
 * Every entry names the release it is waiting on. A set that only grows stops
 * describing anything — it becomes the list of things nobody cleaned up, and
 * then no one can say what production actually has. Removing a flag is part of
 * shipping the feature, not a follow-up.
 */

/**
 * Every gated feature. A union, not a string, so a typo is a compile error
 * rather than a feature that is silently never enabled anywhere.
 */
export type PreviewFeature =
  /**
   * Engineering → UMT, the whole app — its rail group and every route under
   * `/engineering/umt`. Engineering itself is shipped; this flag only hides
   * UMT. Held back as a whole, the same way Finance MIS is inside Finance.
   * `useUmtGate`'s own role check against the UMT backend is unrelated and
   * keeps working the same regardless of this flag.
   */
  | "umt"
  /* The whole Infra Portal perspective. Still being ported, so the waffle
   * tile, landing option, and `/infra` route stay hidden until this is on.
   */
  | "infra"
  /**
   * Every promotion-app screen: the Me → Promotion route/rail item, and
   * the whole "Promotion" group under People Ops (Lead Portal, Team
   * Promotion History, Functional Lead Portal, Promotion Board Portal,
   * Admin Portal, Promotion Cycle History) — rail entries and routes
   * alike. Unlike infra this isn't a whole perspective; it's a set of
   * items nested inside Me and People Ops, gated the same way so the
   * feature can ship to `main` without going live in production before
   * it's ready.
   */
  | "promotion"
  /**
   * Finance → Finance MIS — the ARR, QRR and MRR Builds and ARR Analysis,
   * rail entries and routes alike. Held back as a whole until Finance has
   * verified its figures. `useMisGate`'s own privilege check is unrelated and
   * keeps working the same either way.
   */
  | "mis"
  /**
   * Marketing Ops → Event Platform, the whole app — its rail group and every
   * route under `/marketing-ops/event-platform`. Held back as a whole, the
   * same way Finance MIS is: the port lands screen by screen, and what must
   * stay preview-only is the app's presence, not one route inside it. Its own
   * backend roles (`eventplatform`, `eventplatform-shop`) still decide who
   * sees what once this is on. See docs/ported-apps/event-platform.md.
   */
  | "eventPlatform"
  /**
   * Sales → CadO2, the whole quote tool: its rail group (My Quotes, My
   * Approvals, Admin), every route under `/sales/cado2`, and its backend
   * calls. Held back as a whole until every screen is in place. CadO2's own
   * `/me` roles still decide who sees which item once this is on. See
   * docs/ported-apps/cado2.md.
   */
  | "cado2"
  /**
   * Legal → NDA, the PDF generator — its rail entry and the `/legal/nda`
   * route. Held back until it is ready for production. Due Diligence, the
   * rest of the Legal perspective, is unaffected.
   */
  | "nda"
  /**
   * The whole Knowledge Base perspective — waffle tile, rail, and the
   * `/knowledge-base` route, currently just Today I Learned. Waiting on
   * til-backend's first real Choreo deployment and the Google Chat App's
   * Space/Dialog registration (outside this codebase) before going live.
   */
  | "til";

/**
 * Whether a preview feature should be shown.
 *
 * Read per call rather than captured at module load: the registries that ask
 * are themselves module-level constants, and a test that flips the flag needs
 * the answer to change without reimporting half the app.
 */
export function isPreviewEnabled(feature: PreviewFeature): boolean {
  return window.config?.ONE_WSO2_PREVIEW_FEATURES?.[feature] === true;
}
