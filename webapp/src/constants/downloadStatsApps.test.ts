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

import { describe, expect, it } from "vitest";
import {
  DOWNLOAD_STATS_APPS,
  DOWNLOAD_STATS_DESCRIPTION,
  DOWNLOAD_STATS_HEADING,
  DOWNLOAD_STATS_PATH,
  DOWNLOAD_STATS_SCREENS,
  ENGINEERING_ADMIN_ITEM_ID,
  downloadStatsPaths,
} from "./downloadStatsApps";
import { claimOf } from "@components/side-rail/visibilityFold";
import { PERSPECTIVES } from "./perspectives";


const app = DOWNLOAD_STATS_APPS[0];
const items = DOWNLOAD_STATS_APPS.flatMap((entry) => entry.items);

describe("the Download Stats registry", () => {
  it("is one app named Download Stats, offered as one rail row", () => {
    expect(DOWNLOAD_STATS_APPS).toHaveLength(1);
    expect(app.name).toBe("Download Stats");
    expect(DOWNLOAD_STATS_HEADING).toBe("GitHub Product Download Stats");
    expect(app.inTabs).toBe(true);
    expect(app.icon).toBeDefined();
  });

  // Perspective / app / screen, like Finance → MIS → ARR Build. The address
  // and the rail have to agree about where a person is.
  it("puts every screen under the app segment beneath Engineering", () => {
    expect(DOWNLOAD_STATS_PATH).toBe("/engineering/download-stats");
    for (const item of items) {
      expect(item.path, `${item.id} is not under ${DOWNLOAD_STATS_PATH}/`).toMatch(
        /^\/engineering\/download-stats\/[a-z-]+$/,
      );
    }
  });

  it("lists the six screens in tab order, with the agreed slugs", () => {
    expect(items.map((item) => item.label)).toEqual([
      "Overview",
      "Downloads",
      "Versions",
      "Packages",
      "Repository Stats",
      "Admin",
    ]);
    expect(items.map((item) => item.path)).toEqual([
      "/engineering/download-stats/overview",
      "/engineering/download-stats/downloads",
      "/engineering/download-stats/versions",
      "/engineering/download-stats/packages",
      "/engineering/download-stats/repository-stats",
      "/engineering/download-stats/admin",
    ]);
    expect(Object.values(downloadStatsPaths).sort()).toEqual(items.map((item) => item.path).sort());
  });

  // One sentence for the app. The tabs name the screen; the description does not.
  it("gives every screen the same description", () => {
    for (const item of items) {
      expect(item.desc).toBe(DOWNLOAD_STATS_DESCRIPTION);
    }
  });

  // Admin is the one row the Download Stats API decides. The rail's visibility
  // fold answers it through the engineering adapter by id; the other five are
  // open to every signed-in employee and carry no restriction.
  it("leaves Admin's visibility to the engineering adapter, by id, and nothing else's", () => {
    const claim = claimOf("engineering");
    expect(claim.kind).toBe("sections");
    if (claim.kind !== "sections") throw new Error("unreachable");
    expect([...claim.ids]).toEqual([ENGINEERING_ADMIN_ITEM_ID]);
    expect(DOWNLOAD_STATS_SCREENS.admin.id).toBe(ENGINEERING_ADMIN_ITEM_ID);
    for (const item of items) {
      if (item.id === ENGINEERING_ADMIN_ITEM_ID) continue;
      expect(item.requires ?? [], `${item.id} reads as restricted`).toEqual([]);
    }
  });

  // Not a One WSO2 admin: the hint only says RESTRICTED. If the id ever dropped
  // out of the adapter's claim it would fall to people-app capabilities, where
  // an unrestricted entry is published to the whole company.
  it("marks Admin restricted, so it fails closed if the adapter ever stopped claiming it", () => {
    expect(DOWNLOAD_STATS_SCREENS.admin.requires).toEqual(["admin"]);
  });

  // The rail row opens Overview. The screens stay on the section so a pin can
  // still name each one; the rail test is what proves they are not rows.
  it("reaches the rail as one Download Stats row that opens Overview", () => {
    const engineering = PERSPECTIVES.find((p) => p.key === "engineering");
    const group = (engineering?.sections ?? []).find((s) => s.id === `sec-app-${app.key}`);
    expect(group?.label).toBe("Download Stats");
    expect(group?.inTabs).toBe(true);
    expect(group?.path).toBe(downloadStatsPaths.overview);
    expect(group?.icon).toBeDefined();
    expect(group?.children?.map((c) => c.label)).toEqual(items.map((item) => item.label));
    expect(group?.children?.map((c) => c.path)).toEqual(items.map((item) => item.path));
  });
});
