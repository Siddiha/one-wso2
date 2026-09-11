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

// Builds one self-contained HTML file of the whole company hierarchy — no
// external requests, nothing that depends on being signed in — so it can be
// downloaded and handed to anyone, opened fully offline. Always the FULL
// company, regardless of the on-screen department filter or collapsed rows:
// "download it and send it to people" means the whole org chart, not
// today's particular view.
//
// Ships the same interactivity as the live page — search-and-jump,
// department isolate, company filter, hide interns, expand all / reset — via
// a small vanilla <script> block at the bottom (~150 lines, no
// dependencies). The full flat
// EMPLOYEES array is embedded as JSON for that script to search/filter over;
// the tree markup itself is still pre-rendered server-side (buildOrgTree,
// same as the live page) so the file still shows a complete chart even for
// a viewer with JavaScript disabled — script only adds interaction on top.
//
// Colors are the app's real Oxygen UI "Acrylic Orange" theme tokens
// (@wso2/oxygen-ui's AcrylicBaseTheme / AcrylicOrangeTheme), read straight
// from the installed package rather than guessed: primary #ff7300, header
// gradient #F47B20→#EF4223, text #40404B, divider #00000012.
//
// Employee photos ARE embedded, but not as live URLs — those are
// Choreo/Google-hosted and a recipient without the same auth/network access
// would just see a broken image. Instead, at download time (while the
// exporter is still authenticated), each photo is fetched once, downscaled
// to a small square, and inlined as a data: URI — see fetchAvatarDataUri.
// Any photo that can't be fetched (CORS, 404, network) just falls back to
// the initials-on-department-color avatar, same as the live app — a photo
// is a bonus, never a broken image.

import { departmentColor, departmentStats, type DepartmentStat } from "./departmentColors";
import { buildOrgTree, companyNames, type OrgChartTree } from "./buildOrgTree";
import type { EmployeeDirectoryRecord, OrgChartNode } from "../api/orgChartTypes";

const AVATAR_PIXEL_SIZE = 64;

// The white WSO2 wordmark (public/wso2-logo-white.svg), inlined so the
// exported file stays a single self-contained document — no external asset
// request. White reads on the banner's orange gradient the same way it does
// on the app's own orange surfaces.
const LOGO_SVG = `<svg viewBox="0 0 1644.49 654.23" xmlns="http://www.w3.org/2000/svg" style="height:38px;width:auto;display:block">
  <g>
    <path d="M352.56,407.24c-.18,0-.37,0-.55-.02-3.98-.24-7.37-2.99-8.42-6.83l-30.08-110.3-15.4,51.45c-1.18,3.93-4.8,6.63-8.91,6.63h-57.7c-5.14,0-9.3-4.16-9.3-9.3s4.16-9.3,9.3-9.3h50.78l22.74-75.95c1.18-3.94,4.8-6.63,8.91-6.63.04,0,.07,0,.12,0,4.15.05,7.76,2.84,8.85,6.85l31.39,115.09,13.6-33.56c1.42-3.51,4.83-5.81,8.62-5.81h46.23c5.14,0,9.3,4.16,9.3,9.3s-4.16,9.3-9.3,9.3h-39.97l-21.59,53.27c-1.43,3.52-4.85,5.81-8.61,5.81Z" fill="#fff"/>
    <path d="M327.12,490.56c-90.12,0-163.44-73.32-163.44-163.44s73.32-163.44,163.44-163.44,163.45,73.32,163.45,163.44-73.32,163.44-163.45,163.44ZM327.12,182.26c-79.87,0-144.85,64.98-144.85,144.85s64.98,144.85,144.85,144.85,144.85-64.98,144.85-144.85-64.98-144.85-144.85-144.85Z" fill="#fff"/>
  </g>
  <g>
    <path d="M640.59,448.89l-65.4-241.2h38.86l34.8,138.24c2.16,8.53,4.16,17.38,5.99,26.55,1.83,9.18,3.64,18.45,5.43,27.84,1.78,9.39,3.48,18.78,5.1,28.17h-5.51c1.73-9.39,3.51-18.78,5.34-28.17,1.83-9.39,3.72-18.67,5.67-27.84,1.94-9.17,4.05-18.02,6.31-26.55l35.78-138.24h40.47l35.45,138.24c2.27,8.53,4.37,17.38,6.31,26.55,1.94,9.18,3.86,18.45,5.75,27.84,1.88,9.39,3.69,18.78,5.42,28.17h-5.82c1.72-9.39,3.45-18.78,5.18-28.17,1.72-9.39,3.58-18.67,5.59-27.84,1.99-9.17,3.97-18.02,5.91-26.55l34.8-138.24h39.18l-65.72,241.2h-42.57l-38.36-142.94c-2.92-11.22-5.62-23.42-8.09-36.58-2.49-13.17-5.02-27.62-7.61-43.38h8.42c-2.7,15.11-5.15,29.09-7.37,41.92-2.21,12.84-4.99,25.53-8.34,38.04l-38.2,142.94h-42.73Z" fill="#fff"/>
    <path d="M984.86,452.94c-18.02,0-33.67-2.86-46.94-8.58-13.28-5.72-23.67-13.89-31.17-24.52-7.5-10.63-11.63-23.28-12.38-37.96h37.07c.76,8.74,3.58,15.97,8.5,21.69,4.91,5.72,11.3,9.98,19.19,12.79,7.87,2.81,16.4,4.21,25.57,4.21,10.26,0,19.35-1.59,27.28-4.77,7.93-3.18,14.22-7.72,18.86-13.6,4.64-5.88,6.96-12.71,6.96-20.48,0-7.02-2.02-12.76-6.07-17.24-4.05-4.48-9.5-8.2-16.35-11.17-6.85-2.97-14.66-5.59-23.39-7.85l-28.17-7.77c-19.75-5.29-35.15-13.11-46.22-23.47-11.06-10.36-16.59-23.8-16.59-40.31,0-13.92,3.75-26.08,11.25-36.5,7.5-10.41,17.7-18.5,30.59-24.28,12.9-5.77,27.44-8.66,43.63-8.66s31.06,2.89,43.63,8.66c12.57,5.78,22.44,13.68,29.63,23.72,7.17,10.04,10.92,21.47,11.25,34.32h-35.94c-1.19-11.01-6.28-19.53-15.29-25.58-9.02-6.04-20.37-9.07-34.08-9.07-9.71,0-18.16,1.51-25.34,4.53-7.18,3.02-12.73,7.2-16.67,12.54-3.94,5.34-5.91,11.41-5.91,18.21,0,7.66,2.35,13.84,7.04,18.54,4.7,4.7,10.42,8.42,17.16,11.17,6.74,2.75,13.19,4.94,19.35,6.55l23.47,6.15c7.66,1.94,15.56,4.56,23.72,7.85,8.15,3.3,15.67,7.56,22.58,12.79,6.91,5.24,12.49,11.71,16.76,19.42,4.26,7.72,6.39,17.03,6.39,27.92,0,13.6-3.51,25.74-10.52,36.42-7.02,10.69-17.19,19.08-30.52,25.18-13.33,6.09-29.44,9.15-48.32,9.15Z" fill="#fff"/>
    <path d="M1198.73,452.13c-20.84,0-39.48-4.94-55.93-14.81-16.46-9.87-29.41-24.06-38.86-42.57-9.44-18.51-14.16-40.6-14.16-66.29s4.72-47.94,14.16-66.45c9.44-18.51,22.4-32.73,38.86-42.66,16.45-9.93,35.09-14.89,55.93-14.89s39.41,4.96,55.76,14.89c16.35,9.93,29.24,24.15,38.69,42.66,9.44,18.51,14.16,40.66,14.16,66.45s-4.73,47.78-14.16,66.29c-9.45,18.51-22.35,32.7-38.69,42.57-16.35,9.88-34.94,14.81-55.76,14.81ZM1198.73,418.46c13.7,0,25.98-3.42,36.82-10.28,10.84-6.85,19.43-17,25.74-30.43,6.31-13.44,9.46-29.87,9.46-49.29s-3.15-36.18-9.46-49.61c-6.31-13.44-14.9-23.58-25.74-30.44-10.84-6.85-23.12-10.28-36.82-10.28s-26.17,3.46-37.07,10.36c-10.9,6.91-19.51,17.08-25.82,30.52-6.31,13.43-9.46,29.92-9.46,49.45s3.15,35.83,9.46,49.21c6.31,13.38,14.92,23.53,25.82,30.43,10.9,6.91,23.25,10.36,37.07,10.36Z" fill="#fff"/>
    <path d="M1322.43,448.89v-26.71l81.91-84.66c8.42-8.85,15.43-16.67,21.04-23.47,5.61-6.8,9.88-13.32,12.79-19.59,2.92-6.26,4.38-12.95,4.38-20.07,0-8.09-1.86-15.05-5.59-20.88-3.72-5.83-8.8-10.3-15.22-13.43-6.42-3.13-13.73-4.7-21.94-4.7s-15.97,1.76-22.34,5.26c-6.36,3.5-11.28,8.45-14.73,14.81-3.45,6.37-5.18,13.87-5.18,22.5h-35.45c0-14.67,3.39-27.54,10.2-38.61,6.8-11.06,16.08-19.64,27.84-25.74,11.76-6.09,25.2-9.14,40.31-9.14s28.78,3.02,40.39,9.06c11.6,6.05,20.69,14.22,27.27,24.53,6.58,10.31,9.88,21.99,9.88,35.05,0,8.85-1.64,17.48-4.93,25.9-3.29,8.42-9.07,17.91-17.32,28.49-8.25,10.58-19.88,23.42-34.88,38.53l-47.27,49.38v1.94h108.14v31.57h-159.29Z" fill="#fff"/>
  </g>
</svg>`;

/** Fetches one photo and returns it as a small, cover-cropped JPEG data URI,
 *  or null if it can't be read (wrong CORS policy, 404, offline, etc.) — the
 *  caller falls back to the initials avatar in that case, never a broken img. */
async function fetchAvatarDataUri(url: string): Promise<string | null> {
  try {
    // no-referrer: Google-hosted thumbnails reject the request (which shows
    // up here as an opaque failure, no status) when the default Referer
    // reveals this app's origin — same fix as OrgChartRow.tsx's
    // <Avatar imgProps={{ referrerPolicy: "no-referrer" }}>, applied to
    // fetch() instead of an <img>.
    const response = await fetch(url, { referrerPolicy: "no-referrer" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PIXEL_SIZE;
    canvas.height = AVATAR_PIXEL_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const scale = Math.max(AVATAR_PIXEL_SIZE / bitmap.width, AVATAR_PIXEL_SIZE / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(bitmap, (AVATAR_PIXEL_SIZE - width) / 2, (AVATAR_PIXEL_SIZE - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

/** Runs `fn` over `items` with at most `limit` in flight at once — 900+
 *  unthrottled fetches would hammer the browser and the image host. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Fetches every employee's photo (where one exists) and returns a
 *  workEmail → data-URI map, omitting anyone whose photo couldn't be read. */
async function buildAvatarMap(employees: readonly EmployeeDirectoryRecord[]): Promise<Map<string, string>> {
  const withPhotos = employees.filter(
    (employee): employee is EmployeeDirectoryRecord & { employeeThumbnail: string } => Boolean(employee.employeeThumbnail),
  );
  const dataUris = await mapWithConcurrency(withPhotos, 12, (employee) => fetchAvatarDataUri(employee.employeeThumbnail));
  const avatarByEmail = new Map<string, string>();
  withPhotos.forEach((employee, index) => {
    const dataUri = dataUris[index];
    if (dataUri) avatarByEmail.set(employee.workEmail, dataUri);
  });
  return avatarByEmail;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe to embed inside a <script> tag — escapes every `<` so `</script>`,
 *  `<!--`, etc. can never appear literally, even inside a string value. */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function initials(firstName: string, lastName: string): string {
  return `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

function renderAvatar(node: OrgChartNode, avatarByEmail: ReadonlyMap<string, string>): string {
  const photo = avatarByEmail.get(node.workEmail);
  if (photo) {
    return `<span class="avatar" style="background-image:url('${photo}')"></span>`;
  }
  return `<span class="avatar" style="background-color:${departmentColor(node.team)}">${escapeHtml(initials(node.firstName, node.lastName))}</span>`;
}

function renderRow(node: OrgChartNode, avatarByEmail: ReadonlyMap<string, string>): string {
  const meta = [node.businessUnit, node.team].filter(Boolean).join(" / ");
  const hasReports = node.children.length > 0;
  return `<span class="row" data-work-email="${escapeHtml(node.workEmail)}">
    ${renderAvatar(node, avatarByEmail)}
    <span class="who">
      <span class="name">${escapeHtml(node.firstName)} ${escapeHtml(node.lastName)}<span class="title">${escapeHtml(node.designation ?? "")}</span></span>
      <span class="sub">${escapeHtml(node.workEmail)}${meta ? ` · ${escapeHtml(meta)}` : ""}</span>
    </span>
    ${hasReports ? `<span class="count">${node.children.length} report${node.children.length === 1 ? "" : "s"}</span>` : ""}
  </span>`;
}

function renderNode(
  node: OrgChartNode,
  isTopLevelRoot: boolean,
  isMainRoot: boolean,
  avatarByEmail: ReadonlyMap<string, string>,
): string {
  if (node.children.length === 0) {
    return `<div class="leaf"${isTopLevelRoot ? " data-top-level-root" : ""}>${renderRow(node, avatarByEmail)}</div>`;
  }
  // Only the main root starts open — matching what "Reset view" itself
  // produces (it opens [data-main-root] and nothing else). Every <details>
  // starting open meant a 900-row wall of text on first load, and made the
  // file's own Reset button produce a state it never actually started in.
  return `<details${isMainRoot ? " open" : ""}${isTopLevelRoot ? " data-top-level-root" : ""}${isMainRoot ? " data-main-root" : ""}>
    <summary>${renderRow(node, avatarByEmail)}</summary>
    <div class="children">
      ${node.children.map((child) => renderNode(child, false, false, avatarByEmail)).join("")}
      <div class="filter-note">All direct reports are hidden by filters.</div>
    </div>
  </details>`;
}

function renderLegend(stats: readonly DepartmentStat[]): string {
  if (stats.length === 0) return "";
  const rows = stats
    .map(
      (department) => `<div class="legend-row" data-legend="${escapeHtml(department.name)}">
        <span class="dot" style="background:${departmentColor(department.name)}"></span>
        <span class="legend-name">${escapeHtml(department.name)}</span>
        <span class="legend-count">${department.count}</span>
      </div>`,
    )
    .join("");
  return `<div class="legend">
    <div class="legend-title-row">
      <span class="legend-title">Teams · click to isolate</span>
      <span class="show-all-link" id="show-all-link">Show all</span>
    </div>
    ${rows}
  </div>`;
}

// A plain dropdown, not a legend like teams — companies have no natural
// color mapping and don't need click-to-isolate rows. Combines with the
// team filter by AND in the SCRIPT below, same as the live page.
function renderCompanySelect(companies: readonly string[]): string {
  if (companies.length === 0) return "";
  const options = companies.map((company) => `<option value="${escapeHtml(company)}">${escapeHtml(company)}</option>`).join("");
  return `<select class="company-select" id="company-select" aria-label="Filter by company" autocomplete="off">
    <option value="">Global</option>
    ${options}
  </select>`;
}

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f5f5f5;
    color: #40404B;
    margin: 0;
    padding: 28px 24px 64px;
  }
  .page { max-width: 1080px; margin: 0 auto; }
  .banner {
    background: linear-gradient(90deg, #F47B20 0%, #EF4223 100%);
    color: #ffffff;
    border-radius: 14px;
    padding: 22px 28px;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(239, 66, 35, 0.25);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .banner-text { flex: 1; min-width: 0; }
  .banner-logo { flex-shrink: 0; display: flex; align-items: center; }
  .eyebrow {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.18);
    padding: 3px 10px;
    border-radius: 999px;
    margin-bottom: 10px;
  }
  .banner .subtitle { font-size: 13px; color: rgba(255, 255, 255, 0.9); margin: 0; }
  .layout { display: flex; align-items: flex-start; gap: 20px; }
  .sidebar { width: 250px; flex-shrink: 0; position: sticky; top: 20px; }
  .stats { display: flex; gap: 10px; margin-bottom: 14px; }
  .stat {
    flex: 1;
    background: #ffffff;
    border: 1px solid #00000012;
    border-radius: 10px;
    padding: 10px 12px;
  }
  .stat-value { font-size: 19px; font-weight: 700; line-height: 1.2; }
  .stat-label { font-size: 11px; opacity: 0.6; }
  .search-box { position: relative; margin-bottom: 12px; }
  .search-input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #00000022;
    border-radius: 8px;
    font-size: 12.5px;
    font-family: inherit;
    color: #40404B;
    background: #ffffff;
  }
  .search-input:focus { outline: 2px solid #ff730055; border-color: #ff7300; }
  .company-select {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #00000022;
    border-radius: 8px;
    font-size: 12.5px;
    font-family: inherit;
    color: #40404B;
    background: #ffffff;
    margin-bottom: 12px;
  }
  .company-select:focus { outline: 2px solid #ff730055; border-color: #ff7300; }
  .search-results {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 30;
    max-height: 280px;
    overflow-y: auto;
    background: #ffffff;
    border: 1px solid #00000018;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    display: none;
  }
  .search-result { padding: 7px 10px; cursor: pointer; }
  .search-result:hover { background: rgba(255, 115, 0, 0.08); }
  .search-result-name { font-weight: 600; font-size: 12.5px; }
  .search-result-sub { font-size: 11px; opacity: 0.6; }
  .no-match { padding: 10px; font-size: 12px; opacity: 0.6; }
  .controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .btn {
    font-size: 12px;
    padding: 6px 10px;
    border: 1px solid #00000022;
    border-radius: 8px;
    background: #ffffff;
    cursor: pointer;
    color: #40404B;
    font-family: inherit;
  }
  .btn:hover { background: rgba(255, 115, 0, 0.08); border-color: #ff730055; }
  .hide-interns-row { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; font-size: 12.5px; }
  .legend-title-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
  .legend-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.55;
  }
  .show-all-link { color: #ff7300; cursor: pointer; font-size: 11px; font-weight: 700; display: none; }
  .legend-row { display: flex; align-items: center; gap: 8px; padding: 4px 5px; font-size: 12.5px; cursor: pointer; border-radius: 6px; }
  .legend-row:hover { background: rgba(255, 115, 0, 0.06); }
  .legend-row.selected { background: rgba(255, 115, 0, 0.12); font-weight: 700; }
  .legend-count { margin-left: auto; font-size: 11px; opacity: 0.55; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .tree-card {
    flex: 1;
    min-width: 0;
    background: #ffffff;
    border: 1px solid #00000012;
    border-radius: 14px;
    padding: 16px 18px 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  details > summary { cursor: pointer; list-style: none; display: flex; align-items: center; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before {
    content: "\\25B8";
    display: inline-block;
    width: 14px;
    flex-shrink: 0;
    color: #ff7300;
    transition: transform 120ms ease;
  }
  details[open] > summary::before { transform: rotate(90deg); }
  .row { display: flex; align-items: center; gap: 9px; padding: 5px 6px; border-radius: 8px; flex: 1; min-width: 0; }
  .row:hover { background: rgba(255, 115, 0, 0.07); }
  .row.highlight { background: rgba(255, 115, 0, 0.18) !important; }
  .leaf { display: flex; align-items: center; padding-left: 14px; }
  .avatar {
    width: 27px;
    height: 27px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    background-size: cover;
    background-position: center;
  }
  .who { min-width: 0; display: flex; flex-direction: column; }
  .name { font-weight: 600; font-size: 13px; }
  .title { font-weight: 400; opacity: 0.6; margin-left: 6px; font-size: 12px; }
  .sub { opacity: 0.55; font-size: 11.5px; }
  .count {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.6;
    border: 1px solid #00000012;
    border-radius: 999px;
    padding: 1px 9px;
    flex-shrink: 0;
  }
  .children { margin-left: 13px; padding-left: 16px; border-left: 1.5px solid #00000012; }
  .filter-note { display: none; opacity: 0.55; font-size: 11.5px; padding: 4px 5px 4px 20px; }
  .hidden-by-filter { display: none !important; }
  .strays { margin-top: 22px; padding-top: 16px; border-top: 1px solid #00000012; }
  .strays-note { opacity: 0.6; font-size: 12px; margin-bottom: 8px; display: block; }
  @media (max-width: 760px) {
    .layout { flex-direction: column; }
    .sidebar { width: 100%; position: static; }
  }
`;

// Vanilla JS, ported from the live page's own logic (util/buildOrgTree.ts's
// ancestorChain walk, OrgChartPage's visibleEmails computation and handlers)
// — no framework, no build step, just DOM APIs. EMPLOYEES is injected right
// before this runs (see buildOrgChartHtml).
const SCRIPT = `
(function () {
  var byEmail = {};
  EMPLOYEES.forEach(function (e) { byEmail[e.workEmail] = e; });

  var rowByEmail = {};
  document.querySelectorAll("[data-work-email]").forEach(function (el) {
    rowByEmail[el.getAttribute("data-work-email")] = el;
  });

  function ancestorChain(target) {
    var chain = [], visited = {}, current = target;
    while (current && !visited[current]) {
      var emp = byEmail[current];
      if (!emp) break;
      chain.unshift(current);
      visited[current] = true;
      var mgr = emp.managerEmail;
      current = (mgr !== current && byEmail[mgr]) ? mgr : null;
    }
    return chain;
  }

  var state = { department: null, company: null, hideInterns: false };

  function computeVisibleSet() {
    if (!state.department && !state.company) return null;
    var visible = {};
    EMPLOYEES.forEach(function (e) {
      var matchesDepartment = !state.department || e.team === state.department;
      var matchesCompany = !state.company || e.company === state.company;
      if (matchesDepartment && matchesCompany) {
        ancestorChain(e.workEmail).forEach(function (email) { visible[email] = true; });
      }
    });
    return visible;
  }

  function applyVisibility() {
    var visible = computeVisibleSet();
    Object.keys(rowByEmail).forEach(function (email) {
      var rowEl = rowByEmail[email];
      var wrapper = rowEl.closest("details, .leaf");
      if (!wrapper) return;
      // data-main-root, not data-top-level-root: the latter is also set on
      // every stray root, which would exempt an intern stray root from
      // hideInterns the same way the one true root is exempt — but a stray
      // is one of potentially many independent entries, not the single root
      // the whole page hangs off, so it should hide like any other intern.
      var isMainRoot = wrapper.hasAttribute("data-main-root");
      var emp = byEmail[email];
      var failsIsolate = !!visible && !visible[email];
      var failsIntern = !isMainRoot && state.hideInterns && !!emp && emp.designation === "Intern";
      wrapper.classList.toggle("hidden-by-filter", failsIsolate || failsIntern);
    });
    document.querySelectorAll(".children").forEach(function (box) {
      var note = box.querySelector(".filter-note");
      if (!note) return;
      var kids = box.querySelectorAll(":scope > details, :scope > .leaf");
      var anyVisible = Array.prototype.some.call(kids, function (el) {
        return !el.classList.contains("hidden-by-filter");
      });
      note.style.display = (kids.length > 0 && !anyVisible) ? "block" : "none";
    });
    document.querySelectorAll("[data-legend]").forEach(function (el) {
      el.classList.toggle("selected", el.getAttribute("data-legend") === state.department);
    });
    var showAll = document.getElementById("show-all-link");
    if (showAll) showAll.style.display = (state.department || state.company) ? "inline" : "none";
  }

  document.querySelectorAll("[data-legend]").forEach(function (el) {
    el.addEventListener("click", function () {
      var dept = el.getAttribute("data-legend");
      state.department = (state.department === dept) ? null : dept;
      applyVisibility();
    });
  });

  var showAllLink = document.getElementById("show-all-link");
  if (showAllLink) {
    showAllLink.addEventListener("click", function () {
      // Both filters, not just department — either one on its own can hide
      // what "Show all" promises to reveal, same fix as the live page's
      // "Show all".
      state.department = null;
      state.company = null;
      if (companySelect) companySelect.value = "";
      applyVisibility();
    });
  }

  var hideInternsBox = document.getElementById("hide-interns");
  if (hideInternsBox) {
    hideInternsBox.addEventListener("change", function (e) {
      state.hideInterns = e.target.checked;
      applyVisibility();
    });
  }

  var companySelect = document.getElementById("company-select");
  if (companySelect) {
    companySelect.addEventListener("change", function (e) {
      state.company = e.target.value || null;
      applyVisibility();
    });
  }

  var expandAllBtn = document.getElementById("expand-all");
  if (expandAllBtn) {
    expandAllBtn.addEventListener("click", function () {
      document.querySelectorAll("details").forEach(function (d) { d.open = true; });
    });
  }

  var searchInput = document.getElementById("search-input");
  var resultsBox = document.getElementById("search-results");

  function hideResults() {
    resultsBox.style.display = "none";
    resultsBox.innerHTML = "";
  }

  function escapeText(s) {
    var d = document.createElement("div");
    d.textContent = s;
    // textContent->innerHTML escapes & < > but not " or ' — this also feeds
    // the data-jump="..." attribute below, not just element text, so both
    // need escaping too. Matches escapeHtml's coverage (the pre-rendered
    // markup's own escaper) so the two escaping paths in this file agree on
    // what's safe, instead of quietly disagreeing.
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function jumpTo(email) {
    // Department, company, AND interns filters — any of them would
    // otherwise hide the very result being jumped to.
    state.department = null;
    state.company = null;
    if (companySelect) companySelect.value = "";
    state.hideInterns = false;
    if (hideInternsBox) hideInternsBox.checked = false;
    applyVisibility();
    var chain = ancestorChain(email);
    chain.slice(0, -1).forEach(function (ancestorEmail) {
      var el = rowByEmail[ancestorEmail];
      var details = el && el.closest("details");
      if (details) details.open = true;
    });
    var targetRow = rowByEmail[email];
    if (!targetRow) return;
    setTimeout(function () {
      targetRow.classList.add("highlight");
      if (typeof targetRow.scrollIntoView === "function") {
        targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setTimeout(function () { targetRow.classList.remove("highlight"); }, 2000);
    }, 60);
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      var q = searchInput.value.trim().toLowerCase();
      if (!q) { hideResults(); return; }
      var matches = EMPLOYEES.filter(function (e) {
        var name = (e.firstName + " " + e.lastName).toLowerCase();
        return name.indexOf(q) !== -1 || e.workEmail.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 12);
      if (matches.length === 0) {
        resultsBox.innerHTML = '<div class="no-match">No one matches &ldquo;' + escapeText(searchInput.value) + '&rdquo;</div>';
      } else {
        resultsBox.innerHTML = matches.map(function (e) {
          return '<div class="search-result" data-jump="' + escapeText(e.workEmail) + '">' +
            '<div class="search-result-name">' + escapeText(e.firstName + " " + e.lastName) + '</div>' +
            '<div class="search-result-sub">' + escapeText((e.designation || "") + " \\u00b7 " + e.workEmail) + '</div>' +
          '</div>';
        }).join("");
        resultsBox.querySelectorAll("[data-jump]").forEach(function (el) {
          el.addEventListener("click", function () {
            jumpTo(el.getAttribute("data-jump"));
            searchInput.value = "";
            hideResults();
          });
        });
      }
      resultsBox.style.display = "block";
    });
    document.addEventListener("click", function (e) {
      if (e.target !== searchInput && !resultsBox.contains(e.target)) hideResults();
    });
  }

  var resetBtn = document.getElementById("reset-view");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      document.querySelectorAll("details").forEach(function (d) { d.open = false; });
      var mainRoot = document.querySelector("[data-main-root]");
      if (mainRoot) mainRoot.open = true;
      state.department = null;
      state.company = null;
      if (companySelect) companySelect.value = "";
      state.hideInterns = false;
      if (hideInternsBox) hideInternsBox.checked = false;
      if (searchInput) searchInput.value = "";
      hideResults();
      applyVisibility();
    });
  }

  // Seed state from whatever the controls actually show, then apply once —
  // browsers restore <input type=checkbox>/<select> values across reload and
  // back-forward navigation, but state above always starts out all-null.
  // Without this, a reload with "Hide interns" checked (or a company
  // already selected) showed everyone anyway, checkbox/dropdown and tree
  // disagreeing until the control was toggled twice.
  if (hideInternsBox) state.hideInterns = hideInternsBox.checked;
  if (companySelect) state.company = companySelect.value || null;
  applyVisibility();
})();
`;

export function buildOrgChartHtml(
  tree: OrgChartTree,
  employees: readonly EmployeeDirectoryRecord[],
  stats: readonly DepartmentStat[],
  avatarByEmail: ReadonlyMap<string, string> = new Map(),
  companies: readonly string[] = [],
): string {
  const generated = new Date().toLocaleString();
  const strays =
    tree.strayRoots.length > 0
      ? `<div class="strays">
          <span class="strays-note">${tree.strayRoots.length} more, reporting to a manager who has left the company:</span>
          ${tree.strayRoots.map((stray) => renderNode(stray, true, false, avatarByEmail)).join("")}
        </div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Org chart</title>
<style>${STYLE}</style>
</head>
<body>
<div class="page">
  <div class="banner">
    <div class="banner-text">
      <span class="eyebrow">Organization Chart</span>
      <p class="subtitle">Company reporting hierarchy · exported from One WSO2 on ${escapeHtml(generated)}</p>
    </div>
    <div class="banner-logo">${LOGO_SVG}</div>
  </div>
  <div class="layout">
    <aside class="sidebar">
      <div class="stats">
        <div class="stat"><div class="stat-value">${employees.length}</div><div class="stat-label">in directory</div></div>
        <div class="stat"><div class="stat-value">${stats.length}</div><div class="stat-label">teams</div></div>
      </div>
      <div class="search-box">
        <input class="search-input" id="search-input" type="text" placeholder="Find a person by name or email…" autocomplete="off">
        <div class="search-results" id="search-results"></div>
      </div>
      ${renderCompanySelect(companies)}
      <div class="controls">
        <button type="button" class="btn" id="expand-all">Expand all</button>
        <button type="button" class="btn" id="reset-view">Reset view</button>
      </div>
      <label class="hide-interns-row"><input type="checkbox" id="hide-interns" autocomplete="off"> Hide interns</label>
      ${renderLegend(stats)}
    </aside>
    <main class="tree-card">
      ${renderNode(tree.root, true, true, avatarByEmail)}
      ${strays}
    </main>
  </div>
</div>
<script>
var EMPLOYEES = ${embedJson(employees)};
${SCRIPT}
</script>
</body>
</html>`;
}

/** Builds the file and triggers a browser download — no server round trip.
 *  Recomputes the tree/stats from the raw directory here (rather than
 *  reusing OrgChartPage's memoized ones) so this stays a pure function of
 *  "the full directory", independent of whatever filter is active on screen.
 *  Async: fetches and downscales every available photo first (see
 *  buildAvatarMap) while the caller is still authenticated — that's the
 *  part that takes real time for 900+ employees, everything else is
 *  synchronous string-building. */
export async function downloadOrgChartHtml(employees: readonly EmployeeDirectoryRecord[]): Promise<void> {
  const tree = buildOrgTree(employees);
  // Throw rather than return silently — the caller (OrgChartPage) needs to
  // tell "no root in the directory" apart from a real failure (network, an
  // OOM building the data-URI string, ...) instead of both looking like
  // nothing happened.
  if (!tree) throw new Error("Couldn't find the company's root (Chairman) in the directory.");
  const stats = departmentStats(employees.map((employee) => ({ department: employee.team })));
  const companies = companyNames(employees);
  const avatarByEmail = await buildAvatarMap(employees);
  const html = buildOrgChartHtml(tree, employees, stats, avatarByEmail, companies);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `organization-chart-${new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "").replace("T", "_")}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Next macrotask, not synchronous — Safari has been observed to start
  // reading the blob after the current task finishes, so revoking in the
  // same tick produces a silently empty file. Same fix as
  // features/marketing-ops/events/lib/download.ts.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
