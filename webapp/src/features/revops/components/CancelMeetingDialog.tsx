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
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@wso2/oxygen-ui";
import type { Meeting } from "../api/revOpsTypes";

/**
 * Confirms cancelling a meeting.
 *
 * Cancelling deletes the Google Calendar event and notifies its attendees, so
 * it is not undoable from here — the copy says so rather than leaving the user
 * to find out.
 */
export default function CancelMeetingDialog({
  meeting,
  onConfirm,
  onClose,
  pending,
  error,
}: {
  /** The meeting to cancel, or null when the dialog is closed. */
  meeting: Meeting | null;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <Dialog
      open={meeting !== null}
      // Not dismissable mid-flight: closing while the request is in the air
      // would leave the user unsure whether it went through.
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Cancel this meeting?</DialogTitle>
      <DialogContent>
        <DialogContentText variant="body2">
          {meeting?.title}
        </DialogContentText>
        <DialogContentText variant="body2" sx={{ mt: 1.5 }}>
          This cancels the calendar event and tells the attendees. It can&apos;t
          be undone here.
        </DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Keep it
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={pending}
          startIcon={pending ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {pending ? "Cancelling" : "Cancel meeting"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
