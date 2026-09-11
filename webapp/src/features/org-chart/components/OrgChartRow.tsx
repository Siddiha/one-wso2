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

// One indented row in the outline, and its own children rendered recursively
// below it. Open/closed visibility is lifted to OrgChartPage (`openEmails` +
// `onToggle`) so Expand all / Reset view can act on every row at once.
//
// Unlike the original four-endpoint contract, `node.children` is always
// fully resolved here — the whole directory loads in one request (see
// useEmployeeDirectory + buildOrgTree), so there's no per-row fetch, no
// "trusted children" ambiguity, and no reliance on a subordinateCount the
// new endpoint doesn't even send.

import { Avatar, Box, Chip, IconButton, Stack, Typography } from "@wso2/oxygen-ui";
import { ChevronRightIcon } from "@wso2/oxygen-ui-icons-react";
import { departmentColor } from "../util/departmentColors";
import type { OrgChartNode } from "../api/orgChartTypes";

export interface OrgChartRowProps {
  node: OrgChartNode;
  depth: number;
  openEmails: Set<string>;
  onToggle: (workEmail: string) => void;
  /** Restricts which children render at all — null means no filter (show
   *  everyone); otherwise only a child whose workEmail is in this set is
   *  rendered, which cuts out whole unrelated branches (see OrgChartPage's
   *  visibleEmails) rather than just dimming them. */
  visibleEmails: Set<string> | null;
  hideInterns: boolean;
  highlightEmail?: string;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

export default function OrgChartRow({
  node,
  depth,
  openEmails,
  onToggle,
  visibleEmails,
  hideInterns,
  highlightEmail,
}: OrgChartRowProps) {
  const isOpen = openEmails.has(node.workEmail);
  const hasReports = node.children.length > 0;

  // Filtered here (the parent), not by each child deciding to hide itself —
  // that way a manager whose entire visible team is filtered out can still
  // say so, instead of silently rendering nothing. depth 0 (the root) is
  // never filtered — it isn't reached through this list, it's rendered
  // directly by the page. A child failing the visibleEmails check is cut
  // entirely (its whole branch, not just itself) — see OrgChartPage's
  // visibleEmails comment for why that's safe: it only ever excludes
  // branches with nobody in the isolated department anywhere underneath.
  const visibleChildren = node.children.filter(
    (child) =>
      (!visibleEmails || visibleEmails.has(child.workEmail)) && (!hideInterns || child.designation !== "Intern"),
  );

  const isHighlighted = highlightEmail === node.workEmail;
  const metaParts = [node.businessUnit, node.team].filter((part): part is string => !!part);

  return (
    <Box>
      <Box
        data-work-email={node.workEmail}
        onClick={() => hasReports && onToggle(node.workEmail)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 0.5,
          px: 1,
          borderRadius: 1,
          cursor: hasReports ? "pointer" : "default",
          bgcolor: isHighlighted ? "action.selected" : "transparent",
          transition: "background-color 120ms ease",
          "&:hover": hasReports ? { bgcolor: "action.hover" } : undefined,
        }}
      >
        <IconButton
          size="small"
          disabled={!hasReports}
          aria-label={hasReports ? "Toggle reports" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.workEmail);
          }}
          sx={{ width: 26, height: 26, flexShrink: 0, visibility: hasReports ? "visible" : "hidden" }}
        >
          <ChevronRightIcon
            size={16}
            style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}
          />
        </IconButton>

        <Avatar
          alt={node.firstName}
          src={node.employeeThumbnail || undefined}
          // Google-hosted thumbnails 403 (which Chrome then reports as an
          // opaque net::ERR_BLOCKED_BY_ORB, no status visible) unless the
          // default Referer is suppressed — see EmployeeAvatar.tsx, which
          // hit and fixed this same thing first.
          imgProps={{ referrerPolicy: "no-referrer" }}
          sx={{
            width: 30,
            height: 30,
            fontSize: 12,
            fontWeight: 700,
            bgcolor: departmentColor(node.team),
          }}
        >
          {initials(node.firstName, node.lastName)}
        </Avatar>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {node.firstName} {node.lastName}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {node.designation}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>
            {node.workEmail}
            {metaParts.length > 0 ? ` · ${metaParts.join(" / ")}` : ""}
          </Typography>
        </Box>

        {hasReports && (
          <Chip
            size="small"
            variant="outlined"
            label={`${node.children.length} report${node.children.length === 1 ? "" : "s"}`}
            sx={{ flexShrink: 0 }}
          />
        )}
      </Box>

      {hasReports && isOpen && (
        <Box sx={{ ml: 2.25, pl: 2, borderLeft: "1.5px solid", borderColor: "divider" }}>
          {visibleChildren.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ pl: 5, py: 0.5, display: "block" }}>
              All direct reports are hidden by filters.
            </Typography>
          ) : (
            visibleChildren.map((child) => (
              <OrgChartRow
                key={child.workEmail}
                node={child}
                depth={depth + 1}
                openEmails={openEmails}
                onToggle={onToggle}
                visibleEmails={visibleEmails}
                hideInterns={hideInterns}
                highlightEmail={highlightEmail}
              />
            ))
          )}
        </Box>
      )}
    </Box>
  );
}
