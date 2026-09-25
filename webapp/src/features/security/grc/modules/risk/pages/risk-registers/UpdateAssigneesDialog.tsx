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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import type { JSX } from "react";
import { formatBackendTimestampForDisplay } from "@features/security/grc/utils/dateTime";
import {
  fetchManagementApprovers,
  fetchRiskAssignerCandidates,
  fetchRiskOwnerCandidates,
  resolveUserByEmail,
  searchEmployees,
} from "../../api/riskApi";
import type {
  EmployeeOption,
  RiskDetail,
  RiskTeam,
  UpdateAssigneesPayload,
  UserOption,
} from "../../api/riskApi";
import { dialogPaperSx } from "../cardStyles";
import { useAuthApiClient } from "@features/security/grc/shim/useAuthApiClient";

// Minimum characters before searching — matches the backend's own floor.
const MIN_EMPLOYEE_SEARCH_LEN = 2;
const EMPLOYEE_SEARCH_DEBOUNCE_MS = 300;

// withCurrent keeps the risk's saved person selectable even when they are not
// among today's candidates — a migrated risk can name a placeholder who holds
// no grant — so opening the dialog never silently blanks a field.
function withCurrent(candidates: UserOption[], id: number, name: string): UserOption[] {
  if (!id || candidates.some((u) => u.id === id)) return candidates;
  return [...candidates, { id, display_name: name || `User #${id}`, email: "", risk_team_ids: [] }];
}

interface UpdateAssigneesDialogProps {
  open: boolean;
  detail: RiskDetail;
  assignmentTeams: RiskTeam[];
  // Only used to show the current Action Owner's name — RiskDetail carries the
  // action owner's id but not their name.
  users: UserOption[];
  onClose: () => void;
  onSave: (payload: UpdateAssigneesPayload) => Promise<void>;
}

// UpdateAssigneesDialog corrects a migrated risk's people and assignment team
// during its correction window (RISK_MODULE_DESIGN.md §7, Assignee correction
// rule). Deliberately separate from EditRiskDialog: it works in any status,
// never triggers re-approval, and sends only the fields that changed.
export default function UpdateAssigneesDialog({
  open,
  detail,
  assignmentTeams,
  users,
  onClose,
  onSave,
}: UpdateAssigneesDialogProps): JSX.Element {
  const authFetch = useAuthApiClient();

  const [assignerId, setAssignerId] = useState(detail.assigner_id);
  const [ownerId, setOwnerId] = useState(detail.owner_id);
  const [managementApproverId, setManagementApproverId] = useState(detail.management_approver_id);
  const [assignmentTeamId, setAssignmentTeamId] = useState(detail.assignment_team_id);
  const currentActionOwnerId = detail.action_plan?.action_owner_id ?? null;
  const [actionOwnerId, setActionOwnerId] = useState<number | null>(currentActionOwnerId);

  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  // Candidates are role-filtered exactly as in Add Risk, so only someone who
  // already holds the grant can be picked and will not 403 when they act.
  // Assigner is scoped to the source register; Owner and Management Approver
  // to the source register and the (possibly changed) assignment team.
  const [assignerCandidates, setAssignerCandidates] = useState<UserOption[]>([]);
  const [ownerCandidates, setOwnerCandidates] = useState<UserOption[]>([]);
  const [managementApprovers, setManagementApprovers] = useState<UserOption[]>([]);
  // The assignment team the Owner and Management Approver lists above were
  // fetched for. Until it matches the selected team, those lists are the
  // previous team's: picks are not checked against them and Save waits.
  const [candidatesTeamId, setCandidatesTeamId] = useState<number | null>(null);
  const candidatesCurrent = candidatesTeamId === assignmentTeamId;
  // Set when the lists for the selected team failed to load. The lists and
  // their team are then left as they were, so they stay non-current: no pick
  // is judged against an empty list, and Save stays disabled.
  const [candidatesError, setCandidatesError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchRiskAssignerCandidates(authFetch, [detail.source_register_id])
      .then((list) => { if (!cancelled) setAssignerCandidates(list); })
      .catch(() => { if (!cancelled) setAssignerCandidates([]); });
    return () => { cancelled = true; };
  }, [open, authFetch, detail.source_register_id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const teamIds = [detail.source_register_id, assignmentTeamId];
    setCandidatesError(false);
    // Both lists land together, tagged with the team they belong to, so the
    // Owner and Management Approver are never checked against different teams.
    void Promise.allSettled([
      fetchRiskOwnerCandidates(authFetch, teamIds),
      fetchManagementApprovers(authFetch, teamIds),
    ]).then(([owners, approvers]) => {
      if (cancelled) return;
      if (owners.status !== "fulfilled" || approvers.status !== "fulfilled") {
        setCandidatesError(true);
        return;
      }
      setOwnerCandidates(owners.value);
      setManagementApprovers(approvers.value);
      setCandidatesTeamId(assignmentTeamId);
    });
    // Cancelled on the next team change, so a slower earlier request can
    // never overwrite the list for the team now selected.
    return () => { cancelled = true; };
  }, [open, authFetch, detail.source_register_id, assignmentTeamId]);

  // A new assignment team refetches these lists. A replacement Owner or
  // Management Approver picked for the old team who is not a candidate for the
  // new one would otherwise stay in the payload while the Select showed blank
  // (withCurrent only keeps the saved person). Fall back to the saved person,
  // who is always selectable here, as EditRiskDialog clears its own pick.
  useEffect(() => {
    if (!candidatesCurrent) return;
    if (ownerId !== detail.owner_id && !ownerCandidates.some((u) => u.id === ownerId)) {
      setOwnerId(detail.owner_id);
    }
  }, [candidatesCurrent, ownerCandidates, ownerId, detail.owner_id]);

  useEffect(() => {
    if (!candidatesCurrent) return;
    if (
      managementApproverId !== detail.management_approver_id &&
      !managementApprovers.some((u) => u.id === managementApproverId)
    ) {
      setManagementApproverId(detail.management_approver_id);
    }
  }, [candidatesCurrent, managementApprovers, managementApproverId, detail.management_approver_id]);

  // Action Owner can be any employee, searched live against the HR entity and
  // resolved to a user id on selection — same as Add Risk and Edit Risk.
  const [actionOwnerOptions, setActionOwnerOptions] = useState<EmployeeOption[]>([]);
  // The current Action Owner as an Autocomplete option. RiskDetail has only
  // their id, so the name comes from the page's users list, which may still be
  // loading when the dialog opens.
  const currentActionOwnerOption = useMemo<EmployeeOption | null>(() => {
    const u = users.find((x) => x.id === currentActionOwnerId);
    return u ? { name: u.display_name, email: u.email } : null;
  }, [users, currentActionOwnerId]);
  const [actionOwnerSelected, setActionOwnerSelected] = useState<EmployeeOption | null>(currentActionOwnerOption);
  const [actionOwnerSearchLoading, setActionOwnerSearchLoading] = useState(false);
  const [actionOwnerResolving, setActionOwnerResolving] = useState(false);
  const [actionOwnerError, setActionOwnerError] = useState<string | null>(null);
  const actionOwnerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every Action Owner pick or clear. A lookup only applies its
  // result while it is still the latest one, so picking A then B can never end
  // with A's slower response overwriting B.
  const actionOwnerRequest = useRef(0);

  const runActionOwnerSearch = useCallback((query: string) => {
    if (query.trim().length < MIN_EMPLOYEE_SEARCH_LEN) {
      setActionOwnerOptions([]);
      setActionOwnerError(null);
      return;
    }
    setActionOwnerSearchLoading(true);
    setActionOwnerError(null);
    searchEmployees(authFetch, query)
      .then(setActionOwnerOptions)
      .catch(() => {
        setActionOwnerOptions([]);
        setActionOwnerError("Unable to reach the employee directory. Please try again.");
      })
      .finally(() => setActionOwnerSearchLoading(false));
  }, [authFetch]);

  const handleActionOwnerInputChange = (value: string): void => {
    if (actionOwnerDebounce.current) clearTimeout(actionOwnerDebounce.current);
    actionOwnerDebounce.current = setTimeout(() => runActionOwnerSearch(value), EMPLOYEE_SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    if (!open) return;
    setAssignerId(detail.assigner_id);
    setOwnerId(detail.owner_id);
    setManagementApproverId(detail.management_approver_id);
    setAssignmentTeamId(detail.assignment_team_id);
    setActionOwnerId(detail.action_plan?.action_owner_id ?? null);
    setActionOwnerSelected(currentActionOwnerOption);
    setActionOwnerError(null);
    setApiError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens on a risk; re-running when the users list arrives would wipe the user's unsaved picks
  }, [open, detail]);

  // Fill in the current Action Owner's name if the users list lands after the
  // dialog opened, without touching a replacement the user already picked.
  useEffect(() => {
    setActionOwnerSelected((selected) => selected ?? currentActionOwnerOption);
  }, [currentActionOwnerOption]);

  const payload: UpdateAssigneesPayload = {};
  if (assignerId !== detail.assigner_id) payload.assigner_id = assignerId;
  if (ownerId !== detail.owner_id) payload.owner_id = ownerId;
  if (managementApproverId !== detail.management_approver_id) payload.management_approver_id = managementApproverId;
  if (assignmentTeamId !== detail.assignment_team_id) payload.assignment_team_id = assignmentTeamId;
  if (actionOwnerId !== null && actionOwnerId !== currentActionOwnerId) payload.action_owner_id = actionOwnerId;
  const hasChanges = Object.keys(payload).length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSubmitting(true);
    setApiError("");
    try {
      await onSave(payload);
      onClose();
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : "Failed to update assignees.");
    } finally {
      setSubmitting(false);
    }
  };

  const deadline = formatBackendTimestampForDisplay(detail.assignees_editable_until, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Action Owner belongs to one plan: the risk's original action plan, created
  // with the risk. Plans the assigner added later keep their own owners, so
  // name the plan rather than let this read as "every Action Owner".
  const originalPlanDescription = detail.action_plan?.description?.trim() ?? "";
  const originalPlanHelp =
    "Sets the owner of the risk's original action plan" +
    (originalPlanDescription
      ? ` ("${originalPlanDescription.length > 60 ? `${originalPlanDescription.slice(0, 60)}…` : originalPlanDescription}")`
      : "") +
    ". Other action plans keep their own owners.";

  const assignerOptions = withCurrent(assignerCandidates, detail.assigner_id, detail.assigner_name);
  const ownerOptions = withCurrent(ownerCandidates, detail.owner_id, detail.owner_name);
  const managementApproverOptions = withCurrent(
    managementApprovers,
    detail.management_approver_id,
    detail.management_approver_name,
  );

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: dialogPaperSx }}
    >
      {/* DialogTitle already renders an <h2>, so both children are spans. */}
      <DialogTitle>
        <Typography component="span" variant="h6" fontWeight={700} display="block">
          Update Assignees
        </Typography>
        <Typography component="span" variant="caption" color="text.secondary" display="block">
          {detail.risk_code}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack gap={2.5} sx={{ py: 1 }}>
          {apiError && <Alert severity="error">{apiError}</Alert>}
          {candidatesError && (
            <Alert severity="error">
              Unable to load the Risk Owner and Management Approver candidates for this team. Close the
              dialog and try again.
            </Alert>
          )}

          <Alert severity="info">
            This risk came from the risk register migration, so its people and assignment team
            can be corrected{deadline ? <> until <strong>{deadline}</strong></> : null}. Changes here
            don&apos;t send the risk for re-approval, and no one is emailed.
          </Alert>

          <FormControl fullWidth disabled={submitting}>
            <InputLabel>Risk Assigned To</InputLabel>
            <Select label="Risk Assigned To" value={assignerId} onChange={(e) => setAssignerId(Number(e.target.value))}>
              {assignerOptions.map((u) => <MenuItem key={u.id} value={u.id}>{u.display_name}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth disabled={submitting}>
            <InputLabel>Assignment Team</InputLabel>
            <Select label="Assignment Team" value={assignmentTeamId} onChange={(e) => setAssignmentTeamId(Number(e.target.value))}>
              {assignmentTeams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth disabled={submitting}>
            <InputLabel>Risk Owner</InputLabel>
            <Select label="Risk Owner" value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))}>
              {ownerOptions.map((u) => <MenuItem key={u.id} value={u.id}>{u.display_name}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth disabled={submitting}>
            <InputLabel>Management Approver</InputLabel>
            <Select
              label="Management Approver"
              value={managementApproverId}
              onChange={(e) => setManagementApproverId(Number(e.target.value))}
            >
              {managementApproverOptions.map((u) => <MenuItem key={u.id} value={u.id}>{u.display_name}</MenuItem>)}
            </Select>
          </FormControl>

          <Autocomplete
            options={actionOwnerOptions}
            loading={actionOwnerSearchLoading || actionOwnerResolving}
            filterOptions={(opts) => opts}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.email === value.email}
            value={actionOwnerSelected}
            // The backend can only set the owner of an existing STANDARD
            // plan and answers 409 otherwise, so don't offer a pick that can
            // only fail. A plan with no owner yet is fine to set.
            disabled={submitting || !detail.action_plan}
            onInputChange={(_, newInputValue, reason) => {
              if (reason === "input") handleActionOwnerInputChange(newInputValue);
            }}
            onChange={(_, newValue) => {
              // The correction never removes an Action Owner, only replaces
              // one, so clearing the field puts the current one back rather
              // than showing an empty field that would not be saved as empty.
              const request = ++actionOwnerRequest.current;
              if (!newValue) {
                setActionOwnerResolving(false);
                setActionOwnerSelected(currentActionOwnerOption);
                setActionOwnerId(currentActionOwnerId);
                return;
              }
              setActionOwnerResolving(true);
              resolveUserByEmail(authFetch, newValue)
                .then((resolved) => {
                  if (request !== actionOwnerRequest.current) return;
                  setActionOwnerSelected(newValue);
                  setActionOwnerId(resolved.id);
                  setActionOwnerError(null);
                })
                .catch(() => {
                  if (request !== actionOwnerRequest.current) return;
                  setActionOwnerSelected(currentActionOwnerOption);
                  setActionOwnerId(currentActionOwnerId);
                  setActionOwnerError("Unable to link this employee to a user account. Please try again.");
                })
                .finally(() => {
                  if (request === actionOwnerRequest.current) setActionOwnerResolving(false);
                });
            }}
            loadingText="Searching…"
            noOptionsText={actionOwnerError ?? "Type at least 2 characters of the employee's email to search"}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Action Owner"
                placeholder="Search by email"
                error={!!actionOwnerError}
                helperText={
                  actionOwnerError ??
                  (!detail.action_plan
                    ? "This risk has no action plan, so there is no Action Owner to set."
                    : originalPlanHelp)
                }
              />
            )}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={() => !submitting && onClose()} disabled={submitting} color="inherit">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={submitting || !hasChanges || actionOwnerResolving || !candidatesCurrent} variant="contained">
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
