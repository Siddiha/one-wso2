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
import { useState, type FocusEvent } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import type { PaperProps } from "@wso2/oxygen-ui";
import { dialogPaperSx } from "@components/confirmation-dialog/dialogPaperSx";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { useCustomerSearch, useTilUserInfo } from "../api/useTilData";
import { useCreateTilSubmission, useUploadTilImage } from "../api/useTilMutations";
import {
  TIL_TITLE_MAX_LENGTH,
  TIL_WHAT_MAX_LENGTH,
  TIL_WHERE_DETAIL_MAX_LENGTH,
  TIL_WHERE_OPTIONS,
  type TilWhere,
} from "../api/tilTypes";
import { describeError } from "../util/tilError";
import { isEmptyTilHtml, tilPlainTextLength } from "../util/tilRichText";
import TilRichTextField from "./TilRichTextField";

// Where options whose feed entry needs a bit more detail -- which customer,
// which partner, or what "Other" actually means here. Internal is the one
// option that's already self-explanatory on its own.
const WHERE_OPTIONS_NEEDING_DETAIL: readonly TilWhere[] = ["Customer", "Partner", "Other"];

// MUI's Autocomplete unconditionally skips `noOptionsText` when `freeSolo`
// is set (see Autocomplete.js: `groupedOptions.length === 0 && !freeSolo`)
// -- freeSolo is required here (a not-yet-onboarded customer must still be
// a valid submission), so with zero matches the Popper mounted an entirely
// EMPTY Paper: visually indistinguishable from the dropdown never opening
// at all, which is what every prior bug report actually showed. This paper
// slot renders our own fallback text instead of relying on that
// internally-gated branch, confirmed against a standalone repro using the
// same MUI/oxygen-ui build before being applied here. Used by the Customer
// field below -- Partner is plain free-text (no backing search service
// exists for it the way entity-service backs Customer), so it never needed
// this component, but the loading/empty props stay generic in case another
// Autocomplete field needs the same workaround later.
//
// Defined at module scope (not inside SubmitEntryDialog) and taking
// loading/empty as props rather than closing over component state -- a
// function component defined inside another component's render body is a
// NEW component type on every render, which made MUI unmount/remount the
// Popper's own Paper (losing scroll position, flickering the list) on
// every keystroke.
function TilAutocompletePaper({
  children,
  loading,
  loadingLabel,
  empty,
  emptyLabel,
  ...paperProps
}: PaperProps & { loading?: boolean; loadingLabel?: string; empty?: boolean; emptyLabel?: string }) {
  return (
    <Paper {...paperProps}>
      {loading ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
          {loadingLabel}
        </Typography>
      ) : empty ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
          {emptyLabel}
        </Typography>
      ) : (
        children
      )}
    </Paper>
  );
}

// No searchable partner list exists the way Customer has one (see
// useCustomerSearch) -- no backing service tracks partner organizations as
// a standalone, searchable list. Plain free-text instead of an
// Autocomplete with suggestions (see the Partner field below).

// Shared by all three whereDetail variants (Customer/Partner/Other) --
// whereDetailInvalid now covers two different problems (empty, or over the
// length limit), and "Required" was misleading for the second one.
function whereDetailErrorText(value: string): string {
  return value.trim().length === 0 ? "Required" : `Must be ${TIL_WHERE_DETAIL_MAX_LENGTH} characters or fewer`;
}

function whereDetailCopy(where: TilWhere): { label: string; placeholder: string; helper: string } {
  switch (where) {
    case "Customer":
      return { label: "Customer name", placeholder: "e.g. Acme Corp", helper: "" };
    case "Partner":
      return { label: "Partner name", placeholder: "e.g. Acme Reseller", helper: "" };
    default:
      return {
        label: "Please explain",
        placeholder: "e.g. a conference, a vendor demo, an internal hackathon",
        helper: "What \"Other\" means here",
      };
  }
}

// The "+ New entry" form. Mirrors the field set the Chat App's own Dialog
// presents (Who / Where / What) so the two entry points feel like the same
// product — see the backend's openapi.yaml for the shared contract.
export default function SubmitEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const userInfo = useTilUserInfo();
  const [title, setTitle] = useState("");
  const [where, setWhere] = useState<TilWhere | "">("");
  const [whereDetail, setWhereDetail] = useState("");
  const [what, setWhat] = useState("");
  const [touched, setTouched] = useState(false);
  const create = useCreateTilSubmission();
  const uploadImage = useUploadTilImage();
  // True while TilRichTextField has an image upload in flight -- blocks
  // Share so a submission can never go out missing an image the user
  // thought they'd just attached (see TilRichTextField's onUploadingChange
  // for the full race condition this closes).
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  // Only searches real customer records -- Partner/Other keep plain
  // free-text entry (no equivalent searchable list exists for them). null
  // (not "") when where !== "Customer" so useCustomerSearch knows the field
  // isn't in play at all, vs. "" meaning "in play, nothing typed yet" (see
  // its own doc comment for why that distinction matters -- it's what lets
  // focusing the field with nothing typed still browse real customers).
  // whereDetail doubles as the search query here: whatever's currently
  // typed is both the field's value AND the in-flight search term, the
  // same combined role MUI's own Autocomplete freeSolo pattern expects.
  const customerSearch = useCustomerSearch(where === "Customer" ? whereDetail : null);
  const customerOptions = customerSearch.data?.map((c) => c.name) ?? [];
  // Open is a direct, fully-derived boolean (just "focused") rather than
  // round-tripping through MUI's own onOpen/onClose -- that round-trip
  // turned out not to reliably fire for this freeSolo + controlled-
  // inputValue combination, which is what silently kept the panel closed
  // even once there was a real answer (match, "no match", or "still
  // searching") to show.
  const [customerFieldFocused, setCustomerFieldFocused] = useState(false);
  const customerFieldOpen = customerFieldFocused;
  const { showSuccess, showError } = useNotifications();

  // The byline is the signed-in user's own name — never typed, so it can't
  // be used to credit (or blame) someone else. Name only, not "(email)" --
  // the email added nothing a reader couldn't already tell from the name,
  // and submittedByEmail already carries it independently on the backend
  // side for anything that actually needs it (e.g. the delete-your-own-
  // entry check), so the public byline doesn't need to repeat it.
  const who = userInfo.data ? userInfo.data.displayName : "";
  const whoInvalid = !userInfo.data;
  const titleInvalid = title.trim().length === 0 || title.trim().length > TIL_TITLE_MAX_LENGTH;
  const whereInvalid = where === "";
  const needsWhereDetail = where !== "" && WHERE_OPTIONS_NEEDING_DETAIL.includes(where);
  const whereDetailInvalid =
    needsWhereDetail &&
    (whereDetail.trim().length === 0 || whereDetail.trim().length > TIL_WHERE_DETAIL_MAX_LENGTH);
  const whatLength = tilPlainTextLength(what);
  const whatInvalid = isEmptyTilHtml(what) || whatLength > TIL_WHAT_MAX_LENGTH;
  const invalid = whoInvalid || titleInvalid || whereInvalid || whereDetailInvalid || whatInvalid || isUploadingImage;

  const reset = () => {
    setTitle("");
    setWhere("");
    setWhereDetail("");
    setWhat("");
    setTouched(false);
    setIsUploadingImage(false);
    create.reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    setTouched(true);
    if (invalid) return;
    create.mutate(
      {
        title: title.trim(),
        who,
        where: where as TilWhere,
        what,
        ...(needsWhereDetail ? { whereDetail: whereDetail.trim() } : {}),
      },
      {
        onSuccess: () => {
          showSuccess("Thanks for sharing what you learned!");
          close();
        },
        onError: (err) => showError(describeError(err)),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={create.isPending ? undefined : close}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: { sx: dialogPaperSx },
        backdrop: { sx: { bgcolor: "rgba(10,10,11,.4)", backdropFilter: "blur(3px)" } },
      }}
    >
      <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>Today I Learned</DialogTitle>
      <DialogContent dividers sx={{ display: "flex", gap: 3, minHeight: 420 }}>
        {/* Left quarter: who's submitting it and where it came from.
            Every field here is labeled with a plain Typography above it,
            not MUI's floating notched label — a short label ("Who") and a
            longer one ("Customer name") produce different-width gaps in
            the border otherwise, which reads as misaligned even though
            each one is individually correct. Same pattern "What did you
            learn?" already uses on the right. */}
        <Stack spacing={2} sx={{ width: "25%", minWidth: 220, display: "flex", flexDirection: "column", height: "100%" }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color={touched && whereInvalid ? "error" : "text.primary"}>
              Source
            </Typography>
            <TextField
              select
              value={where}
              onChange={(e) => {
                setWhere(e.target.value as TilWhere);
                setWhereDetail("");
              }}
              error={touched && whereInvalid}
              helperText={touched && whereInvalid ? "Required" : "Who this learning came from"}
              fullWidth
              autoFocus
              // The select variant renders its box ~3px taller than a plain
              // TextField by default (measured directly: 40.125px vs
              // 37.125px) -- harmless on its own, but this field sits in
              // the same row as the plain "Title" field on the right, and
              // the extra height makes the two look misaligned even though
              // each is individually correct. Pinned to the plain variant's
              // real measured height so both line up exactly.
              sx={{ "& .MuiInputBase-root": { height: "37.125px" } }}
            >
              {TIL_WHERE_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {needsWhereDetail && where === "Customer" && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color={touched && whereDetailInvalid ? "error" : "text.primary"}>
                {whereDetailCopy(where).label}
              </Typography>
              <Autocomplete
                freeSolo
                // Real matches first, but typing something not in the list
                // (a new/not-yet-onboarded customer, or just a name entity-
                // service doesn't have) is still a valid submission --
                // freeSolo + this filter (not the default "only show exact
                // substring matches") is what lets the typed value itself
                // stand in as its own option rather than being rejected.
                filterOptions={(options) => options}
                options={customerOptions}
                loading={customerSearch.isLoading}
                slots={{ paper: TilAutocompletePaper }}
                open={customerFieldOpen}
                inputValue={whereDetail}
                onInputChange={(_event, next) => setWhereDetail(next)}
                onChange={(_event, next) => setWhereDetail(next ?? "")}
                // The Popper has no z-index of its own by default, and this
                // field lives inside a Dialog (z-index: theme.zIndex.modal,
                // 1300) -- without this it portals to document.body but can
                // still end up stacked BEHIND the dialog's own paper, which
                // is the other half of why the panel looked like it never
                // opened at all. 1301 is deliberately just one above modal,
                // not an arbitrarily large number, so it still sits below
                // anything that's genuinely meant to cover a dialog (a
                // confirmation dialog stacked on top of this one, etc.).
                // placement + the disabled "flip" modifier pin the panel
                // below the field always -- Popper's default behaviour flips
                // it above when it judges there isn't enough room below
                // (true here, since this field sits low in a short left
                // column), which covered the Who/Where fields above it
                // instead of the content below. listbox's maxHeight keeps
                // a long result list from growing tall enough to do the same
                // thing by itself.
                slotProps={{
                  // `loading`/`empty` are CustomerAutocompletePaper's own
                  // extra props (see its definition above), not part of
                  // MUI's own PaperProps -- this environment's resolved
                  // @mui/material type declarations don't infer them back
                  // from `slots.paper`'s own component type the way some
                  // other dependency-resolution outcomes do, so the cast is
                  // bridging a type-only gap, not a real runtime one: MUI
                  // still passes these straight through to our component.
                  paper: {
                    loading: customerSearch.isLoading,
                    loadingLabel: "Searching customers…",
                    empty: customerOptions.length === 0,
                    emptyLabel: "No matching customer — you can still use this name",
                  } as PaperProps,
                  popper: { style: { zIndex: 1301 }, placement: "bottom-start", modifiers: [{ name: "flip", enabled: false }] },
                  listbox: { sx: { maxHeight: 240 } },
                }}
                renderInput={(params) => {
                  // Same story as the cast above: `onFocus`/`onBlur` ARE
                  // present on the real params object at runtime (MUI's own
                  // anchor/positioning bookkeeping depends on them existing
                  // -- confirmed by hand before this fix even existed), this
                  // environment's resolved type for AutocompleteRenderInputParams
                  // just doesn't declare them.
                  const inputProps = params as typeof params & {
                    onFocus?: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
                    onBlur?: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
                  };
                  return (
                    <TextField
                      {...params}
                      placeholder={whereDetailCopy(where).placeholder}
                      error={touched && whereDetailInvalid}
                      helperText={touched && whereDetailInvalid ? whereDetailErrorText(whereDetail) : whereDetailCopy(where).helper}
                      // Chained, not replaced: these are MUI's OWN internal
                      // handlers (anchor/positioning bookkeeping the Popper
                      // needs to render at all) -- overwriting them outright,
                      // which an earlier version of this did, silently broke
                      // the dropdown's own positioning even once `open` was
                      // correctly true.
                      onFocus={(e) => {
                        inputProps.onFocus?.(e);
                        setCustomerFieldFocused(true);
                      }}
                      onBlur={(e) => {
                        inputProps.onBlur?.(e);
                        setCustomerFieldFocused(false);
                      }}
                    />
                  );
                }}
                fullWidth
              />
            </Stack>
          )}
          {needsWhereDetail && where === "Partner" && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color={touched && whereDetailInvalid ? "error" : "text.primary"}>
                {whereDetailCopy(where).label}
              </Typography>
              {/* Plain free-text, same as "Other" -- no backing search
                  service exists for partners the way entity-service backs
                  Customer, so a static sample list here would just be a
                  handful of fictional company names a user could select
                  and submit as a real entry's partner. */}
              <TextField
                placeholder={whereDetailCopy(where).placeholder}
                value={whereDetail}
                onChange={(e) => setWhereDetail(e.target.value)}
                error={touched && whereDetailInvalid}
                helperText={
                  touched && whereDetailInvalid
                    ? whereDetailErrorText(whereDetail)
                    : `${whereDetail.length}/${TIL_WHERE_DETAIL_MAX_LENGTH}`
                }
                fullWidth
                slotProps={{ htmlInput: { maxLength: TIL_WHERE_DETAIL_MAX_LENGTH } }}
              />
            </Stack>
          )}
          {needsWhereDetail && where === "Other" && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color={touched && whereDetailInvalid ? "error" : "text.primary"}>
                {whereDetailCopy(where).label}
              </Typography>
              <TextField
                placeholder={whereDetailCopy(where).placeholder}
                value={whereDetail}
                onChange={(e) => setWhereDetail(e.target.value)}
                error={touched && whereDetailInvalid}
                helperText={touched && whereDetailInvalid ? whereDetailErrorText(whereDetail) : `${whereDetailCopy(where).helper} · ${whereDetail.length}/${TIL_WHERE_DETAIL_MAX_LENGTH}`}
                fullWidth
                slotProps={{ htmlInput: { maxLength: TIL_WHERE_DETAIL_MAX_LENGTH } }}
              />
            </Stack>
          )}

        </Stack>

        {/* Right three-quarters: the headline, then the actual learning. */}
        <Box sx={{ width: "75%", display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color={touched && titleInvalid ? "error" : "text.primary"}>
              Title
            </Typography>
            <TextField
              placeholder="e.g. API latency and connection pooling"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={touched && titleInvalid}
              helperText={
                touched && titleInvalid
                  ? title.trim().length === 0
                    ? "Required"
                    : `Must be ${TIL_TITLE_MAX_LENGTH} characters or fewer`
                  : `${title.length}/${TIL_TITLE_MAX_LENGTH}`
              }
              fullWidth
              slotProps={{ htmlInput: { maxLength: TIL_TITLE_MAX_LENGTH } }}
            />
          </Stack>
          <Typography variant="subtitle2" color={touched && whatInvalid ? "error" : "text.primary"}>
            What did you learn?
          </Typography>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <TilRichTextField
              value={what}
              onChange={setWhat}
              onUploadImage={uploadImage}
              onUploadError={showError}
              onUploadingChange={setIsUploadingImage}
              placeholder="What did you learn? Explain it so others can learn from it too."
            />
          </Box>
          <Typography variant="caption" color={touched && whatInvalid ? "error" : "text.secondary"}>
            {whatLength}/{TIL_WHAT_MAX_LENGTH}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
            Submitted by
          </Typography>
          <Typography variant="caption" sx={{ display: "block", lineHeight: 1.3 }}>
            {userInfo.isLoading
              ? "Loading…"
              : userInfo.data
                ? `${userInfo.data.displayName} (${userInfo.data.email})`
                : "Couldn't load your name"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={create.isPending || isUploadingImage}>
            {create.isPending ? "Sharing…" : isUploadingImage ? "Uploading image…" : "Share"}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
