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

// Wire types for Ad Campaigns → Analytics, plus the two browser-side CSV
// builders. Ported from Marketing Ops
// (frontend/operations/ad-campaigns/analytics/api.ts) with the fetch helpers
// removed — those become TanStack Query hooks in ../../api/useAdAnalytics.
//
// The backend types these responses loosely (`sections: dict[str, Any]` in
// analytics/models.py), so these interfaces ARE the contract on our side. They
// were derived from the assembler's actual output, not from the Python models,
// and they're the only description of that shape anywhere — treat them as load-
// bearing rather than as documentation.

// ─── ROI reporting (deterministic Google Ads ↔ Salesforce correlation) ───────

export type GroupByDim = "campaign" | "region" | "product" | "lead_source_detail";
export type ValueBasis = "product_matched_arr" | "total_arr" | "amount";
export type OppScope = "open_pipeline" | "closed_won";
export type FunnelStage = "lead" | "mql" | "sal" | "sql" | "opportunity" | "closed_won";
export type AnchorField = "lead_created" | "mql" | "opp_created";

// Shared date-range control (both tabs): a named preset or an explicit custom range.
export type WindowPreset = "1m" | "3m" | "6m" | "ytd";
export interface DateWindow {
  mode: "preset" | "custom";
  preset?: WindowPreset;
  start?: string | null;
  end?: string | null;
}

export interface RoiConfigBody {
  name: string;
  window: DateWindow;
  group_by: GroupByDim[];
  value_metric: {
    basis: ValueBasis;
    product_arr_fields?: Record<string, string[]>;
    total_arr_fields?: string[];
    opp_scope: OppScope[];
  };
  funnel_stages: FunnelStage[];
  filters: { lead_source_details: string[]; regions: string[]; products: string[] };
  exclude_internal_emails: boolean;
}

export interface RoiRow {
  dims: Record<string, string>;
  spend: number;
  // True when this row shares campaign-level spend with sibling rows — the
  // spend column then intentionally does NOT sum to the total. See TotalRow.
  spend_shared: boolean;
  clicks: number;
  impressions: number;
  leads: number;
  mqls: number;
  sals: number;
  sqls: number;
  opportunities: number;
  closed_won: number;
  open_pipeline_value: number;
  won_value: number;
  attributed_value: number;
  value_per_dollar: number | null;
  cost_per_lead?: number | null;
  cost_per_mql?: number | null;
  cost_per_sal?: number | null;
  cost_per_sql?: number | null;
  cost_per_opportunity?: number | null;
  cost_per_won?: number | null;
}

export interface RoiTotals {
  spend: number;
  clicks: number;
  impressions: number;
  leads: number;
  mqls: number;
  sals: number;
  sqls: number;
  opportunities: number;
  closed_won: number;
  open_pipeline_value: number;
  won_value: number;
  attributed_value: number;
  value_per_dollar: number | null;
}

export interface RoiMatchQuality {
  leads_total: number;
  leads_matched: number;
  leads_unmatched: number;
  match_rate: number | null;
  distinct_sf_slugs: number;
  matched_sf_slugs: number;
  unmatched_sf_slugs: number;
  top_unmatched_slugs: { slug: string; leads: number }[];
  google_campaigns_in_window: number;
  google_slugs_indexed: number;
  spend_shared_across_rows: boolean;
}

// The live result of one ROI run. Not persisted — returned straight from
// /roi/run. `status: "failed"` arrives on an HTTP 200 with the reason in
// `error_message` and every payload field null.
export interface RoiReport {
  name: string;
  status: "completed" | "failed";
  window_start: string | null;
  window_end: string | null;
  error_message: string | null;
  config_snapshot?: RoiConfigBody | null;
  rows?: RoiRow[] | null;
  totals?: RoiTotals | null;
  match_quality?: RoiMatchQuality | null;
}

export interface RoiOptions {
  regions: string[];
  products: string[];
  lead_source_details: string[];
  arr_fields: string[];
}

// ─── LinkedIn ROI (BU-first; no UTM — attributed by business unit) ────────────
//
// LinkedIn lead-gen leads carry no utm_campaign; the current integration stamps a
// form URN reused across many campaigns, so leads are attributed by BU, not
// campaign. Revenue is ~0 by nature (these are top-of-funnel whitepaper
// downloads that rarely convert), so the view leads with cost-per-lead + volume,
// not pipeline.

export interface LinkedInRoiConfig {
  name: string;
  window: DateWindow;
  value_metric: {
    basis: ValueBasis;
    product_arr_fields?: Record<string, string[]>;
    total_arr_fields?: string[];
    opp_scope: OppScope[];
  };
  exclude_internal_emails: boolean;
}

export interface LinkedInBuRow {
  bu: string;
  spend: number;
  clicks: number;
  impressions: number;
  leads: number;
  opportunities: number;
  closed_won: number;
  open_pipeline_value: number;
  won_value: number;
  attributed_value: number;
  cost_per_lead: number | null;
  value_per_dollar: number | null;
}

export interface LinkedInFormMatrixRow {
  form: string;
  bu: string;
  total: number;
  by_region: Record<string, number>;
}

export interface LinkedInFormRegionMatrix {
  regions: string[];
  rows: LinkedInFormMatrixRow[];
  column_totals: Record<string, number>;
}

export interface LinkedInRoiTotals {
  spend: number;
  clicks: number;
  impressions: number;
  leads: number;
  opportunities: number;
  closed_won: number;
  open_pipeline_value: number;
  won_value: number;
  attributed_value: number;
  value_per_dollar: number | null;
  cost_per_lead: number | null;
}

export interface LinkedInRoiMatchQuality {
  leads_total: number;
  leads_campaign_keyed: number;
  leads_form_keyed: number;
  leads_other_keyed: number;
  campaign_attributable_rate: number | null;
  distinct_forms: number;
  unclassified_forms: { form: string; leads: number }[];
  linkedin_campaigns_in_window: number;
  note: string;
}

// Live result of one LinkedIn ROI run. Not persisted — returned from
// /linkedin-roi/run. Same 200-with-status:"failed" contract as RoiReport.
export interface LinkedInRoiReport {
  name: string;
  status: "completed" | "failed";
  window_start: string | null;
  window_end: string | null;
  error_message: string | null;
  config_snapshot?: LinkedInRoiConfig | null;
  bu_rows?: LinkedInBuRow[] | null;
  form_region_matrix?: LinkedInFormRegionMatrix | null;
  region_breakdown?: { region: string; leads: number }[] | null;
  attribution?: { campaign_keyed: number; form_keyed: number; other_keyed: number } | null;
  totals?: LinkedInRoiTotals | null;
  match_quality?: LinkedInRoiMatchQuality | null;
}

// ─── Marketing dashboard (deck-style view, computed on demand) ────────────────

export type AdPlatform = "google" | "linkedin";

export interface DashboardConfig {
  platform: AdPlatform;
  window: DateWindow;
  focus_campaign?: string | null;
  exclude_internal_emails?: boolean;
}

// Spend/traffic + the three independent funnel-event counts (each on its own
// date). The funnel/pipeline fields are Salesforce-derived and present only for
// the Google (UTM-joined) dashboard; LinkedIn is performance-only and instead
// carries `conversions`.
export interface DashOverview {
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  avg_cpc: number | null;
  leads_created?: number;
  mqls?: number;
  opportunities_created?: number;
  pipeline_arr?: number;
  conversions?: number; // LinkedIn: ad-platform conversions (no SF join)
}

// Conversion funnel (cohort = leads created in window, by deepest stage reached)
export interface FunnelCut {
  counts: Record<string, number>;
  conv: Record<string, number | null>; // stage→stage conversion %, keyed by stage
  velocity_days: Record<string, number | null>; // avg days, keyed "<from>_<to>"
  total: number;
}
export interface FunnelData {
  stages: string[];
  labels: Record<string, string>;
  transitions: string[];
  overall: FunnelCut;
  by_bu: Record<string, FunnelCut>;
  by_region: Record<string, FunnelCut>;
  by_bu_region: Record<string, FunnelCut>; // keyed "<bu>||<region>"
  bus: string[];
  regions: string[];
}

export interface DashSpendRow {
  label: string;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  pct: number | null;
}
export interface DashSpendBreakdown {
  total_spend: number;
  rows: DashSpendRow[];
}

// Single-dimension conversion breakdown (by source / region / business unit)
export interface DashConvType {
  total: number;
  rows: { label: string; count: number; pct: number | null }[];
}

// BU × region spend cross-tab (still emitted by the assembler; not rendered)
export interface DashCrossTab {
  rows: string[];
  cols: string[];
  matrix: Record<string, Record<string, number>>;
  row_totals: Record<string, number>;
  col_totals: Record<string, number>;
  total: number;
}

export interface DashOppRow {
  account: string | null;
  name: string | null;
  arr: number | null;
  stage: string | null;
  is_won: boolean;
  is_closed: boolean;
  region: string | null;
}
export interface DashOpportunities {
  rows: DashOppRow[];
  count: number;
  truncated: boolean;
  total_arr: number;
}

// LinkedIn performance-only: per-campaign ad metrics (no Salesforce join)
export interface DashCampaignPerfRow {
  campaign_id: string;
  campaign_name: string | null;
  status: string | null;
  product: string | null;
  region: string | null;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number | null;
  avg_cpc: number | null;
  conversions: number;
}
export interface DashCampaignPerformance {
  total_spend: number;
  count: number;
  rows: DashCampaignPerfRow[];
}

export interface DashFocusLead {
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  date: string | null;
  status: string | null;
}
export interface DashCampaignInFocus {
  resolved: boolean;
  requested?: string;
  campaign_id?: string;
  campaign_name?: string | null;
  product?: string | null;
  region?: string | null;
  metrics?: {
    impressions: number;
    clicks: number;
    ctr: number | null;
    spend: number;
    avg_cpc: number | null;
    google_conversions: number;
    conv_rate: number | null;
    leads: number;
    cost_per_lead: number | null;
  };
  status_counts?: Record<string, number>;
  leads?: DashFocusLead[];
}

// Google (UTM-joined) sections are the full set; LinkedIn (performance_only)
// sends only overview + spend cuts + campaign_performance. The SF-derived
// sections are therefore optional, and consumers branch on
// `meta.performance_only`.
export interface DashboardSections {
  overview: DashOverview;
  spend_by_product: DashSpendBreakdown;
  spend_by_region: DashSpendBreakdown;
  spend_by_bu_region: DashCrossTab;
  // Google-only (Salesforce UTM join)
  funnel?: FunnelData;
  conversions_by_type?: DashConvType;
  conversions_by_region?: DashConvType;
  conversions_by_product?: DashConvType;
  opportunities?: DashOpportunities;
  campaign_in_focus?: DashCampaignInFocus;
  // LinkedIn-only (performance)
  campaign_performance?: DashCampaignPerformance;
}

export interface DashboardMeta {
  platform: string;
  performance_only?: boolean; // LinkedIn: no Salesforce join
  note?: string;
  window_start: string;
  window_end: string;
  conversion_region_note?: string;
  generated_at: string;
  campaigns: {
    id: string;
    name: string;
    product: string | null;
    region: string | null;
    spend: number;
  }[];
}

export interface DashboardMatchQuality {
  // Google (UTM join)
  leads_total?: number;
  leads_matched?: number;
  leads_unmatched?: number;
  match_rate?: number | null;
  google_campaigns_in_window?: number;
  google_slugs_indexed?: number;
  // LinkedIn (performance-only)
  campaigns_in_window?: number;
}

export interface Dashboard {
  meta: DashboardMeta;
  sections: DashboardSections;
  match_quality: DashboardMatchQuality;
}

// ─── CSV builders (browser-side) ─────────────────────────────────────────────
//
// Reports are never persisted server-side, so there is no download URL — the
// file is generated from the rows already in memory. Ported verbatim.

const esc = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const LI_BU_KEYS: (keyof LinkedInBuRow)[] = [
  "bu", "spend", "clicks", "impressions", "leads", "opportunities", "closed_won",
  "open_pipeline_value", "won_value", "attributed_value", "cost_per_lead", "value_per_dollar",
];

export function linkedInRoiToCsv(report: LinkedInRoiReport): string {
  const rows = report.bu_rows ?? [];
  if (rows.length === 0) return "";
  const lines = [LI_BU_KEYS.map(esc).join(",")];
  for (const r of rows) {
    lines.push(LI_BU_KEYS.map((k) => (r[k] == null ? "" : r[k])).map(esc).join(","));
  }
  return lines.join("\n");
}

const CSV_METRIC_KEYS: (keyof RoiRow)[] = [
  "spend", "spend_shared", "clicks", "impressions", "leads", "mqls",
  "sals", "sqls", "opportunities", "closed_won", "open_pipeline_value", "won_value",
  "attributed_value", "value_per_dollar", "cost_per_lead", "cost_per_mql",
  "cost_per_sal", "cost_per_sql", "cost_per_opportunity", "cost_per_won",
];

export function roiReportToCsv(report: RoiReport): string {
  const rows = report.rows ?? [];
  if (rows.length === 0) return "";
  // Dimension columns are discovered from the rows rather than from the config,
  // because group_by can change the shape of `dims` per run.
  const dimKeys: string[] = [];
  rows.forEach((r) =>
    Object.keys(r.dims || {}).forEach((k) => {
      if (!dimKeys.includes(k)) dimKeys.push(k);
    }),
  );
  const lines = [[...dimKeys, ...CSV_METRIC_KEYS].map(esc).join(",")];
  for (const r of rows) {
    const dims = r.dims || {};
    const cells = [
      ...dimKeys.map((k) => dims[k] ?? ""),
      ...CSV_METRIC_KEYS.map((k) => (r[k] == null ? "" : r[k])),
    ];
    lines.push(cells.map(esc).join(","));
  }
  return lines.join("\n");
}

// Hand the built CSV to the browser as a download. Kept next to the builders so
// both views share one implementation.
export function downloadCsv(filename: string, csv: string): void {
  if (!csv) return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
