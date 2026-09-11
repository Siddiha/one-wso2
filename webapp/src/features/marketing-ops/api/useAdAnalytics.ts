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

// Ad Campaigns → Analytics data layer.
//
// This replaces Marketing Ops' 282-line AdAnalyticsContext, which hand-rolled
// everything TanStack Query already does:
//
//   three Map caches keyed by selection      → query keys
//   `latestDashKey` refs to discard results  → React Query ignores results from
//     from superseded requests                 superseded queries by construction
//   per-slice isLoading/error useState        → query state
//   "don't cache failures"                   → errors are never cached as data
//   refresh() that bypasses the cache        → refetch()
//
// One behaviour is deliberately NOT carried over: the original mirrored results
// to `sessionStorage` so a full page reload restored the last view. React Query's
// cache already survives in-app navigation, which is the case that actually
// mattered ("leave the operation and come back"), and persisting whole reports —
// which include lead names and company names in the campaign-in-focus block — to
// sessionStorage is worse for a page that renders PII. Dropped on purpose.
//
// ⚠️ These endpoints are POSTs that are semantically READS: each takes a report
// config in the body and computes the answer live from Google Ads / LinkedIn /
// Salesforce. Nothing is written. So they belong in useQuery, not useMutation —
// mutations would give up caching, dedupe, and the auto-run-on-selection-change
// behaviour the UI is built around.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAsgardeo } from "@asgardeo/react";
import { authedGet, authedPost, HttpError } from "@api/http";
import { httpRetry } from "@api/errors";
import { useAccessToken } from "@hooks/useAccessToken";
import {
  isMarketingOpsBackendConfigured,
  marketingOpsServiceUrls,
} from "@config/apiConfig";
import type {
  AdPlatform,
  Dashboard,
  DateWindow,
  GroupByDim,
  LinkedInRoiConfig,
  LinkedInRoiReport,
  RoiConfigBody,
  RoiOptions,
  RoiReport,
} from "../ad-campaigns/analytics/adAnalyticsTypes";

// Campaign ROI is the ad-spend ↔ Salesforce join keyed on utm_campaign. Google
// ads carry that value in their destination URL; LinkedIn ads don't expose one,
// so there is nothing to attribute a LinkedIn lead back to a campaign by.
// LinkedIn gets its own BU-first report instead.
export const roiSupported = (p: AdPlatform): boolean => p === "google";

// A custom range is only fetchable once both ends are filled in. Firing on a
// half-picked range would run a report the user never asked for — and these runs
// are expensive (live Google Ads + Salesforce queries).
export const windowReady = (w: DateWindow): boolean =>
  w.mode !== "custom" || Boolean(w.start && w.end);

// ---- config builders -------------------------------------------------------
//
// The three reports take different config shapes but share the date window.
// Internal @wso2.com leads are always excluded — that was a toggle in Marketing
// Ops and is now simply the behaviour, so it isn't a parameter here.

const EXCLUDE_INTERNAL = true;

function dashboardConfig(platform: AdPlatform, window: DateWindow) {
  return { platform, window, exclude_internal_emails: EXCLUDE_INTERNAL };
}

function roiConfig(
  window: DateWindow,
  groupBy: GroupByDim,
  secondGroupBy: GroupByDim | null,
  regionFilter: string[],
  productFilter: string[],
): RoiConfigBody {
  return {
    name: "Ad-hoc report",
    window,
    group_by: secondGroupBy ? [groupBy, secondGroupBy] : [groupBy],
    value_metric: { basis: "product_matched_arr", opp_scope: ["open_pipeline", "closed_won"] },
    funnel_stages: ["lead", "mql", "sal", "sql", "opportunity", "closed_won"],
    filters: { lead_source_details: [], regions: regionFilter, products: productFilter },
    exclude_internal_emails: EXCLUDE_INTERNAL,
  };
}

function linkedInRoiConfig(window: DateWindow): LinkedInRoiConfig {
  return {
    name: "Ad-hoc LinkedIn ROI",
    window,
    value_metric: { basis: "product_matched_arr", opp_scope: ["open_pipeline", "closed_won"] },
    exclude_internal_emails: EXCLUDE_INTERNAL,
  };
}

// ---- shared query plumbing -------------------------------------------------

// These runs hit live Google Ads / LinkedIn / Salesforce APIs and take seconds,
// so results stay fresh for 5 minutes and survive 30 minutes in cache. Revisiting
// a window you already looked at is then instant, and the explicit Refresh button
// (refetch) is how you ask for newer numbers.
const RUN_STALE_MS = 5 * 60 * 1000;
const RUN_GC_MS = 30 * 60 * 1000;

// A report body that answers 200 with status:"failed" is a failure, not data.
// Throwing turns it into the query's error state so every caller's error path
// handles both transport failures and backend-reported ones the same way —
// and, importantly, React Query then won't cache it as a successful result.
function throwIfReportFailed<T extends { status: string; error_message: string | null }>(
  report: T,
  url: string,
  fallback: string,
): T {
  if (report.status === "failed") {
    throw new HttpError(url, 200, JSON.stringify({ message: report.error_message || fallback }));
  }
  return report;
}

// POST-as-read: the config is the cache key, so it's serialised into queryKey.
function usePostReport<TBody, TResult>(
  key: readonly unknown[],
  url: string,
  body: TBody,
  enabled: boolean,
  transform?: (r: TResult) => TResult,
): UseQueryResult<TResult, Error> {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  return useQuery<TResult>({
    queryKey: key,
    enabled: enabled && isSignedIn && isMarketingOpsBackendConfigured(),
    queryFn: async () => {
      const result = await authedPost<TResult>(url, await getAccessToken(), body);
      // authedPost returns null on an empty 2xx body. These endpoints always
      // return a document, so an empty body is a broken response, not "no data".
      if (result == null) throw new HttpError(url, 200, "");
      return transform ? transform(result) : result;
    },
    staleTime: RUN_STALE_MS,
    gcTime: RUN_GC_MS,
    retry: httpRetry,
  });
}

// ---- the three reports -----------------------------------------------------

// POST /dashboard/run — the deck-style dashboard. Google gets the full
// UTM-joined view; LinkedIn is performance-only (meta.performance_only).
export function useAdDashboard(platform: AdPlatform, window: DateWindow) {
  return usePostReport<ReturnType<typeof dashboardConfig>, Dashboard>(
    ["marketing-ops", "ad-analytics", "dashboard", platform, window],
    marketingOpsServiceUrls.adAnalyticsDashboardRun,
    dashboardConfig(platform, window),
    windowReady(window),
  );
}

// POST /roi/run — the Google UTM ↔ Salesforce join. Not fetched for LinkedIn.
// `groupBy`/`secondGroupBy`/the region+product filters are all part of the key,
// so changing any of them re-runs only this report and leaves the dashboard
// alone. Region/product filters are sets, not sequences — sort them so a
// re-order of the same selection doesn't look like a different key (or refetch).
export function useRoiReport(
  platform: AdPlatform,
  window: DateWindow,
  groupBy: GroupByDim,
  secondGroupBy: GroupByDim | null = null,
  regionFilter: string[] = [],
  productFilter: string[] = [],
) {
  const url = marketingOpsServiceUrls.adAnalyticsRoiRun;
  return usePostReport<{ config: RoiConfigBody }, RoiReport>(
    [
      "marketing-ops",
      "ad-analytics",
      "roi",
      window,
      groupBy,
      secondGroupBy,
      [...regionFilter].sort(),
      [...productFilter].sort(),
    ],
    url,
    { config: roiConfig(window, groupBy, secondGroupBy, regionFilter, productFilter) },
    roiSupported(platform) && windowReady(window),
    (r) => throwIfReportFailed(r, url, "Report generation failed"),
  );
}

// POST /linkedin-roi/run — the BU-first LinkedIn report. Only fetched for
// LinkedIn. Its key omits platform (always LinkedIn) and groupBy (BU-first, so
// there is no breakdown selector).
export function useLinkedInRoiReport(platform: AdPlatform, window: DateWindow) {
  const url = marketingOpsServiceUrls.adAnalyticsLinkedInRoiRun;
  return usePostReport<{ config: LinkedInRoiConfig }, LinkedInRoiReport>(
    ["marketing-ops", "ad-analytics", "linkedin-roi", window],
    url,
    { config: linkedInRoiConfig(window) },
    platform === "linkedin" && windowReady(window),
    (r) => throwIfReportFailed(r, url, "Report generation failed"),
  );
}

// GET /roi/options — selector options (regions/products actually present in the
// data) for the ROI tab's Business unit / Region multi-select filters.
export function useRoiOptions(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  return useQuery<RoiOptions>({
    queryKey: ["marketing-ops", "ad-analytics", "roi-options"],
    enabled: enabled && isSignedIn && isMarketingOpsBackendConfigured(),
    queryFn: async () =>
      authedGet<RoiOptions>(marketingOpsServiceUrls.adAnalyticsRoiOptions, await getAccessToken()),
    // The lead-source picklist is cached per-process on the backend and changes
    // rarely, so this can sit for the session.
    staleTime: 30 * 60 * 1000,
    retry: httpRetry,
  });
}
