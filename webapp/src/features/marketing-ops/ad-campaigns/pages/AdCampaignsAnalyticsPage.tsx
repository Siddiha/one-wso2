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

import { useCallback, useState } from "react";
import { Box, IconButton, Tooltip, Typography } from "@wso2/oxygen-ui";
import { RefreshCw } from "@wso2/oxygen-ui-icons-react";
import { MARKETING_OPS_EYEBROW } from "@constants/marketingOpsApps";
import MarketingOpsShell from "../../components/MarketingOpsShell";
import {
  roiSupported as isRoiSupported,
  useAdDashboard,
  useLinkedInRoiReport,
  useRoiOptions,
  useRoiReport,
} from "../../api/useAdAnalytics";
import type { AdPlatform, DateWindow, GroupByDim } from "../analytics/adAnalyticsTypes";
import DateRangePicker from "../analytics/components/DateRangePicker";
import MarketingDashboard from "../analytics/components/MarketingDashboard";
import RoiReporting from "../analytics/components/RoiReporting";
import LinkedInRoiReporting from "../analytics/components/LinkedInRoiReporting";
import { FieldLabel, ToggleChip } from "../analytics/components/AnalyticsPrimitives";

// Ad Campaigns → Analytics: a deck-style Marketing Dashboard and a Campaign ROI
// report, two lenses on the same paid-ad data.
//
// There is no "Generate" button. Changing the platform, date range or breakdown
// re-runs the affected report automatically, and React Query serves a selection
// you've already viewed from cache — so flipping between two ranges is instant
// after the first look at each. Refresh forces fresh numbers for the current
// selection, which matters because ad and Salesforce data are live.
//
// All three reports live at THIS level rather than inside the tabs, so switching
// tabs never triggers a fetch and never discards a result.

type Tab = "Dashboard" | "ROI";

const PLATFORMS: { key: AdPlatform; label: string }[] = [
  { key: "google", label: "Google Ads" },
  { key: "linkedin", label: "LinkedIn" },
];

const DEFAULT_WINDOW: DateWindow = { mode: "preset", preset: "1m" };

export default function AdCampaignsAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [platform, setPlatform] = useState<AdPlatform>("google");
  const [window, setWindow] = useState<DateWindow>(DEFAULT_WINDOW);
  const [groupBy, setGroupByState] = useState<GroupByDim>("campaign");
  const [secondGroupBy, setSecondGroupBy] = useState<GroupByDim | null>(null);
  // Top-level ROI filters (Google only — see roiOptions). Empty = no filter.
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string[]>([]);

  // Changing the primary breakdown can't leave a "Then by" selection pointing at
  // the same dimension — reset it rather than allow a duplicate/invalid combo.
  const setGroupBy = useCallback((g: GroupByDim) => {
    setGroupByState(g);
    setSecondGroupBy((prev) => (prev === g ? null : prev));
  }, []);

  // Selector options (regions/products actually present in the data) for the
  // ROI tab's multi-select filters — fetched once, not tied to a selection.
  const roiOptions = useRoiOptions();

  // Each hook decides for itself whether it should fetch — the LinkedIn report
  // stays idle on Google and vice versa (see `enabled` in useAdAnalytics), so
  // switching platform doesn't fire a request for the platform you just left.
  const dashboard = useAdDashboard(platform, window);
  const roi = useRoiReport(platform, window, groupBy, secondGroupBy, regionFilter, productFilter);
  const linkedInRoi = useLinkedInRoiReport(platform, window);

  const roiSupported = isRoiSupported(platform);
  const refreshing = dashboard.isFetching || roi.isFetching || linkedInRoi.isFetching;

  // Refresh re-fetches whatever the current selection actually uses. Refetching
  // an idle query is a no-op, so this doesn't wake the platform's unused report.
  const refresh = () => {
    void dashboard.refetch();
    if (roiSupported) void roi.refetch();
    if (platform === "linkedin") void linkedInRoi.refetch();
  };

  return (
    <MarketingOpsShell
      eyebrow={MARKETING_OPS_EYEBROW.adCampaigns}
      title="Analytics"
      subtitle="Paid-ad performance across Google Ads and LinkedIn, with the Salesforce funnel and ROI for Google. Every figure is computed on demand — nothing here is stored."
    >
      {/* Shared controls. Platform and date range drive all three reports; the
          ROI breakdown selector lives inside the ROI tab because it only affects
          that report. */}
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2.5, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 3, flexWrap: "wrap" }}>
          <Box>
            <FieldLabel>Platform</FieldLabel>
            <Box sx={{ display: "flex", gap: 1 }}>
              {PLATFORMS.map(({ key, label }) => (
                <ToggleChip
                  key={key}
                  label={label}
                  active={platform === key}
                  onClick={() => setPlatform(key)}
                />
              ))}
            </Box>
          </Box>

          <DateRangePicker window={window} onChange={setWindow} />

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Refresh — fetch the latest data for this selection">
            <span>
              <IconButton
                onClick={refresh}
                disabled={refreshing}
                size="small"
                aria-label="Refresh reports"
                sx={{
                  color: "primary.main",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    ...(refreshing && {
                      animation: "mopsSpin 0.8s linear infinite",
                      "@keyframes mopsSpin": { to: { transform: "rotate(360deg)" } },
                    }),
                  }}
                >
                  <RefreshCw size={17} />
                </Box>
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          mb: 3,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {(["Dashboard", "ROI"] as Tab[]).map((label) => {
          const active = activeTab === label;
          return (
            <Box
              key={label}
              component="button"
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(label)}
              sx={{
                px: 2,
                py: 1.25,
                border: 0,
                bgcolor: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? "primary.main" : "text.secondary",
                position: "relative",
                transition: "color .12s ease",
                "&:hover": { color: active ? "primary.main" : "text.primary" },
                "&::after": active
                  ? {
                      content: '""',
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: -1,
                      height: 3,
                      borderRadius: "2px 2px 0 0",
                      bgcolor: "primary.main",
                    }
                  : {},
              }}
            >
              {label}
            </Box>
          );
        })}
      </Box>

      {activeTab === "Dashboard" && <MarketingDashboard query={dashboard} />}

      {/* The ROI tab is platform-specific: Google is the UTM campaign ↔ Salesforce
          join; LinkedIn is the BU-first report, because LinkedIn has no UTM. */}
      {activeTab === "ROI" &&
        (platform === "linkedin" ? (
          <LinkedInRoiReporting query={linkedInRoi} />
        ) : (
          <RoiReporting
            query={roi}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            secondGroupBy={secondGroupBy}
            onSecondGroupBy={setSecondGroupBy}
            regionFilter={regionFilter}
            onRegionFilter={setRegionFilter}
            productFilter={productFilter}
            onProductFilter={setProductFilter}
            roiOptions={roiOptions.data}
            roiSupported={roiSupported}
            platform={platform}
          />
        ))}

      <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 4 }}>
        Internal @wso2.com leads are excluded from every figure.
      </Typography>
    </MarketingOpsShell>
  );
}
