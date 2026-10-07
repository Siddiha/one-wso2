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
import { Alert, Box, Button, Chip, Divider, Paper, Skeleton, Stack, Typography } from "@wso2/oxygen-ui";
import { useState } from "react";
import { ArrowLeftIcon, TrashIcon } from "@wso2/oxygen-ui-icons-react";
import { Link as RouterLink, useNavigate, useParams } from "react-router";
import ConfirmationDialog, { type ConfirmationContent } from "@components/confirmation-dialog/ConfirmationDialog";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { isTilBackendConfigured, useTilSubmission, useTilUserInfo } from "../api/useTilData";
import { useDeleteTilSubmission } from "../api/useTilMutations";
import { describeError, isNotFound } from "../util/tilError";
import TilShell from "../components/TilShell";
import TilWhatContent from "../components/TilWhatContent";

// A single entry's own page -- what a Chat notification's "View entry"
// button and a feed card's own click both land on. Spells out every field
// (not the feed card's condensed one-line chip) since this page's whole
// point is to BE the full view of one entry.
export default function TilEntryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const configured = isTilBackendConfigured();
  const submission = useTilSubmission(id);
  const userInfo = useTilUserInfo();
  const deleteSubmission = useDeleteTilSubmission();
  const { showSuccess, showError } = useNotifications();

  const canModerate = userInfo.data?.canModerate ?? false;
  const isOwner = Boolean(userInfo.data?.email) && submission.data?.submittedByEmail === userInfo.data?.email;
  const canDelete = canModerate || isOwner;
  const notFound = isNotFound(submission.error);
  const [confirmContent, setConfirmContent] = useState<ConfirmationContent | null>(null);

  const runDelete = () => {
    if (!id) return;
    deleteSubmission.mutate(id, {
      onSuccess: () => {
        showSuccess("Entry deleted");
        navigate("/knowledge-base");
      },
      onError: (err) => showError(describeError(err)),
    });
  };

  const confirmDelete = () => {
    setConfirmContent({
      title: "Delete this entry?",
      text: "This can't be undone — the entry will be removed from the feed for everyone.",
      confirmLabel: "Delete",
      confirmColor: "primary",
      confirmAction: runDelete,
    });
  };

  return (
    <TilShell title="Today I Learned" configured={configured} configKey="ONE_WSO2_TIL_BACKEND_URL">
      <Box sx={{ mt: 1.5, mb: 2 }}>
        <Button size="small" startIcon={<ArrowLeftIcon size={16} />} component={RouterLink} to="/knowledge-base">
          Back
        </Button>
      </Box>

      {submission.isLoading ? (
        <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 1.5 }} />
      ) : notFound ? (
        <Alert severity="warning">
          This entry doesn&apos;t exist anymore — it may have been deleted, or the link is wrong.
        </Alert>
      ) : submission.isError ? (
        <Alert severity="error">Couldn&apos;t load this entry. {describeError(submission.error)}</Alert>
      ) : submission.data ? (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
            <Box sx={{ minWidth: 0 }}>
              {/* Old entries predate the title field (backend default: "")
                  -- falls back to the who/where line alone as the heading
                  for those, same as the feed card. */}
              {submission.data.title ? (
                <>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.75 }}>
                    {submission.data.title}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Typography variant="body2" color="text.secondary">
                      Submitted by {submission.data.who}
                    </Typography>
                    <Chip
                      label={
                        submission.data.whereDetail
                          ? `${submission.data.where} — ${submission.data.whereDetail}`
                          : submission.data.where
                      }
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                </>
              ) : (
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Submitted by {submission.data.who}
                  </Typography>
                  <Chip
                    label={
                      submission.data.whereDetail
                        ? `${submission.data.where} — ${submission.data.whereDetail}`
                        : submission.data.where
                    }
                    variant="outlined"
                  />
                </Stack>
              )}
            </Box>
            {canDelete && (
              <Button
                size="small"
                color="error"
                startIcon={<TrashIcon size={16} />}
                onClick={confirmDelete}
                disabled={deleteSubmission.isPending}
                sx={{ flexShrink: 0 }}
              >
                {deleteSubmission.isPending ? "Deleting…" : "Delete entry"}
              </Button>
            )}
          </Stack>

          <Divider sx={{ mt: 2, mb: 2.5 }} />

          <Box>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ display: "block", mb: 0.75, letterSpacing: "0.08em" }}
            >
              The learning
            </Typography>
            <TilWhatContent html={submission.data.what} variant="body1" />
          </Box>

          <Divider sx={{ mt: 3, mb: 2.5 }} />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 4 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Submitted by
              </Typography>
              <Typography variant="body2">{submission.data.submittedByEmail}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Submitted
              </Typography>
              <Typography variant="body2">
                {submission.data.createdAt.toLocaleString(undefined, {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      ) : null}
      <ConfirmationDialog content={confirmContent} onClose={() => setConfirmContent(null)} />
    </TilShell>
  );
}
