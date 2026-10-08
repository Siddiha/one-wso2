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

// Registry of the Download Stats screens, surfaced inside the Engineering
// perspective. The glossary for it is the "Engineering: Download Stats" section
// of the root CONTEXT.md.
//
// ---- why its own file, like misApps.ts -------------------------------------
//
// Download Stats is an app inside Engineering the way MIS is an app inside
// Finance: its own registry, its own path segment, one shell. Its Admin row is
// gated by the Download Stats API's own /user-info answer, folded into the
// rail by id (ENGINEERING_ADMIN_ITEM_ID, the `engineering` adapter in
// visibilityFold.ts), not by One WSO2 capabilities. The registry is spread
// into the Engineering perspective's sections where it is surfaced.
//
// ---- on `requires` --------------------------------------------------------
//
// Only Admin carries it, and there it means RESTRICTED and nothing more — the
// adapter makes the real decision. The other five screens are open to every
// signed-in employee, so they carry none. Same convention as misApps.ts.

import {
  BoxesIcon,
  DownloadIcon,
  LayoutDashboardIcon,
  PackageIcon,
  SettingsIcon,
  StarIcon,
} from "@wso2/oxygen-ui-icons-react";
import type { MenuApp, MenuAppItem } from "@constants/appMenu";

/**
 * The one sentence under the app title, on every screen. Banking does the
 * same: the tabs name the section, and the description does not change with
 * them.
 */
export const DOWNLOAD_STATS_DESCRIPTION =
  "Download activity and repository stats across all WSO2 products.";

// The h1 on every screen. The rail, a pin and the launcher keep the shorter
// name on the app below. The two differ on purpose: the rail stays short, and
// the page names the product.
export const DOWNLOAD_STATS_HEADING = "GitHub Product Download Stats";

/** Root of every Download Stats route: perspective / app. */
export const DOWNLOAD_STATS_PATH = "/engineering/download-stats";

// Nested under the Engineering perspective's own path. Earlier addresses
// were /engineering/<screen>, so the path skipped the app segment; those
// addresses now forward here (see features/engineering/routes.tsx).
export const downloadStatsPaths = {
  overview: `${DOWNLOAD_STATS_PATH}/overview`,
  downloads: `${DOWNLOAD_STATS_PATH}/downloads`,
  versions: `${DOWNLOAD_STATS_PATH}/versions`,
  packages: `${DOWNLOAD_STATS_PATH}/packages`,
  repositoryStats: `${DOWNLOAD_STATS_PATH}/repository-stats`,
  admin: `${DOWNLOAD_STATS_PATH}/admin`,
} as const;

/** One of the six screens, by the key the shell and the routes use. */
export type DownloadStatsScreen = keyof typeof downloadStatsPaths;

// Admin's rail id. The rail shows this row only when the Download Stats API
// says the caller is an admin — see engineeringAdminVisibility.ts, and the
// `engineering` adapter's claim in visibilityFold.ts.
export const ENGINEERING_ADMIN_ITEM_ID = "engineering-download-stats-admin";

/**
 * The six screens. Each entry is a tab and a route: the tab bar reads `label`
 * and `path`. `desc` repeats the app's one sentence because the item type
 * requires one; the shell does not read it per screen. The same entry is what
 * a pin qualifies, which is why the screens stay on the rail section even
 * though the rail lists only the app.
 */
export const DOWNLOAD_STATS_SCREENS: Readonly<Record<DownloadStatsScreen, MenuAppItem>> = {
  overview: {
    id: "engineering-download-stats-overview",
    label: "Overview",
    icon: LayoutDashboardIcon,
    desc: DOWNLOAD_STATS_DESCRIPTION,
    path: downloadStatsPaths.overview,
  },
  downloads: {
    id: "engineering-download-stats-downloads",
    label: "Downloads",
    icon: DownloadIcon,
    desc: DOWNLOAD_STATS_DESCRIPTION,
    path: downloadStatsPaths.downloads,
  },
  versions: {
    id: "engineering-download-stats-versions",
    label: "Versions",
    icon: PackageIcon,
    desc: DOWNLOAD_STATS_DESCRIPTION,
    path: downloadStatsPaths.versions,
  },
  packages: {
    id: "engineering-download-stats-packages",
    label: "Packages",
    icon: BoxesIcon,
    desc: DOWNLOAD_STATS_DESCRIPTION,
    path: downloadStatsPaths.packages,
  },
  repositoryStats: {
    id: "engineering-download-stats-repository-stats",
    label: "Repository Stats",
    icon: StarIcon,
    desc: DOWNLOAD_STATS_DESCRIPTION,
    path: downloadStatsPaths.repositoryStats,
  },
  admin: {
    id: ENGINEERING_ADMIN_ITEM_ID,
    label: "Admin",
    icon: SettingsIcon,
    desc: DOWNLOAD_STATS_DESCRIPTION,
    // RESTRICTED, nothing more — see the note at the top of the file.
    requires: ["admin"],
    path: downloadStatsPaths.admin,
  },
};

export const DOWNLOAD_STATS_APPS: readonly MenuApp[] = [
  {
    key: "download-stats",
    name: "Download Stats",
    // Not BarChart3, which is the Engineering perspective's own glyph: the
    // waffle tile already wears it, and the app row beneath should read as a
    // different thing.
    icon: DownloadIcon,
    purpose: "Release downloads, package downloads and repository stats for every Product.",
    // One rail row. The screens are the tab bar inside the app, in this order.
    inTabs: true,
    // Rail order. Overview first, because the perspective's landing forwards
    // to the first visible row.
    items: [
      DOWNLOAD_STATS_SCREENS.overview,
      DOWNLOAD_STATS_SCREENS.downloads,
      DOWNLOAD_STATS_SCREENS.versions,
      DOWNLOAD_STATS_SCREENS.packages,
      DOWNLOAD_STATS_SCREENS.repositoryStats,
      DOWNLOAD_STATS_SCREENS.admin,
    ],
  },
];
