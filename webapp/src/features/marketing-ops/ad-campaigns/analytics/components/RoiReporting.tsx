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

import { Fragment, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { ChevronsDownUp, ChevronsUpDown, Download } from "@wso2/oxygen-ui-icons-react";
import { describeError } from "@api/errors";
import {
  downloadCsv,
  roiReportToCsv,
  type GroupByDim,
  type RoiOptions,
  type RoiReport,
  type RoiRow,
  type RoiTotals,
} from "../adAnalyticsTypes";
import { ACCENT, num, perDollar, usd } from "../chartTheme";
import {
  EmptyHint,
  FieldLabel,
  MultiSelectFilter,
  ReportLoading,
  StatCard,
  ToggleChip,
} from "./AnalyticsPrimitives";
import { useTableSx } from "./useChartStyles";

// Campaign ROI — the Google Ads ↔ Salesforce join keyed on utm_campaign.
//
// The load-bearing subtlety in this view is SHARED SPEND. When a campaign maps to
// several rows (e.g. grouped by region, but the campaign spans regions), the
// campaign's spend is shown against each row rather than split — so the spend
// column deliberately does NOT sum to the total. The engine computes totals
// independently. Both the asterisk footnote and the fact that TotalRow reads
// `report.totals` rather than summing exist to keep someone from adding up the
// column and concluding the total is wrong.

const ROI_LOADING = [
  "Generating the ROI report…",
  "Joining ad spend to Salesforce…",
  "Almost there…",
] as const;

const GROUP_BY: { key: GroupByDim; label: string }[] = [
  { key: "campaign", label: "Campaign" },
  { key: "region", label: "Region" },
  { key: "product", label: "Business unit" },
  { key: "lead_source_detail", label: "Lead source" },
];

const DIM_LABEL: Record<string, string> = {
  campaign: "Campaign",
  region: "Region",
  product: "Business unit",
  lead_source_detail: "Lead source",
};

export default function RoiReporting({
  query,
  groupBy,
  onGroupBy,
  secondGroupBy,
  onSecondGroupBy,
  regionFilter,
  onRegionFilter,
  productFilter,
  onProductFilter,
  roiOptions,
  roiSupported,
  platform,
}: {
  query: { data?: RoiReport; isLoading: boolean; isError: boolean; error: Error | null };
  groupBy: GroupByDim;
  onGroupBy: (g: GroupByDim) => void;
  secondGroupBy: GroupByDim | null;
  onSecondGroupBy: (g: GroupByDim | null) => void;
  regionFilter: string[];
  onRegionFilter: (v: string[]) => void;
  productFilter: string[];
  onProductFilter: (v: string[]) => void;
  roiOptions?: RoiOptions;
  roiSupported: boolean;
  platform: string;
}) {
  // Which of the two active breakdown levels subtotals are grouped by — a pure
  // display preference, not part of the fetch key (no re-fetch on change).
  // null = off (default): today's flat table, no subtotal rows.
  const [subtotalLevel, setSubtotalLevel] = useState<1 | 2 | null>(null);
  // When subtotaling, optionally hide the detail rows so only the subtotal
  // (and grand total) rows show — a quick way to scan just the group summaries.
  const [subtotalsCollapsed, setSubtotalsCollapsed] = useState(false);
  // Which subtotal-dimension values to show — empty means "show all". The
  // value set (and its meaning) is tied to which dim is being subtotaled, so a
  // stale selection from a different dim/breakdown must not carry over — reset
  // during render (React's "adjusting state when inputs change" pattern) when
  // the key changes, rather than in an effect, which would cost an extra render.
  const [selectedSubtotalValues, setSelectedSubtotalValues] = useState<string[]>([]);
  const [subtotalKey, setSubtotalKey] = useState([groupBy, secondGroupBy, subtotalLevel] as const);
  if (subtotalKey[0] !== groupBy || subtotalKey[1] !== secondGroupBy || subtotalKey[2] !== subtotalLevel) {
    setSubtotalKey([groupBy, secondGroupBy, subtotalLevel]);
    setSelectedSubtotalValues([]);
  }
  // LinkedIn ads expose no utm_campaign — a creative only references a post — so
  // there is nothing to attribute a lead back to a campaign by. This is a
  // structural limitation of the integration, not a missing feature, which is
  // why it gets an explanation rather than an empty state.
  if (!roiSupported) {
    return (
      <Box sx={{ border: 1, borderStyle: "dashed", borderColor: "divider", borderRadius: 1.5, p: 4, textAlign: "center" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 1 }}>
          Campaign ROI isn't available for{" "}
          {platform === "linkedin" ? "LinkedIn" : "this platform"}
        </Typography>
        <Typography
          sx={{ fontSize: 13, color: "text.secondary", maxWidth: 560, mx: "auto", lineHeight: 1.6 }}
        >
          ROI joins ad spend to Salesforce pipeline by <code>utm_campaign</code>. Google ads carry
          that value in their destination URL, but LinkedIn ads don't expose one, so leads can't be
          attributed back to a LinkedIn campaign. Switch to <strong>Google Ads</strong> for the ROI
          report, or see the <strong>Dashboard</strong> tab for LinkedIn ad performance.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Breakdown selector — ROI-local. Changing it re-runs ONLY this report
          (its own query key), not the dashboard. */}
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2.5, mb: 3 }}>
        {roiOptions && (roiOptions.products.length > 0 || roiOptions.regions.length > 0) && (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-end", mb: 2 }}>
            {roiOptions.products.length > 0 && (
              <MultiSelectFilter
                label="Business unit"
                options={roiOptions.products}
                selected={productFilter}
                onChange={onProductFilter}
              />
            )}
            {roiOptions.regions.length > 0 && (
              <MultiSelectFilter
                label="Region"
                options={roiOptions.regions}
                selected={regionFilter}
                onChange={onRegionFilter}
              />
            )}
          </Box>
        )}
        <FieldLabel>Break down by</FieldLabel>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          {GROUP_BY.map((g) => (
            <ToggleChip
              key={g.key}
              label={g.label}
              active={groupBy === g.key}
              onClick={() => onGroupBy(g.key)}
            />
          ))}
        </Box>
        <FieldLabel>Then by</FieldLabel>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <ToggleChip label="None" active={secondGroupBy === null} onClick={() => onSecondGroupBy(null)} />
          {GROUP_BY.filter((g) => g.key !== groupBy).map((g) => (
            <ToggleChip
              key={g.key}
              label={g.label}
              active={secondGroupBy === g.key}
              onClick={() => onSecondGroupBy(g.key)}
            />
          ))}
        </Box>
      </Box>

      {query.isLoading ? (
        <ReportLoading messages={ROI_LOADING} />
      ) : query.isError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {describeError(query.error)}
        </Alert>
      ) : query.data ? (
        <ResultsView
          report={query.data}
          subtotalLevel={subtotalLevel}
          setSubtotalLevel={setSubtotalLevel}
          subtotalsCollapsed={subtotalsCollapsed}
          setSubtotalsCollapsed={setSubtotalsCollapsed}
          selectedSubtotalValues={selectedSubtotalValues}
          setSelectedSubtotalValues={setSelectedSubtotalValues}
        />
      ) : (
        <EmptyHint>Pick a date range to see the report.</EmptyHint>
      )}
    </Box>
  );
}

function ResultsView({
  report,
  subtotalLevel,
  setSubtotalLevel,
  subtotalsCollapsed,
  setSubtotalsCollapsed,
  selectedSubtotalValues,
  setSelectedSubtotalValues,
}: {
  report: RoiReport;
  subtotalLevel: 1 | 2 | null;
  setSubtotalLevel: (l: 1 | 2 | null) => void;
  subtotalsCollapsed: boolean;
  setSubtotalsCollapsed: (c: boolean) => void;
  selectedSubtotalValues: string[];
  setSelectedSubtotalValues: (v: string[]) => void;
}) {
  const { cell, hdr } = useTableSx();
  const t = report.totals;
  const mq = report.match_quality;
  const rows = report.rows ?? [];
  const cfg = report.config_snapshot;

  // Dimension columns come from the rows, not the config: `group_by` changes the
  // shape of `dims` per run, and a row may carry dims the config didn't name.
  const dimKeys: string[] = [];
  rows.forEach((r) =>
    Object.keys(r.dims || {}).forEach((k) => {
      if (!dimKeys.includes(k)) dimKeys.push(k);
    }),
  );

  // Which funnel columns to show. Driven by the config the backend echoed back,
  // so the table matches the report that actually ran rather than our defaults.
  const funnel = new Set(
    cfg?.funnel_stages ?? ["lead", "mql", "sal", "sql", "opportunity", "closed_won"],
  );
  const anySharedSpend = rows.some((r) => r.spend_shared);

  // With two active breakdown levels, group the detail rows by whichever level
  // the user picked and insert a subtotal row after each group (before the
  // grand Total). A single-level breakdown renders exactly as before.
  const groupDims: string[] = cfg?.group_by ?? dimKeys;
  const hasSecondLevel = groupDims.length >= 2;
  const subtotalDim = hasSecondLevel && subtotalLevel ? groupDims[subtotalLevel - 1] : null;

  // The subtotal dimension's distinct values, offered as an optional filter —
  // picking none shows every group (the default); picking some shows only those.
  const subtotalValueOptions = subtotalDim
    ? Array.from(new Set(rows.map((r) => r.dims?.[subtotalDim] ?? "").filter((v) => v !== ""))).sort()
    : [];

  let bodyRows: ReactNode;
  let hiddenGroupCount = 0;
  if (subtotalDim) {
    // Two rows sharing the same value of a Salesforce-only dim but different
    // campaign-derived values each carry their own real spend (safe to sum);
    // two rows sharing the same campaign-derived value but different
    // Salesforce-only values carry an *identical* shared spend value repeated
    // (must dedupe, not sum) — see the backend engine's spend_shared rollup.
    const dedupeSpend = anySharedSpend && subtotalDim !== "lead_source_detail";
    const groups = new Map<string, RoiRow[]>();
    rows.forEach((r) => {
      const key = r.dims?.[subtotalDim] ?? "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    let entries = Array.from(groups.entries()).map(([key, groupRows]) => ({
      key,
      groupRows,
      subtotal: computeSubtotal(groupRows, dedupeSpend),
    }));
    if (selectedSubtotalValues.length > 0) {
      hiddenGroupCount =
        entries.length - entries.filter((e) => selectedSubtotalValues.includes(e.key)).length;
      entries = entries.filter((e) => selectedSubtotalValues.includes(e.key));
    }
    entries.sort((a, b) => b.subtotal.spend - a.subtotal.spend);
    bodyRows = entries.map(({ key, groupRows, subtotal }) => (
      <Fragment key={key}>
        {!subtotalsCollapsed &&
          groupRows.map((r, i) => (
            <ResultRow key={i} r={r} dimKeys={dimKeys} funnel={funnel} cell={cell} />
          ))}
        <SubtotalRow
          metrics={subtotal}
          dims={groupRows[0].dims ?? {}}
          subtotalDim={subtotalDim}
          dimKeys={dimKeys}
          funnel={funnel}
          bgcolor={hdr.bgcolor}
        />
      </Fragment>
    ));
  } else {
    bodyRows = rows.map((r, i) => <ResultRow key={i} r={r} dimKeys={dimKeys} funnel={funnel} cell={cell} />);
  }

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography sx={{ fontSize: 11, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          {report.window_start} → {report.window_end}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              `roi-report-${report.window_start}_${report.window_end}.csv`,
              roiReportToCsv(report),
            )
          }
          startIcon={<Download size={15} />}
          sx={{ fontSize: 12, fontWeight: 700, textTransform: "none" }}
        >
          Export CSV
        </Button>
      </Box>

      {t && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(3,1fr)", md: "repeat(6,1fr)" },
            gap: 1,
            mb: 2,
          }}
        >
          <StatCard label="Spend" value={usd(t.spend)} />
          <StatCard label="Leads" value={num(t.leads)} />
          <StatCard label="Opportunities" value={num(t.opportunities)} />
          <StatCard label="Open pipeline" value={usd(t.open_pipeline_value)} />
          <StatCard label="Won" value={usd(t.won_value)} />
          <StatCard label="Value / $" value={perDollar(t.value_per_dollar)} accent={ACCENT} />
        </Box>
      )}

      {mq && <MatchPanel mq={mq} />}

      {/* subtotal grouping — only meaningful with two active breakdown levels */}
      {hasSecondLevel && (
        <Box
          sx={{
            mb: 1.5,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          <Box>
            <FieldLabel>Sub-total by</FieldLabel>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <ToggleChip label="None" active={subtotalLevel === null} onClick={() => setSubtotalLevel(null)} />
              <ToggleChip
                label={DIM_LABEL[groupDims[0]] ?? groupDims[0]}
                active={subtotalLevel === 1}
                onClick={() => setSubtotalLevel(1)}
              />
              <ToggleChip
                label={DIM_LABEL[groupDims[1]] ?? groupDims[1]}
                active={subtotalLevel === 2}
                onClick={() => setSubtotalLevel(2)}
              />
            </Box>
          </Box>
          {subtotalDim && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end", flexWrap: "wrap" }}>
              {subtotalValueOptions.length > 0 && (
                <MultiSelectFilter
                  label="Show"
                  options={subtotalValueOptions}
                  selected={selectedSubtotalValues}
                  onChange={setSelectedSubtotalValues}
                  emptyLabel={`All ${DIM_LABEL[subtotalDim] ?? subtotalDim}`}
                  selectedLabel={(n, total) => `${n} of ${total} selected`}
                />
              )}
              <Button
                size="small"
                variant="outlined"
                onClick={() => setSubtotalsCollapsed(!subtotalsCollapsed)}
                startIcon={
                  subtotalsCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />
                }
                sx={{ fontSize: 12, fontWeight: 700, textTransform: "none" }}
              >
                {subtotalsCollapsed ? "Expand rows" : "Collapse rows"}
              </Button>
            </Box>
          )}
        </Box>
      )}
      {hiddenGroupCount > 0 && (
        <Typography sx={{ fontSize: 10.5, color: "text.disabled", mb: 1.5 }}>
          {hiddenGroupCount} {DIM_LABEL[subtotalDim as string] ?? subtotalDim} value
          {hiddenGroupCount === 1 ? "" : "s"} hidden by the filter — the Total row below still
          reflects the full report.
        </Typography>
      )}

      {rows.length === 0 ? (
        <EmptyHint>No rows for this window and breakdown.</EmptyHint>
      ) : (
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.25, overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                {dimKeys.map((k) => (
                  <TableCell key={k} sx={hdr}>{DIM_LABEL[k] ?? k}</TableCell>
                ))}
                <TableCell align="right" sx={hdr}>Spend</TableCell>
                <TableCell align="right" sx={hdr}>Leads</TableCell>
                {funnel.has("mql") && <TableCell align="right" sx={hdr}>MQLs</TableCell>}
                {funnel.has("sal") && <TableCell align="right" sx={hdr}>SALs</TableCell>}
                {funnel.has("sql") && <TableCell align="right" sx={hdr}>SQLs</TableCell>}
                <TableCell align="right" sx={hdr}>Opps</TableCell>
                {funnel.has("closed_won") && <TableCell align="right" sx={hdr}>Won</TableCell>}
                <TableCell align="right" sx={hdr}>Pipeline $</TableCell>
                <TableCell align="right" sx={hdr}>Won $</TableCell>
                {funnel.has("lead") && <TableCell align="right" sx={hdr}>Cost/lead</TableCell>}
                {funnel.has("mql") && <TableCell align="right" sx={hdr}>Cost/MQL</TableCell>}
                {funnel.has("sal") && <TableCell align="right" sx={hdr}>Cost/SAL</TableCell>}
                {funnel.has("sql") && <TableCell align="right" sx={hdr}>Cost/SQL</TableCell>}
                {funnel.has("opportunity") && <TableCell align="right" sx={hdr}>Cost/opp</TableCell>}
                {funnel.has("closed_won") && <TableCell align="right" sx={hdr}>Cost/won</TableCell>}
                <TableCell align="right" sx={hdr}>Value/$</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bodyRows}
              {t && <TotalRow t={t} dimKeys={dimKeys} funnel={funnel} hdrBg={hdr.bgcolor} />}
            </TableBody>
          </Table>
        </Box>
      )}

      {anySharedSpend && (
        <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 1 }}>
          * Spend is shown at the campaign level and shared across these rows — do not sum the
          spend column.
        </Typography>
      )}
    </Box>
  );
}

// Total row. Figures come from `report.totals`, computed independently by the
// engine — NOT from summing the visible columns, which with shared campaign-level
// spend would be wrong. These totals reconcile with the dashboard overview strip.
function TotalRow({
  t,
  dimKeys,
  funnel,
  hdrBg,
}: {
  t: RoiTotals;
  dimKeys: string[];
  funnel: Set<string>;
  hdrBg: string;
}) {
  const per = (n: number) => (t.spend && n ? t.spend / n : null);
  const cell = (v: ReactNode) => (
    <TableCell
      align="right"
      sx={{ fontVariantNumeric: "tabular-nums", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}
    >
      {v}
    </TableCell>
  );
  return (
    <TableRow sx={{ bgcolor: hdrBg, "& td": { borderTop: 2, borderColor: "divider" } }}>
      {dimKeys.map((k, i) => (
        <TableCell key={k} sx={{ fontSize: 12, fontWeight: 800 }}>
          {i === 0 ? "Total" : ""}
        </TableCell>
      ))}
      {cell(usd(t.spend))}
      {cell(num(t.leads))}
      {funnel.has("mql") && cell(num(t.mqls))}
      {funnel.has("sal") && cell(num(t.sals))}
      {funnel.has("sql") && cell(num(t.sqls))}
      {cell(num(t.opportunities))}
      {funnel.has("closed_won") && cell(num(t.closed_won))}
      {cell(usd(t.open_pipeline_value))}
      {cell(usd(t.won_value))}
      {funnel.has("lead") && cell(usd(per(t.leads)))}
      {funnel.has("mql") && cell(usd(per(t.mqls)))}
      {funnel.has("sal") && cell(usd(per(t.sals)))}
      {funnel.has("sql") && cell(usd(per(t.sqls)))}
      {funnel.has("opportunity") && cell(usd(per(t.opportunities)))}
      {funnel.has("closed_won") && cell(usd(per(t.closed_won)))}
      {cell(
        <Box component="span" sx={{ color: t.value_per_dollar ? "success.main" : undefined }}>
          {perDollar(t.value_per_dollar)}
        </Box>,
      )}
    </TableRow>
  );
}

// A subtotal's aggregated metrics — every field here is either a plain sum
// across the group's rows (leads/opps/pipeline/won — each lead or opportunity
// belongs to exactly one detail row, so collapsing a dimension never
// double-counts them) or, for spend, a sum *unless* the group's rows share an
// identical repeated spend value (see the dedupe note where this is built).
interface SubtotalMetrics {
  spend: number;
  leads: number;
  mqls: number;
  sals: number;
  sqls: number;
  opportunities: number;
  closed_won: number;
  open_pipeline_value: number;
  won_value: number;
  value_per_dollar: number | null;
  cost_per_lead: number | null;
  cost_per_mql: number | null;
  cost_per_sal: number | null;
  cost_per_sql: number | null;
  cost_per_opportunity: number | null;
  cost_per_won: number | null;
}

function computeSubtotal(groupRows: RoiRow[], dedupeSpend: boolean): SubtotalMetrics {
  const sum = (f: (r: RoiRow) => number) => groupRows.reduce((a, r) => a + (f(r) || 0), 0);
  const spend = dedupeSpend ? groupRows[0].spend : sum((r) => r.spend);
  const leads = sum((r) => r.leads);
  const mqls = sum((r) => r.mqls);
  const sals = sum((r) => r.sals);
  const sqls = sum((r) => r.sqls);
  const opportunities = sum((r) => r.opportunities);
  const closed_won = sum((r) => r.closed_won);
  const open_pipeline_value = sum((r) => r.open_pipeline_value);
  const won_value = sum((r) => r.won_value);
  const attributed_value = sum((r) => r.attributed_value);
  const per = (n: number) => (spend && n ? spend / n : null);
  return {
    spend,
    leads,
    mqls,
    sals,
    sqls,
    opportunities,
    closed_won,
    open_pipeline_value,
    won_value,
    value_per_dollar: spend ? Math.round((attributed_value / spend) * 100) / 100 : null,
    cost_per_lead: per(leads),
    cost_per_mql: per(mqls),
    cost_per_sal: per(sals),
    cost_per_sql: per(sqls),
    cost_per_opportunity: per(opportunities),
    cost_per_won: per(closed_won),
  };
}

// Subtotal row — one per distinct value of the chosen subtotal dimension,
// inserted after that group's detail rows. The collapsed (other) dimension's
// column shows a muted "Subtotal" label instead of a value.
function SubtotalRow({
  metrics,
  dims,
  subtotalDim,
  dimKeys,
  funnel,
  bgcolor,
}: {
  metrics: SubtotalMetrics;
  dims: Record<string, string>;
  subtotalDim: string;
  dimKeys: string[];
  funnel: Set<string>;
  bgcolor: string;
}) {
  const cell = (v: ReactNode) => (
    <TableCell
      align="right"
      sx={{ fontVariantNumeric: "tabular-nums", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}
    >
      {v}
    </TableCell>
  );
  return (
    <TableRow sx={{ bgcolor, "& td": { borderTop: 1, borderColor: "divider" } }}>
      {dimKeys.map((k) => (
        <TableCell
          key={k}
          sx={{
            fontSize: 12,
            fontWeight: k === subtotalDim ? 700 : 500,
            color: k === subtotalDim ? "text.primary" : "text.disabled",
            fontStyle: k === subtotalDim ? "normal" : "italic",
          }}
        >
          {k === subtotalDim ? (dims[k] ?? "—") : "Subtotal"}
        </TableCell>
      ))}
      {cell(usd(metrics.spend))}
      {cell(num(metrics.leads))}
      {funnel.has("mql") && cell(num(metrics.mqls))}
      {funnel.has("sal") && cell(num(metrics.sals))}
      {funnel.has("sql") && cell(num(metrics.sqls))}
      {cell(num(metrics.opportunities))}
      {funnel.has("closed_won") && cell(num(metrics.closed_won))}
      {cell(usd(metrics.open_pipeline_value))}
      {cell(usd(metrics.won_value))}
      {funnel.has("lead") && cell(usd(metrics.cost_per_lead))}
      {funnel.has("mql") && cell(usd(metrics.cost_per_mql))}
      {funnel.has("sal") && cell(usd(metrics.cost_per_sal))}
      {funnel.has("sql") && cell(usd(metrics.cost_per_sql))}
      {funnel.has("opportunity") && cell(usd(metrics.cost_per_opportunity))}
      {funnel.has("closed_won") && cell(usd(metrics.cost_per_won))}
      {cell(
        <Box component="span" sx={{ color: metrics.value_per_dollar ? "success.main" : undefined }}>
          {perDollar(metrics.value_per_dollar)}
        </Box>,
      )}
    </TableRow>
  );
}

function ResultRow({
  r,
  dimKeys,
  funnel,
  cell: cellSx,
}: {
  r: RoiRow;
  dimKeys: string[];
  funnel: Set<string>;
  cell: Record<string, unknown>;
}) {
  const isUnmatched = Object.values(r.dims || {}).some((v) => v === "(unmatched)");
  // Spend with zero leads is the row worth noticing — money going nowhere.
  const waste = r.leads === 0 && r.spend > 0;

  const n = (v: ReactNode, dim?: boolean) => (
    <TableCell
      align="right"
      sx={{ ...cellSx, color: dim ? "text.disabled" : "text.primary" }}
    >
      {v}
    </TableCell>
  );

  return (
    <TableRow sx={isUnmatched ? { bgcolor: "action.hover" } : undefined}>
      {dimKeys.map((k) => (
        <TableCell
          key={k}
          sx={{
            fontSize: 12,
            fontWeight: 600,
            maxWidth: 280,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {r.dims?.[k] ?? "—"}
        </TableCell>
      ))}
      {n(
        <Tooltip
          title={r.spend_shared ? "Shared campaign-level spend" : ""}
          disableHoverListener={!r.spend_shared}
        >
          <Box component="span" sx={{ color: waste ? "warning.main" : undefined }}>
            {usd(r.spend)}
            {r.spend_shared ? "*" : ""}
          </Box>
        </Tooltip>,
      )}
      {n(num(r.leads), r.leads === 0)}
      {funnel.has("mql") && n(num(r.mqls), r.mqls === 0)}
      {funnel.has("sal") && n(num(r.sals), r.sals === 0)}
      {funnel.has("sql") && n(num(r.sqls), r.sqls === 0)}
      {n(num(r.opportunities), r.opportunities === 0)}
      {funnel.has("closed_won") && n(num(r.closed_won), r.closed_won === 0)}
      {n(usd(r.open_pipeline_value), !r.open_pipeline_value)}
      {n(usd(r.won_value), !r.won_value)}
      {funnel.has("lead") && n(usd(r.cost_per_lead))}
      {funnel.has("mql") && n(usd(r.cost_per_mql))}
      {funnel.has("sal") && n(usd(r.cost_per_sal))}
      {funnel.has("sql") && n(usd(r.cost_per_sql))}
      {funnel.has("opportunity") && n(usd(r.cost_per_opportunity))}
      {funnel.has("closed_won") && n(usd(r.cost_per_won))}
      {n(
        <Box
          component="span"
          sx={{ fontWeight: 700, color: r.value_per_dollar ? "success.main" : undefined }}
        >
          {perDollar(r.value_per_dollar)}
        </Box>,
      )}
    </TableRow>
  );
}

// How much of the Salesforce lead volume actually joined to a Google campaign.
// A quietly-falling match rate is the failure mode that makes every other number
// on this page an understatement, so it sits above the table rather than below it.
function MatchPanel({ mq }: { mq: NonNullable<RoiReport["match_quality"]> }) {
  const rate = mq.match_rate != null ? Math.round(mq.match_rate * 1000) / 10 : null;
  const good = (rate ?? 0) >= 90;
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
        p: 1.75,
        mb: 2,
        display: "flex",
        alignItems: "center",
        gap: 2.5,
        flexWrap: "wrap",
      }}
    >
      <Box>
        <Typography
          sx={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "text.secondary",
            mb: 0.4,
          }}
        >
          Slug match rate
        </Typography>
        <Typography
          sx={{
            fontSize: 17,
            fontWeight: 800,
            lineHeight: 1,
            color: good ? "success.main" : "warning.main",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rate == null ? "—" : `${rate}%`}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
        {num(mq.leads_matched)} of {num(mq.leads_total)} leads joined · {mq.leads_unmatched}{" "}
        unmatched · {mq.google_campaigns_in_window} campaigns in window
      </Typography>
      {mq.top_unmatched_slugs.length > 0 && (
        <Tooltip
          title={mq.top_unmatched_slugs.map((u) => `${u.slug} (${u.leads})`).join("\n")}
        >
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={`${mq.unmatched_sf_slugs} unmatched slug${mq.unmatched_sf_slugs === 1 ? "" : "s"}`}
            sx={{ fontSize: 11, height: 22, fontWeight: 600 }}
          />
        </Tooltip>
      )}
    </Box>
  );
}
