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

import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@wso2/oxygen-ui";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { describeError } from "@api/errors";
import type {
  Dashboard,
  DashConvType,
  DashCrossTab,
  DashOpportunities,
  DashSpendBreakdown,
  FunnelData,
} from "../adAnalyticsTypes";
import { ACCENT, CHART_COLORS, colorFor, num, pct, usd } from "../chartTheme";
import {
  EmptyHint,
  ReportLoading,
  SectionTitle,
  StatCard,
  StripLabel,
} from "./AnalyticsPrimitives";
import { useTableSx } from "./useChartStyles";

// The deck-style Marketing Dashboard. Two shapes behind one component:
//
//   Google   — the full UTM-joined view: funnel, conversions, opportunities
//   LinkedIn — performance only (meta.performance_only), because LinkedIn ads
//              carry no utm_campaign to join Salesforce on
//
// While a report is running the PREVIOUS one is cleared rather than left on
// screen. That's intentional: these numbers are captioned by a date range and a
// platform, and showing last selection's figures under the new selection's
// controls invites reading them as current.

const DASH_LOADING = [
  "Generating the dashboard…",
  "Fetching ad spend & Salesforce data…",
  "Almost there…",
] as const;

export default function MarketingDashboard({
  query,
}: {
  query: {
    data?: Dashboard;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };
}) {
  if (query.isLoading) return <ReportLoading messages={DASH_LOADING} />;
  if (query.isError) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {describeError(query.error)}
      </Alert>
    );
  }
  if (!query.data) return <EmptyHint>Pick a date range to see the dashboard.</EmptyHint>;

  const { meta, sections: s, match_quality: mq } = query.data;

  return (
    <Box>
      {/* Window + attribution strip — what this data covers, and how much of it
          actually joined. A dashboard whose match rate quietly dropped is the
          failure mode worth surfacing at the top. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          {meta.window_start} → {meta.window_end} ·{" "}
          {meta.platform === "linkedin" ? "LinkedIn" : "Google Ads"}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "text.disabled", fontVariantNumeric: "tabular-nums" }}>
          {meta.performance_only ? (
            `${num(mq.campaigns_in_window)} campaigns`
          ) : (
            <>
              {mq.leads_matched}/{mq.leads_total} leads attributed
              {mq.match_rate != null && ` · ${(mq.match_rate * 100).toFixed(0)}% match`}
            </>
          )}
        </Typography>
      </Box>

      {meta.performance_only ? (
        <PerformanceDashboard s={s} />
      ) : (
        <GoogleDashboard s={s} />
      )}
    </Box>
  );
}

// ── Google: the full UTM-joined dashboard ─────────────────────────────────────
function GoogleDashboard({ s }: { s: Dashboard["sections"] }) {
  // The Salesforce-derived sections are optional in the type because LinkedIn
  // omits them. On the Google path the backend always sends them, but a missing
  // one should degrade to a note rather than crash the page — this component
  // renders numbers people make budget decisions from, and a blank screen is
  // worse than a partial one.
  // The note said "the ad-spend figures below are still accurate" and then returned,
  // so there was nothing below it — a warning on an empty page, which is the blank
  // screen the comment above set out to avoid. It now renders alongside the sections
  // that don't depend on the funnel, which is what it always claimed to do.
  //
  // Overview needs funnel counts (it reconciles its numbers against the funnel
  // chart), so the funnel-less path borrows PerfOverview — the same header the
  // LinkedIn dashboard uses, which is exactly the "performance without Salesforce"
  // case this degrades to.
  return (
    <Box>
      {!s.funnel && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This dashboard is missing its Salesforce funnel data. The ad-spend figures below are
          still accurate; the funnel, conversion and opportunity sections need a re-run.
        </Alert>
      )}

      {s.funnel ? <Overview o={s.overview} funnel={s.funnel} /> : <PerfOverview o={s.overview} />}

      {s.funnel && (
        <>
          <SectionTitle>Conversion funnel</SectionTitle>
          <FunnelView data={s.funnel} />
        </>
      )}

      <SectionTitle>Spend breakdown</SectionTitle>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <SpendCrossPie
          title="By business unit"
          base={s.spend_by_product}
          cross={s.spend_by_bu_region}
          axis="colFixed"
          options={s.spend_by_bu_region.cols}
          filterLabel="region"
        />
        <SpendCrossPie
          title="By region"
          base={s.spend_by_region}
          cross={s.spend_by_bu_region}
          axis="rowFixed"
          options={s.spend_by_bu_region.rows}
          filterLabel="business unit"
        />
      </Box>

      {(s.conversions_by_type || s.conversions_by_region || s.conversions_by_product) && (
        <>
          <SectionTitle>Conversions</SectionTitle>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", md: "repeat(3,1fr)" },
              gap: 2,
            }}
          >
            {s.conversions_by_type && <ConvBreakdown title="By source" data={s.conversions_by_type} />}
            {s.conversions_by_region && (
              <ConvBreakdown title="By region" data={s.conversions_by_region} />
            )}
            {s.conversions_by_product && (
              <ConvBreakdown title="By business unit" data={s.conversions_by_product} />
            )}
          </Box>
        </>
      )}

      {s.opportunities && s.opportunities.rows.length > 0 && (
        <>
          <SectionTitle>Opportunities</SectionTitle>
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mb: 1.5, mt: -0.75 }}>
            Converted from leads created in this window — the same cohort as the funnel and
            Campaign ROI.
          </Typography>
          <Opportunities data={s.opportunities} />
        </>
      )}
    </Box>
  );
}

// ── LinkedIn: performance only (no Salesforce join) ───────────────────────────
function PerformanceDashboard({ s }: { s: Dashboard["sections"] }) {
  return (
    <Box>
      <PerfOverview o={s.overview} />

      <SectionTitle>Spend breakdown</SectionTitle>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <SpendCrossPie
          title="By business unit"
          base={s.spend_by_product}
          cross={s.spend_by_bu_region}
          axis="colFixed"
          options={s.spend_by_bu_region.cols}
          filterLabel="region"
        />
        <SpendCrossPie
          title="By region"
          base={s.spend_by_region}
          cross={s.spend_by_bu_region}
          axis="rowFixed"
          options={s.spend_by_bu_region.rows}
          filterLabel="business unit"
        />
      </Box>

      {s.campaign_performance && (
        <>
          <SectionTitle>Campaign performance</SectionTitle>
          <CampaignPerformance data={s.campaign_performance} />
        </>
      )}
    </Box>
  );
}

function PerfOverview({ o }: { o: Dashboard["sections"]["overview"] }) {
  const { chrome } = useTableSx();
  return (
    <Box>
      <StripLabel>Spend &amp; traffic</StripLabel>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(3,1fr)", md: "repeat(6,1fr)" },
          gap: 1.25,
        }}
      >
        <StatCard label="Spend" value={usd(o.spend)} accent={ACCENT} />
        <StatCard label="Impressions" value={num(o.impressions)} accent={chrome.accentBar} />
        <StatCard label="Clicks" value={num(o.clicks)} accent={chrome.accentBar} />
        <StatCard label="CTR" value={pct(o.ctr)} accent={chrome.accentBar} />
        <StatCard label="Avg. CPC" value={usd(o.avg_cpc)} accent={chrome.accentBar} />
        <StatCard label="Conversions" value={num(o.conversions)} accent={CHART_COLORS[2]} />
      </Box>
    </Box>
  );
}

function Overview({ o, funnel }: { o: Dashboard["sections"]["overview"]; funnel: FunnelData }) {
  const { chrome } = useTableSx();
  // Funnel counts come from the funnel section's own overall cut, not from the
  // overview's separate fields, so every stage reconciles with the funnel chart
  // below. The two are computed independently upstream and can disagree.
  const counts = funnel.overall.counts;
  return (
    <Box>
      <StripLabel>Funnel · events in this period</StripLabel>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(4,1fr)", md: "repeat(7,1fr)" },
          gap: 1.25,
        }}
      >
        {funnel.stages.map((stage, i) => (
          <StatCard
            key={stage}
            label={funnel.labels[stage] ?? stage}
            value={num(counts[stage])}
            accent={CHART_COLORS[i % CHART_COLORS.length]}
          />
        ))}
        <StatCard label="Pipeline ARR" value={usd(o.pipeline_arr)} accent={CHART_COLORS[2]} />
      </Box>

      <Box sx={{ mt: 1 }}>
        <StripLabel>Spend &amp; traffic</StripLabel>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(3,1fr)", md: "repeat(5,1fr)" },
          gap: 1.25,
        }}
      >
        <StatCard label="Spend" value={usd(o.spend)} accent={ACCENT} />
        <StatCard label="Impressions" value={num(o.impressions)} accent={chrome.accentBar} />
        <StatCard label="Clicks" value={num(o.clicks)} accent={chrome.accentBar} />
        <StatCard label="CTR" value={pct(o.ctr)} accent={chrome.accentBar} />
        <StatCard label="Avg. CPC" value={usd(o.avg_cpc)} accent={chrome.accentBar} />
      </Box>
    </Box>
  );
}

// ── conversion funnel (cohort drop-off + stage velocity) ──────────────────────
const EMPTY_CUT: FunnelData["overall"] = { counts: {}, conv: {}, velocity_days: {}, total: 0 };

// Which pre-computed cut to show. The backend sends four: overall, by BU, by
// region, and the BU×region cross — so filtering never recomputes client-side and
// the numbers always match what the engine produced.
function pickCut(data: FunnelData, bu: string, region: string): FunnelData["overall"] {
  if (bu !== "all" && region !== "all") return data.by_bu_region[`${bu}||${region}`] ?? EMPTY_CUT;
  if (bu !== "all") return data.by_bu[bu] ?? EMPTY_CUT;
  if (region !== "all") return data.by_region[region] ?? EMPTY_CUT;
  return data.overall;
}

function FunnelView({ data }: { data: FunnelData }) {
  const [bu, setBu] = useState("all");
  const [region, setRegion] = useState("all");
  const cut = pickCut(data, bu, region);
  // Bar widths are relative to the first stage. `|| 1` guards a zero-lead cut
  // (a BU×region combination with no leads) from dividing by zero.
  const leadCount = cut.counts[data.stages[0]] || 1;

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2.5,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
          Leads created in this period, by the deepest funnel stage they reached.
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Select
            size="small"
            value={bu}
            onChange={(e) => setBu(String(e.target.value))}
            aria-label="Filter by business unit"
            sx={{ fontSize: 12.5, minWidth: 190 }}
          >
            <MenuItem value="all" sx={{ fontSize: 12.5 }}>
              All business units
            </MenuItem>
            {data.bus.map((b) => (
              <MenuItem key={b} value={b} sx={{ fontSize: 12.5 }}>
                {b} · {num(data.by_bu[b]?.counts[data.stages[0]] ?? 0)}
              </MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={region}
            onChange={(e) => setRegion(String(e.target.value))}
            aria-label="Filter by region"
            sx={{ fontSize: 12.5, minWidth: 150 }}
          >
            <MenuItem value="all" sx={{ fontSize: 12.5 }}>
              All regions
            </MenuItem>
            {data.regions.map((r) => (
              <MenuItem key={r} value={r} sx={{ fontSize: 12.5 }}>
                {r} · {num(data.by_region[r]?.counts[data.stages[0]] ?? 0)}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.1 }}>
        {data.stages.map((s, i) => {
          const count = cut.counts[s] ?? 0;
          // Floor at 3% so a stage with a handful of leads still shows a visible
          // bar rather than a hairline that reads as zero.
          const widthPct = Math.max(3, (count / leadCount) * 100);
          const conv = i > 0 ? cut.conv[s] : null;
          const vkey = i > 0 ? `${data.stages[i - 1]}_${s}` : null;
          const days = vkey ? cut.velocity_days[vkey] : null;
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <Box
              key={s}
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "96px 1fr", sm: "120px 1fr 150px" },
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 700, textAlign: "right" }}>
                {data.labels[s]}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    height: 30,
                    borderRadius: 0.75,
                    width: `${widthPct}%`,
                    minWidth: 6,
                    bgcolor: color,
                    transition: "width .45s ease",
                  }}
                />
                <Typography sx={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {num(count)}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: { xs: "none", sm: "flex" },
                  alignItems: "baseline",
                  gap: 1,
                }}
              >
                {conv != null ? (
                  <>
                    <Typography
                      sx={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: conv >= 50 ? "success.main" : "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {conv}%
                    </Typography>
                    {days != null && (
                      <Typography
                        sx={{ fontSize: 11, color: "text.disabled", fontVariantNumeric: "tabular-nums" }}
                      >
                        · {days}d avg
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography
                    sx={{
                      fontSize: 10.5,
                      color: "text.disabled",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    cohort
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 2 }}>
        % = conversion from the previous stage · d = average days between stages · SAL = Sales
        Accepted, SQL = Sales Qualified. Counts are cumulative (a lead that reached SQL also
        counts at MQL/SAL).
      </Typography>
    </Box>
  );
}

// Slice the BU×region spend cross-tab down to one dimension, holding the other
// fixed — this is how each spend pie gets a filter for the *other* dimension:
// "By business unit" fixes a region (colFixed) and yields one row per BU;
// "By region" fixes a business unit (rowFixed) and yields one row per region.
// Segments with zero spend under the fixed value are dropped rather than shown
// as empty pie slices.
function crossTabSlice(
  cross: DashCrossTab,
  axis: "rowFixed" | "colFixed",
  fixedValue: string,
): DashSpendBreakdown {
  const segments = axis === "rowFixed" ? cross.cols : cross.rows;
  const spendFor = (seg: string) =>
    axis === "rowFixed" ? (cross.matrix[fixedValue]?.[seg] ?? 0) : (cross.matrix[seg]?.[fixedValue] ?? 0);
  const total = (axis === "rowFixed" ? cross.row_totals[fixedValue] : cross.col_totals[fixedValue]) ?? 0;
  const rows = segments
    .map((seg) => ({
      label: seg,
      spend: spendFor(seg),
      clicks: 0,
      impressions: 0,
      ctr: null as number | null,
      pct: null as number | null,
    }))
    .filter((r) => r.spend > 0);
  rows.forEach((r) => {
    r.pct = total ? Math.round((r.spend / total) * 1000) / 10 : null;
  });
  rows.sort((a, b) => b.spend - a.spend);
  return { total_spend: total, rows };
}

// A spend pie with an optional filter on the *other* dimension of the BU×region
// cross-tab — e.g. the "By business unit" pie can be narrowed to one region.
function SpendCrossPie({
  title,
  base,
  cross,
  axis,
  options,
  filterLabel,
}: {
  title: string;
  base: DashSpendBreakdown;
  cross: DashCrossTab;
  axis: "rowFixed" | "colFixed";
  options: string[];
  filterLabel: string;
}) {
  const [filter, setFilter] = useState<string>("all");
  // Falls back to "all" if a dashboard refresh returns new `options` that no
  // longer include the current selection — otherwise crossTabSlice looks up a
  // matrix key that no longer exists and the chart renders empty instead of
  // recovering to the unfiltered view.
  const activeFilter = filter === "all" || options.includes(filter) ? filter : "all";
  const data = activeFilter === "all" ? base : crossTabSlice(cross, axis, activeFilter);
  return (
    <SpendPie
      title={title}
      data={data}
      headerExtra={
        <Select
          size="small"
          value={activeFilter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={`Filter ${title} by ${filterLabel}`}
          sx={{ fontSize: 11.5, minWidth: 150 }}
        >
          <MenuItem value="all" sx={{ fontSize: 11.5 }}>
            All {filterLabel}s
          </MenuItem>
          {options.map((o) => (
            <MenuItem key={o} value={o} sx={{ fontSize: 11.5 }}>
              {o}
            </MenuItem>
          ))}
        </Select>
      }
    />
  );
}

// ── spend pie (BU / region) — chart + companion table ─────────────────────────
function SpendPie({
  title,
  data,
  headerExtra,
}: {
  title: string;
  data: DashSpendBreakdown;
  headerExtra?: ReactNode;
}) {
  const { cell, hdr } = useTableSx();
  // Memoised so the array identity is stable across re-renders. Without it
  // Recharts sees a "new" dataset every render and replays its entry animation,
  // making the chart blink as though it refreshed when nothing changed.
  const chartData = useMemo(
    () => data.rows.map((r) => ({ name: r.label, value: r.spend, pct: r.pct })),
    [data.rows],
  );
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.25, p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "text.secondary" }}>
          {title}
        </Typography>
        {headerExtra}
      </Box>
      <Box sx={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={(e: { name?: string; pct?: number | null }) =>
                e.pct != null ? `${e.name} ${e.pct}%` : (e.name ?? "")
              }
              labelLine={false}
              isAnimationActive={false}
              style={{ fontSize: 11 }}
            >
              {chartData.map((d, i) => (
                <Cell key={d.name} fill={colorFor(d.name, i)} />
              ))}
            </Pie>
            <RTooltip formatter={(v) => usd(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      {/* The companion table is what makes the pie readable once segments get
          numerous or their colours repeat — exact labels and figures, in order. */}
      <Table size="small" sx={{ mt: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={hdr}>Segment</TableCell>
            <TableCell align="right" sx={hdr}>Spend</TableCell>
            <TableCell align="right" sx={hdr}>Share</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((r, i) => (
            <TableRow key={r.label}>
              <TableCell sx={{ ...cell, fontWeight: 600 }}>
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "2px",
                    mr: 0.75,
                    bgcolor: colorFor(r.label, i),
                  }}
                />
                {r.label}
              </TableCell>
              <TableCell align="right" sx={cell}>{usd(r.spend)}</TableCell>
              <TableCell align="right" sx={cell}>{r.pct == null ? "—" : `${r.pct}%`}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ ...cell, fontWeight: 700 }}>Total</TableCell>
            <TableCell align="right" sx={{ ...cell, fontWeight: 800, color: ACCENT }}>
              {usd(data.total_spend)}
            </TableCell>
            <TableCell align="right" sx={cell}>100%</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}

// ── conversions breakdown (by source / region / BU) ───────────────────────────
function ConvBreakdown({ title, data }: { title: string; data: DashConvType }) {
  const { cell, hdr } = useTableSx();
  const chartData = useMemo(
    () => data.rows.map((r) => ({ name: r.label, value: r.count, pct: r.pct })),
    [data.rows],
  );
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.25, p: 2 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "text.secondary", mb: 1 }}>
        {title} · {data.total} total
      </Typography>
      <Box sx={{ height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={78}
              isAnimationActive={false}
              style={{ fontSize: 11 }}
            >
              {chartData.map((d, i) => (
                <Cell key={d.name} fill={colorFor(d.name, i)} />
              ))}
            </Pie>
            <RTooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Table size="small" sx={{ mt: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={hdr}>Segment</TableCell>
            <TableCell align="right" sx={hdr}>Conversions</TableCell>
            <TableCell align="right" sx={hdr}>Share</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((r, i) => (
            <TableRow key={r.label}>
              <TableCell sx={{ ...cell, fontWeight: 600 }}>
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "2px",
                    mr: 0.75,
                    bgcolor: colorFor(r.label, i),
                  }}
                />
                {r.label}
              </TableCell>
              <TableCell align="right" sx={cell}>{num(r.count)}</TableCell>
              <TableCell align="right" sx={cell}>{r.pct == null ? "—" : `${r.pct}%`}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ ...cell, fontWeight: 700 }}>Total</TableCell>
            <TableCell align="right" sx={{ ...cell, fontWeight: 800, color: ACCENT }}>
              {num(data.total)}
            </TableCell>
            <TableCell align="right" sx={cell}>100%</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}

// ── LinkedIn per-campaign performance table ───────────────────────────────────
function CampaignPerformance({
  data,
}: {
  data: NonNullable<Dashboard["sections"]["campaign_performance"]>;
}) {
  const { cell, hdr } = useTableSx();
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.25, overflowX: "auto" }}>
      <Table size="small" sx={{ minWidth: 860 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={hdr}>Campaign</TableCell>
            <TableCell sx={hdr}>BU</TableCell>
            <TableCell sx={hdr}>Region</TableCell>
            <TableCell align="right" sx={hdr}>Spend</TableCell>
            <TableCell align="right" sx={hdr}>Impressions</TableCell>
            <TableCell align="right" sx={hdr}>Clicks</TableCell>
            <TableCell align="right" sx={hdr}>CTR</TableCell>
            <TableCell align="right" sx={hdr}>Avg. CPC</TableCell>
            <TableCell align="right" sx={hdr}>Conv.</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((r) => (
            <TableRow key={r.campaign_id}>
              <TableCell sx={{ ...cell, fontWeight: 600, whiteSpace: "normal", minWidth: 220 }}>
                {r.campaign_name ?? r.campaign_id}
              </TableCell>
              <TableCell sx={cell}>{r.product ?? "—"}</TableCell>
              <TableCell sx={cell}>{r.region ?? "—"}</TableCell>
              <TableCell align="right" sx={{ ...cell, fontWeight: 700 }}>{usd(r.spend)}</TableCell>
              <TableCell align="right" sx={cell}>{num(r.impressions)}</TableCell>
              <TableCell align="right" sx={cell}>{num(r.clicks)}</TableCell>
              <TableCell align="right" sx={cell}>{pct(r.ctr)}</TableCell>
              <TableCell align="right" sx={cell}>{usd(r.avg_cpc)}</TableCell>
              <TableCell align="right" sx={cell}>{num(r.conversions)}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ ...cell, fontWeight: 700 }}>Total</TableCell>
            <TableCell sx={cell} />
            <TableCell sx={cell} />
            <TableCell align="right" sx={{ ...cell, fontWeight: 800, color: ACCENT }}>
              {usd(data.total_spend)}
            </TableCell>
            <TableCell colSpan={5} sx={cell} />
          </TableRow>
        </TableBody>
      </Table>
      <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: "divider" }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          {data.count} campaign{data.count === 1 ? "" : "s"} with activity in this window.
        </Typography>
      </Box>
    </Box>
  );
}

// ── opportunities table ───────────────────────────────────────────────────────
function Opportunities({ data }: { data: DashOpportunities }) {
  const { cell, hdr } = useTableSx();
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.25, overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={hdr}>Account</TableCell>
            <TableCell sx={hdr}>Opportunity</TableCell>
            <TableCell align="right" sx={hdr}>ARR</TableCell>
            <TableCell sx={hdr}>Stage</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {/* Keyed by index: these rows carry no id, and the list is a read-only
              snapshot that is replaced wholesale on each run. */}
          {data.rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell sx={{ ...cell, fontWeight: 600 }}>{r.account ?? "—"}</TableCell>
              <TableCell sx={cell}>{r.name ?? "—"}</TableCell>
              <TableCell align="right" sx={{ ...cell, fontWeight: 700 }}>
                {r.arr ? usd(r.arr) : "—"}
              </TableCell>
              <TableCell sx={cell}>{r.stage ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          justifyContent: "space-between",
          borderTop: 1,
          borderColor: "divider",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          {data.count} opportunit{data.count === 1 ? "y" : "ies"}
          {data.truncated ? ` (showing top ${data.rows.length})` : ""}
        </Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          Total ARR: {usd(data.total_arr)}
        </Typography>
      </Box>
    </Box>
  );
}
