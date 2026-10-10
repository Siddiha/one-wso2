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

import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@wso2/oxygen-ui";
import { money } from "../util/financeFormat";
import type { CcLeadApprovalSummary, CcLeadTeamCardHolder } from "./ccTypes";

const HEAD_SX = {
  "& th": {
    fontSize: 11,
    fontWeight: 700,
    color: "text.secondary",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
} as const;

const NUM_SX = { fontSize: 12.5, fontVariantNumeric: "tabular-nums" } as const;

/** index.tsx:44 — every amount on this screen is USD. */
const CURRENCY = "USD";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 700, color: "text.primary", mb: 1.25 }}>{title}</Typography>
      {children}
    </Box>
  );
}

/**
 * Every lead's approval backlog, newest problem first.
 *
 * `LeadApprovalOverviewTable.tsx` — finance's way into Lead view: pick the lead
 * whose queue looks worst and drill into their team. A lead never sees this
 * table; they are taken straight to their own team.
 */
export function CcLeadOverviewTable({
  leads,
  onSelect,
}: {
  leads: CcLeadApprovalSummary[];
  onSelect: (lead: CcLeadApprovalSummary) => void;
}) {
  return (
    <Panel title="Approvals waiting on each lead">
      <Table size="small">
        <TableHead>
          <TableRow sx={HEAD_SX}>
            <TableCell>Team Lead</TableCell>
            <TableCell align="right">Submitters</TableCell>
            <TableCell align="right">Pending Txns</TableCell>
            <TableCell align="right">Pending Amount</TableCell>
            {/* Not submitted at all yet — never reaches the lead's approval queue, so it
                is invisible in every other column on this row. */}
            <TableCell align="right">Unsubmitted Txns</TableCell>
            <TableCell align="right">Unsubmitted Amount</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} align="center" sx={{ fontSize: 13, color: "text.secondary" }}>
                Nothing is waiting on any lead.
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <TableRow key={lead.leadEmail} hover>
                <TableCell sx={{ fontSize: 12.5 }}>
                  <Typography sx={{ fontSize: 12.5 }} title={lead.leadEmail}>
                    {lead.leadName || lead.leadEmail}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={NUM_SX}>{lead.submitterCount}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{lead.transactionCount}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{money(lead.pendingAmount, CURRENCY)}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{lead.unsubmittedCount}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{money(lead.unsubmittedAmount, CURRENCY)}</TableCell>
                {/* The 0-7d/8-14d/15-30d/30+d age breakdown moved to the per-card-holder
                    drill-down (View team) — this row is the summary, not the detail. */}
                <TableCell align="right">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => onSelect(lead)}
                    aria-label={`View ${lead.leadName || lead.leadEmail}'s team`}
                    sx={{ textTransform: "none" }}
                  >
                    View team
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

/**
 * The card holders inside one lead's team.
 *
 * `LeadTeamCardHolderTable.tsx`. Carries `oldestPendingDays`, which the
 * all-leads table does not: once you are looking at one team, the question
 * stops being "who is worst" and becomes "which of these has been sitting
 * longest".
 */
export function CcLeadTeamTable({
  leadName,
  cardHolders,
  onBack,
  canGoBack,
}: {
  leadName: string;
  cardHolders: CcLeadTeamCardHolder[];
  onBack: () => void;
  /** A lead has no all-leads table to go back to; only finance does. */
  canGoBack: boolean;
}) {
  return (
    <Panel title={`${leadName}'s team (Pending)`}>
      {canGoBack && (
        <Stack direction="row" sx={{ mb: 1 }}>
          <Button size="small" onClick={onBack} sx={{ textTransform: "none" }}>
            Back to all leads
          </Button>
        </Stack>
      )}
      <Table size="small">
        <TableHead>
          <TableRow sx={HEAD_SX}>
            <TableCell>Card Holder</TableCell>
            <TableCell align="right">Pending Txns</TableCell>
            <TableCell align="right">Pending Amount</TableCell>
            <TableCell align="right">Oldest Pending</TableCell>
            <TableCell align="right">0-7d</TableCell>
            <TableCell align="right">8-14d</TableCell>
            <TableCell align="right">15-30d</TableCell>
            <TableCell align="right">30+d</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {cardHolders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ fontSize: 13, color: "text.secondary" }}>
                Nothing pending in this team.
              </TableCell>
            </TableRow>
          ) : (
            cardHolders.map((holder) => (
              <TableRow key={holder.employeeEmail} hover>
                <TableCell sx={{ fontSize: 12.5 }}>
                  <Typography sx={{ fontSize: 12.5 }} title={holder.employeeEmail}>
                    {holder.cardHolderName || holder.employeeEmail}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.transactionCount}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{money(holder.pendingAmount, CURRENCY)}</TableCell>
                <TableCell align="right" sx={NUM_SX}>
                  {holder.oldestPendingDays > 0 ? `${holder.oldestPendingDays}d` : "—"}
                </TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.bucket0To7}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.bucket8To14}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.bucket15To30}</TableCell>
                <TableCell
                  align="right"
                  sx={{ ...NUM_SX, fontWeight: 600, color: holder.bucket30Plus > 0 ? "error.main" : undefined }}
                >
                  {holder.bucket30Plus}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

/**
 * The same team's not-yet-submitted backlog, as its own table rather than
 * extra columns bolted onto `CcLeadTeamTable` above — this is work that never
 * reached the lead's approval queue at all, so it reads as a separate concern,
 * not a detail of the pending one.
 */
export function CcLeadTeamUnsubmittedTable({
  leadName,
  cardHolders,
}: {
  leadName: string;
  cardHolders: CcLeadTeamCardHolder[];
}) {
  return (
    <Panel title={`${leadName}'s team (Unsubmitted)`}>
      <Table size="small">
        <TableHead>
          <TableRow sx={HEAD_SX}>
            <TableCell>Card Holder</TableCell>
            <TableCell align="right">Unsubmitted Txns</TableCell>
            <TableCell align="right">Unsubmitted Amount</TableCell>
            <TableCell align="right">Oldest Unsubmitted</TableCell>
            <TableCell align="right">0-7d</TableCell>
            <TableCell align="right">8-14d</TableCell>
            <TableCell align="right">15-30d</TableCell>
            <TableCell align="right">30+d</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {cardHolders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ fontSize: 13, color: "text.secondary" }}>
                Nothing unsubmitted in this team.
              </TableCell>
            </TableRow>
          ) : (
            cardHolders.map((holder) => (
              <TableRow key={holder.employeeEmail} hover>
                <TableCell sx={{ fontSize: 12.5 }}>
                  <Typography sx={{ fontSize: 12.5 }} title={holder.employeeEmail}>
                    {holder.cardHolderName || holder.employeeEmail}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.unsubmittedCount}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{money(holder.unsubmittedAmount, CURRENCY)}</TableCell>
                <TableCell align="right" sx={NUM_SX}>
                  {holder.oldestUnsubmittedDays > 0 ? `${holder.oldestUnsubmittedDays}d` : "—"}
                </TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.unsubmittedBucket0To7}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.unsubmittedBucket8To14}</TableCell>
                <TableCell align="right" sx={NUM_SX}>{holder.unsubmittedBucket15To30}</TableCell>
                <TableCell
                  align="right"
                  sx={{ ...NUM_SX, fontWeight: 600, color: holder.unsubmittedBucket30Plus > 0 ? "error.main" : undefined }}
                >
                  {holder.unsubmittedBucket30Plus}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}
