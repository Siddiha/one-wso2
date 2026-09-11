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

// Central perspective registry. The waffle switcher and left rail both read
// from this — one edit here changes every entry point.

import { csmUrl, isCsmConfigured, isIsacConfigured, isacUrl } from "@config/apiConfig";
import {
  CheckCheckIcon,
  DatabaseIcon,
  HouseIcon,
  LifeBuoyIcon,
  MegaphoneIcon,
  NetworkIcon,
  SatelliteDishIcon,
  UserRoundIcon,
  UserRoundMinusIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
  type LucideIcon,
} from "@wso2/oxygen-ui-icons-react";
import type { Capability, MenuApp } from "@constants/appMenu";
import { FINANCE_PERSPECTIVE_APPS, ME_FINANCE_APPS } from "@constants/financeApps";
import { CLAIM_APPROVAL_PATH } from "@features/finance/approvals/claimApprovalTabs";
import { MARKETING_OPS_APPS } from "@constants/marketingOpsApps";
import { ME_APPS } from "@constants/meApps";

export interface PerspectiveSection {
  id: string; // anchor id on the perspective's page (leaf sections)
  label: string;
  // App groups (Leave, Menu, Finance) carry an icon + nested children.
  // A section with `children` renders as a collapsible group in the rail; a
  // leaf section scrolls to its `id`.
  icon?: LucideIcon;
  // Visible when the caller has ANY of these capabilities (OR semantics).
  // Omitted = visible to everyone. Only app-menu registries (Leave, Finance,
  // Finance) use this.
  requires?: Capability[];
  children?: PerspectiveSection[];
  // When set, a leaf item is a route (rail navigates) rather than a
  // scroll-anchor. Used by the native Leave screens.
  path?: string;
  // Overrides PeopleOpsPage's default overview-card copy, which otherwise
  // assumes every shipped leaf is a filterable/exportable report (true for
  // Active employees / Resignations, not for something like Org Chart).
  // Omitted = the default copy applies.
  description?: string;
  // Render as a group even with a single visible child — see MenuApp.alwaysGroup.
  alwaysGroup?: boolean;
  // When set, a leaf item leaves One WSO2 entirely: it renders as an anchor
  // that opens in a new tab, and is never route-highlighted because no route
  // of ours is active while the user is over there. Mutually exclusive with
  // `path` — a section is either somewhere we host or somewhere we don't.
  externalUrl?: string;
}

// Turn an App → items registry into rail sections: one collapsible group
// per app, each with its top-level menu items as children (scroll-anchor
// or route). Derived from the single-source-of-truth registries so the
// rail and the pages can't drift.
function appsToSections(apps: readonly MenuApp[]): PerspectiveSection[] {
  return apps.map((app) => ({
    id: `sec-app-${app.key}`,
    label: app.name,
    icon: app.icon,
    alwaysGroup: app.alwaysGroup,
    children: app.items.map((it) => ({
      id: it.id,
      label: it.label,
      requires: it.requires,
      path: it.path,
    })),
  }));
}

// People Ops's prior app menu (People/Visitor/Careers) was retired per
// restructuring feedback. These are the reports being onboarded, ported from
// people-app. A section with a `path` is live (the rail navigates to it); one
// without is still a "coming soon" anchor on the overview page — see
// PeopleOpsPage, which reads exactly this list to decide which card to show.
//
// `requires: ["admin"]` keeps the locked ones out of the rail for people who
// can't use them. It is NOT the access control: the people-app backend
// rejects non-admins on both /employees/search (org-wide) and
// /reports/employees/generate, and PeopleOpsShell turns that into an
// explanation. Someone who types the URL still gets a clear answer.
//
// Org Chart is the one section here WITHOUT `requires: ["admin"]` — same
// people-app backend as everything else here, but a different endpoint
// (/employees/basic-info) with its own access model: any employee in that
// endpoint's configured group, not a people-app admin privilege. See
// docs/ported-apps/org-chart.md.
export const PEOPLE_OPS_SECTIONS: PerspectiveSection[] = [
  {
    id: "people-org-chart",
    label: "Org Chart",
    icon: NetworkIcon,
    path: "/people-ops/org-chart",
    description: "Browse who reports to whom, company-wide.",
  },
  {
    id: "people-active-employee-report",
    label: "Active employees",
    icon: UserRoundIcon,
    path: "/people-ops/reports/active-employees",
    requires: ["admin"],
  },
  {
    id: "people-resignation-report",
    label: "Resignations",
    icon: UserRoundMinusIcon,
    path: "/people-ops/reports/resignations",
    requires: ["admin"],
  },
  // A group, not a leaf: people-app's Master Data has several screens (org
  // structure, career functions, …) and Org Structure is the first ported.
  // Grouping now means the next one is a new child rather than a reshape of
  // the rail — see MenuApp.alwaysGroup for why a one-child group is right
  // when more are known to be coming.
  {
    id: "people-master-data",
    label: "Master data",
    icon: DatabaseIcon,
    alwaysGroup: true,
    children: [
      {
        id: "people-master-data-org-structure",
        label: "Org structure",
        path: "/people-ops/master-data/org-structure",
        requires: ["admin"],
      },
    ],
  },
];


// Marketing Ops. Built from the registry now so the rail is ready, but the
// perspective itself stays locked (`access: false` below) until Phase 1
// (Utilities) lands — see "My Findings Marketing Ops.md" in the repo root.
//
// Note the two-layer gating here, which differs from every other perspective:
// the `requires` values these sections carry speak One WSO2's capability
// vocabulary, but the real decision is made by useMarketingOpsGate against the
// Marketing Ops backend's own /api/me. Whatever renders these sections must ask
// that gate, not just read `requires`.
//
// ISAC leads the rail. It is NOT in MARKETING_OPS_APPS, deliberately: that
// registry is the set of operations this webapp implements, and every item in it
// resolves to a route we own. ISAC is a separate application that One WSO2 only
// points at, so it belongs here — where the rail is assembled — rather than in a
// registry that also feeds the overview page's cards and the capability gate.
//
// It is omitted entirely when its URL isn't configured. A rail item that goes
// nowhere is worse than one that isn't there.
const MARKETING_OPS_SECTIONS: PerspectiveSection[] = [
  ...(isIsacConfigured()
    ? [{ id: "mops-isac", label: "ISAC", icon: SatelliteDishIcon, externalUrl: isacUrl }]
    : []),
  ...appsToSections(MARKETING_OPS_APPS),
];

// The Me home landing. The landing page itself already is the ported
// people-app "Me" profile view (General/Personal/Emergency/Connected, see
// features/my/pages/MyProfilePage) — no separate "Profile" rail entry
// needed for it. My Team mirrors people-app's lead-only nav item; it's a
// placeholder page for now (see MyTeamComingSoonPage). Then the apps that
// live here — things an employee does (and, for a lead/finance-approver
// subset of items, approves) for themself or their team, as opposed to
// People Ops' HR-team tools: Leave, then the digiops-finance claim apps
// (OPD/credit-card/expense — moved in from the retired Finance persona).
const ME_SECTIONS: PerspectiveSection[] = [
  { id: "me-my-team", label: "My Team", icon: UsersRoundIcon, path: "/me/my-team", requires: ["lead"] },
  ...appsToSections(ME_APPS),
  ...appsToSections(ME_FINANCE_APPS),
];

export interface PerspectiveDef {
  key: string;
  label: string;
  icon: LucideIcon;
  access: boolean;
  path?: string; // route path (undefined for locked perspectives)
  /**
   * True when the contents are gated by a backend OUTSIDE this app's capability
   * model, so `access: true` does not mean "every signed-in user can use this".
   *
   * `access` answers "is it built"; this answers "is it usable by whoever is
   * looking". The distinction matters wherever a user is sent somewhere WITHOUT
   * clicking it — the landing page. Choosing to open a perspective and finding
   * an authorization notice is legible; being dropped on one at login is not.
   * Surfaces the user drives (the rail, the launcher, favourites) keep showing
   * these, because the gate's own message is the right answer there.
   */
  externallyGated?: boolean;
  /**
   * Set when the perspective is a separate application this webapp only points
   * at. Its launcher tile opens the URL in a new tab instead of routing, and it
   * carries no `path` — so `reachablePerspectives` excludes it, and it can be
   * neither a landing choice nor a favourite. Both would be shortcuts to
   * somewhere this app cannot take you.
   */
  externalUrl?: string;
  sections?: PerspectiveSection[];
}

export const PERSPECTIVES: readonly PerspectiveDef[] = [
  // "Apps" (persona areas, locked or unlocked). Order here is the order
  // shown in the waffle's Apps group.
  {
    key: "people",
    label: "People Ops",
    icon: UsersIcon,
    access: true,
    path: "/people-ops",
    sections: PEOPLE_OPS_SECTIONS,
  },
  // Submitting a claim and looking up your own stay under Me (see ME_SECTIONS)
  // — those are things you do for yourself. Deciding other people's claims is
  // not, so it lives here. Its rail entry is gated by the three claim backends'
  // own rules, not by `requires`; see features/finance/api/useFinanceGate.
  {
    key: "finance",
    label: "Finance",
    icon: WalletIcon,
    access: true,
    path: "/finance",
    sections: [
      {
        id: "claim-approval",
        label: "Claim approval",
        icon: CheckCheckIcon,
        path: CLAIM_APPROVAL_PATH,
      },
      // Credit card lives here rather than under Me because a corporate card is
      // not something everyone has — unlike leave or claims, it is not part of
      // the set every employee needs.
      ...appsToSections(FINANCE_PERSPECTIVE_APPS),
    ],
  },
  // A separate application, opened in a new tab. `access` follows the URL being
  // configured: without one the tile stays in its unbuilt state rather than
  // becoming a link to nowhere.
  {
    key: "csm",
    label: "CSM",
    icon: LifeBuoyIcon,
    access: isCsmConfigured(),
    externalUrl: csmUrl || undefined,
  },
  // Marketing Ops — UNLOCKED. Ported so far: Utilities (UTM + Asset Name
  // generators and their Marketing Admin panels) and Ad Campaigns → Analytics.
  // Still in Marketing Ops itself: Email Workbench, Events, CRM Upload — those
  // show on the overview as cards marked "not here yet".
  //
  // Two non-obvious things about this entry:
  //  - `access` controls whether the WAFFLE offers the perspective; `path` is
  //    what lets PerspectiveProvider recognise the route and give the perspective
  //    its own rail. BOTH are needed — `access` without `path` yields a tile that
  //    looks clickable and does nothing (WaffleOverlay bails on the click), and
  //    `path` without `access` makes it reachable by URL but unadvertised.
  //  - Its rail gates on the MARKETING OPS backend's own Asgardeo groups, not on
  //    people-app privileges — see useMarketingOpsGate and the wiring in
  //    SideRail. The `requires` on these sections is a coarse hint only.
  {
    key: "marketing",
    label: "Marketing Ops",
    // Gated on the Marketing Ops backend's own Asgardeo groups, not on
    // people-app privileges — see useMarketingOpsGate.
    externallyGated: true,
    icon: MegaphoneIcon,
    access: true,
    path: "/marketing-ops",
    sections: MARKETING_OPS_SECTIONS,
  },
  // "Me" is the Home landing: the person's own profile plus everyday apps —
  // Leave, Menu, and the finance claims.
  //
  // It is also a default favourite. It appears in the launcher either way —
  // removing the favourite must not leave a user with no route back to it.
  {
    key: "me",
    label: "Me",
    icon: HouseIcon,
    access: true,
    path: "/me",
    sections: ME_SECTIONS,
  },
];

/**
 * Perspectives a user can actually be sent to: built (`access`) and routable
 * (`path`). Both are required — a locked perspective with a path is reachable by
 * URL but deliberately unadvertised.
 *
 * Shared because three surfaces need the same notion: the rail's cross-links,
 * the landing-page setting, and launcher favourites.
 */
export function reachablePerspectives(): PerspectiveDef[] {
  return PERSPECTIVES.filter((p) => p.access && typeof p.path === "string" && p.path.length > 0);
}

/**
 * Every perspective, for the launcher's "Apps" group.
 *
 * There used to be a `group` field splitting these from a "cross" set rendered
 * under "For you" in both the rail and the launcher. Both of those surfaces are
 * gone (the rail does not duplicate the launcher, and Me is a default
 * favourite), so the field ended up on every entry with nothing reading the
 * distinction. An alias rather than a second exported array, so there is one
 * list to keep in order.
 */
export const FUNCTIONAL_PERSPECTIVES = PERSPECTIVES;

export function findPerspectiveByPath(pathname: string): PerspectiveDef | undefined {
  return PERSPECTIVES.find((p) => p.path && pathname.startsWith(p.path));
}

export function findPerspectiveByKey(key: string): PerspectiveDef | undefined {
  return PERSPECTIVES.find((p) => p.key === key);
}
