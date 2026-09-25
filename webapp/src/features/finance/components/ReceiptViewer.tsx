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

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { DownloadIcon, TrashIcon, XIcon } from "@wso2/oxygen-ui-icons-react";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { describeError } from "../util/financeError";
import type { ReceiptSource } from "../util/financeReceipts";

// Inline receipt/attachment preview. Parent passes a `load` thunk (null =
// closed); the viewer fetches on open, renders an <img> for images or an
// <iframe> for PDFs, and revokes any object URL on close. Keeping the fetch
// here means callers just supply a loader bound to the right endpoint +
// token.
export function ReceiptViewer({
  title = "Receipt",
  load,
  onClose,
  onRemove,
}: {
  title?: string;
  load: (() => Promise<ReceiptSource>) | null;
  onClose: () => void;
  /**
   * AttachmentButton.tsx:467-477 — the source's own viewer offers Remove
   * beside Download rather than making it a separate control back on the
   * form, and only when the caller is allowed to correct the row at all
   * (`!disableEdit`). Omitted entirely, not merely hidden, when the caller
   * has nothing to offer here — a read-only view of someone else's
   * submission, say.
   */
  onRemove?: () => Promise<void>;
}) {
  const { showError } = useNotifications();
  const [source, setSource] = useState<ReceiptSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (!onRemove) return;
    setRemoving(true);
    try {
      await onRemove();
      onClose();
    } catch (err) {
      showError(describeError(err));
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSource(null);
    load()
      .then((src) => {
        if (cancelled) {
          if (src.url.startsWith("blob:")) URL.revokeObjectURL(src.url);
          return;
        }
        if (src.url.startsWith("blob:")) objectUrl = src.url;
        setSource(src);
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [load]);

  const isPdf = source?.type === "application/pdf";
  const isImage = source?.type.startsWith("image/") ?? false;
  const previewable = isPdf || isImage;

  return (
    <Dialog open={!!load} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ p: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 3, py: 2 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{title}</Typography>
          <IconButton size="small" onClick={onClose} disabled={removing} aria-label="Close">
            <XIcon size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 320 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 280 }}>
            <CircularProgress size={28} />
          </Box>
        ) : error ? (
          <Alert severity="error">Couldn't load the file. {error}</Alert>
        ) : source ? (
          isPdf ? (
            <Box
              component="iframe"
              title={title}
              src={source.url}
              sx={{ width: "100%", height: "min(78vh, 900px)", border: 0 }}
            />
          ) : isImage ? (
            <Box
              component="img"
              alt={title}
              src={source.url}
              sx={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "min(78vh, 900px)",
                mx: "auto",
                objectFit: "contain",
              }}
            />
          ) : (
            <Alert severity="info">
              This file type can't be previewed here. Use Download to open it.
            </Alert>
          )
        ) : null}
      </DialogContent>
      <DialogActions>
        {source && (
          // Download rather than navigate: a top-level blob:/data: navigation
          // of a non-previewable (e.g. HTML) payload would run in the app
          // origin. `download` forces a save instead.
          <Tooltip title="Download" arrow>
            <IconButton
              size="small"
              component="a"
              href={source.url}
              download={previewable ? title : `${title}.download`}
              aria-label="Download"
            >
              <DownloadIcon size={18} />
            </IconButton>
          </Tooltip>
        )}
        {onRemove && source && (
          <Tooltip title={removing ? "Removing…" : "Remove"} arrow>
            <span>
              <IconButton
                size="small"
                color="error"
                onClick={() => void remove()}
                disabled={removing}
                aria-label="Remove"
              >
                {removing ? <CircularProgress size={16} color="error" /> : <TrashIcon size={18} />}
              </IconButton>
            </span>
          </Tooltip>
        )}
      </DialogActions>
    </Dialog>
  );
}
