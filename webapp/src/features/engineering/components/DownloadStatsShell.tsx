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

import type { JSX, ReactNode } from "react";
import { Alert, Box, CircularProgress, Stack, Typography } from "@wso2/oxygen-ui";
import ErrorNotice from "@components/error-notice/ErrorNotice";
import PerspectiveHeader from "@components/perspective-header/PerspectiveHeader";
import RoutedTabs, { type RoutedTabDef } from "@components/routed-tabs/RoutedTabs";
import {
  DOWNLOAD_STATS_APPS,
  DOWNLOAD_STATS_DESCRIPTION,
  DOWNLOAD_STATS_HEADING,
  DOWNLOAD_STATS_PATH,
  DOWNLOAD_STATS_SCREENS,
  ENGINEERING_ADMIN_ITEM_ID,
  type DownloadStatsScreen,
} from "@constants/downloadStatsApps";
import { useEngineeringAdminGate } from "../api/engineeringAdminVisibility";
import {
  isCredentialedProductDownloadStatsUrl,
  isProductDownloadStatsConfigured,
  productDownloadStatsBackendUrl,
} from "../api/productDownloadStats";

// Shared page frame for every Download Stats screen. The title above the tab
// bar is the product name, and one sentence sits under that title on every
// screen, the way Banking does. The tab bar names the screen. A
// screen's own name is a heading only while its tab is hidden (Admin, until
// the API has said the caller is an Admin). The shell exists so ONE place owns every
// degraded state and no screen has to remember them (MisShell is the
// precedent). The ladder, in order:
//
//   1. API address not set         → say which config key is missing; ask nothing
//   2. address is http, not local  → refuse to put the token on the wire
//   3. Admin check still in flight → spinner, never a premature denial
//   4. Admin check failed          → an error with Retry, NOT a denial
//   5. the API says not an Admin   → say what Admin is for and who to ask
//   6. the screen
//
// Rungs 3–5 are Admin's alone: the other five screens are open to every
// signed-in employee. The user-info read still runs on those screens, because
// the Admin tab is absent until that read says the caller is an Admin. Rungs
// 4 and 5 stay distinct deliberately — both leave the client holding no
// answer, and collapsing them tells someone whose gateway timed out that they
// lack a role they already have.
//
// ---- how a screen uses it -------------------------------------------------
//
// A page is a thin wrapper, `<DownloadStatsShell screen="downloads">` around
// a body component, and the body holds every query hook. That is load-bearing
// rather than tidy: `children` is mounted only on the last rung, so a body
// inside the shell cannot send a request while the API address is unset or
// the reader is being refused. The heading is the product name. The rail, a
// pin and the launcher keep the shorter registry name. The sentence under
// the heading is the one shared description, not a per-screen label.
//
// `actions` (a button beside the description, as Admin's "Add tracked repository")
// belongs to the screen, so it appears on the last rung only: a refused reader
// is not offered an action on a screen they cannot open.

// Tab order is the registry order. Admin is last, and only present once the
// API has said the caller is an Admin — the same rule the rail used when
// these screens were rows.
function screenTabs(showAdmin: boolean): RoutedTabDef[] {
  return DOWNLOAD_STATS_APPS.flatMap((app) => app.items)
    .filter((item) => showAdmin || item.id !== ENGINEERING_ADMIN_ITEM_ID)
    .flatMap((item) => {
      const segment = item.path?.slice(DOWNLOAD_STATS_PATH.length + 1);
      return segment ? [{ segment, label: item.label }] : [];
    });
}

export default function DownloadStatsShell({
  screen,
  actions,
  children,
}: {
  screen: DownloadStatsScreen;
  actions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const { id, label: title } = DOWNLOAD_STATS_SCREENS[screen];
  const base = productDownloadStatsBackendUrl();
  const configured = isProductDownloadStatsConfigured();
  // https, or http on localhost alone — see productDownloadStats.ts.
  const credentialed = isCredentialedProductDownloadStatsUrl(base);
  // Asked on every screen, not only Admin: the tab is hidden until the answer
  // is yes, including while the check is in flight and when it fails. The rail
  // asks the same question under the same query key, so a reader who came
  // through the rail is not asked twice. The ladder below still belongs to
  // the Admin screen alone.
  const requiresAdmin = id === ENGINEERING_ADMIN_ITEM_ID;
  const reachable = configured && credentialed;
  const gate = useEngineeringAdminGate(reachable);
  // A failed re-check keeps the previous answer in the query. The tab follows
  // the latest check, so a failure or a 403 takes it down even when that
  // answer was yes.
  const showAdminTab = gate.isAdmin && !gate.isResolving && !gate.isError && !gate.isForbidden;
  // The selected tab already says the screen's name. Repeat it as a heading
  // only while that tab is absent, which is Admin until the check says yes.
  const namedByTab = !requiresAdmin || showAdminTab;

  // Each of these mirrors one rung below, and every earlier rung is excluded
  // from the later ones — or someone whose check is still in flight, or whose
  // backend is not even configured, reads as refused for one render.
  const checking = reachable && requiresAdmin && gate.isResolving;
  const failed = reachable && requiresAdmin && !checking && gate.isError;
  // The API answers "no" with a 403 as well as with `isAdmin: false`; both are
  // answers, not failed checks.
  const denied =
    reachable && requiresAdmin && !checking && !failed && (gate.isForbidden || !gate.isAdmin);
  const allowed = reachable && (!requiresAdmin || (!checking && !failed && !denied));

  return (
    // minWidth 0 lets the tab bar scroll inside the page. Without it this box
    // grows to the full label row and the page scrolls sideways instead.
    <Box sx={{ minWidth: 0, maxWidth: "100%" }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="h5" sx={{ mb: 0.5, mt: 0 }}>
            {DOWNLOAD_STATS_HEADING}
          </Typography>
          <PerspectiveHeader
            title={namedByTab ? undefined : title}
            subtitle={DOWNLOAD_STATS_DESCRIPTION}
          />
        </Box>
        {allowed && actions}
      </Stack>
      <RoutedTabs
        basePath={DOWNLOAD_STATS_PATH}
        tabs={screenTabs(showAdminTab)}
        ariaLabel="Download Stats screens"
        scrollable
      />

      {!configured ? (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Download Stats isn't connected yet. Set <code>ONE_WSO2_PRODUCT_DOWNLOAD_STATS_BACKEND_URL</code>{" "}
          in <code>public/config.js</code> (the API's base URL) and reload.
        </Alert>
      ) : !credentialed ? (
        // Every request carries the access token, and an http address would
        // put it on the wire in the clear — see productDownloadStats.ts.
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Download Stats needs an https address. An http address is only accepted for localhost.
        </Alert>
      ) : checking ? (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mt: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Checking your Admin access…
          </Typography>
        </Stack>
      ) : failed ? (
        <ErrorNotice onRetry={gate.retry} error={gate.error} sx={{ mt: 1.5 }}>
          Couldn't check Admin access.
        </ErrorNotice>
      ) : denied ? (
        <Typography sx={{ mt: 1.5 }}>
          You don't have access to Admin. It is where tracked repositories are added and turned
          off. Ask someone who already manages that list.
        </Typography>
      ) : (
        children
      )}
    </Box>
  );
}
