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
import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Pagination,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { PlusIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "@wso2/oxygen-ui-icons-react";
import { useNavigate } from "react-router";
import ConfirmationDialog, { type ConfirmationContent } from "@components/confirmation-dialog/ConfirmationDialog";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { isTilBackendConfigured, useTilSubmissions, useTilUserInfo } from "../api/useTilData";
import { useDeleteTilSubmission } from "../api/useTilMutations";
import { describeError } from "../util/tilError";
import { tilPlainText } from "../util/tilRichText";
import SubmissionCard from "../components/SubmissionCard";
import SubmitEntryDialog from "../components/SubmitEntryDialog";
import TilShell from "../components/TilShell";

// Local calendar day (not UTC) so it lines up with what the "Submitted on"
// date input shows and with how SubmissionCard's own timestamp is rendered
// (toLocaleString, also local time) — matching either by UTC date would
// drift by a day right around midnight for a lot of this company's offices.
function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const ENTRIES_PER_PAGE = 10;

// Today I Learned: a company-wide feed of learnings from customers, partners,
// and internal sources, plus the form to add one. A Google Chat App's "+"
// Dialog is a second way to post an entry, calling the same
// ONE_WSO2_TIL_BACKEND_URL this page's "New entry" button does.
export default function TilHomePage() {
  const navigate = useNavigate();
  const configured = isTilBackendConfigured();
  const userInfo = useTilUserInfo();
  const submissions = useTilSubmissions();
  const deleteSubmission = useDeleteTilSubmission();
  const { showError, showSuccess } = useNotifications();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmContent, setConfirmContent] = useState<ConfirmationContent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasActiveDateFilter = Boolean(dateFrom || dateTo);
  // Defaults to "all" -- the database already holds entries from many other
  // people (not just the signed-in employee), and that shared feed is the
  // whole point of this page, so it's the view people should land on
  // rather than "my own entries" first.
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [page, setPage] = useState(1);

  const canModerate = userInfo.data?.canModerate ?? false;
  const myEmail = userInfo.data?.email;

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (submissions.data?.items ?? []).filter((s) => {
      if (tab === "mine" && s.submittedByEmail.toLowerCase() !== myEmail?.toLowerCase()) return false;
      const day = localDateString(s.createdAt);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (!query) return true;
      // A plain substring match against entry content only, not a regex:
      // "not exact" is the whole point, and nobody searching a feed like
      // this wants to write a pattern. No scope picker in this UI (Advanced
      // Search only exposes the date range), so this always searches
      // "what was learned" -- the one field people actually want to search.
      return tilPlainText(s.what).toLowerCase().includes(query);
    });
  }, [submissions.data, searchQuery, dateFrom, dateTo, tab, myEmail]);
  const isFiltering = Boolean(searchQuery.trim() || dateFrom || dateTo || tab === "mine");

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / ENTRIES_PER_PAGE));
  // Clamped, not reset via an effect: if a filter change leaves `page`
  // pointing past the new last page, this corrects it on the same render
  // instead of flashing an empty page first and fixing it one render later.
  const safePage = Math.min(page, pageCount);
  const rangeStart = filteredItems.length === 0 ? 0 : (safePage - 1) * ENTRIES_PER_PAGE + 1;
  const rangeEnd = Math.min(safePage * ENTRIES_PER_PAGE, filteredItems.length);
  const pagedItems = filteredItems.slice((safePage - 1) * ENTRIES_PER_PAGE, safePage * ENTRIES_PER_PAGE);

  const runDelete = (id: string) => {
    setDeletingId(id);
    deleteSubmission.mutate(id, {
      onSuccess: () => showSuccess("Entry deleted"),
      onError: (err) => showError(describeError(err)),
      onSettled: () => setDeletingId(null),
    });
  };

  const confirmDelete = (id: string) => {
    setConfirmContent({
      title: "Delete this entry?",
      text: "This can't be undone — the entry will be removed from the feed for everyone.",
      confirmLabel: "Delete",
      confirmColor: "primary",
      confirmAction: () => runDelete(id),
    });
  };

  return (
    <TilShell
      title="Today I Learned"
      subtitle="A shared feed of what we're learning from customers, partners, and each other."
      configured={configured}
      configKey="ONE_WSO2_TIL_BACKEND_URL"
      action={
        <Button variant="contained" startIcon={<PlusIcon size={16} />} onClick={() => setDialogOpen(true)}>
          New entry
        </Button>
      }
    >
      {submissions.data && submissions.data.items.length > 0 && (
        <Tabs
          value={tab}
          onChange={(_, next: "all" | "mine") => {
            setTab(next);
            setPage(1);
          }}
          sx={{ mb: 1.5, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none" } }}
        >
          <Tab value="all" label="All entries" />
          {/* Disabled while identity is still loading -- myEmail is
              undefined until userInfo resolves, so selecting this tab any
              earlier filtered out every entry and showed the misleading
              "You haven't shared an entry yet." empty state even though
              nothing had actually been checked yet. */}
          <Tab value="mine" label="My entries" disabled={userInfo.isLoading} />
        </Tabs>
      )}

      {submissions.data && submissions.data.items.length > 0 && (
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="flex-end" sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
            <TextField
              size="small"
              type="search"
              placeholder="Search what was learned…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              // Pinned to one explicit height (not left to size="small"
              // alone) so this field, the Advanced Search button, and both
              // date fields below all line up exactly -- a plain TextField,
              // a Button and a date-type TextField each resolve "small" to
              // a slightly different native height in this theme, so
              // size="small" alone doesn't guarantee they match each other.
              sx={{ flex: 1, minWidth: 200, "& .MuiInputBase-root": { height: "37.125px" } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon size={16} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchQuery("")} aria-label="Clear search">
                        <XIcon size={16} />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              size="small"
              // Stays visually active even when collapsed if a date filter
              // is still silently applied -- closing this panel used to
              // just hide the date fields without clearing them, so the
              // feed stayed filtered with no indication why.
              variant={showAdvanced || hasActiveDateFilter ? "contained" : "outlined"}
              startIcon={<SlidersHorizontalIcon size={14} />}
              onClick={() => setShowAdvanced((v) => !v)}
              sx={{ flex: "none", textTransform: "none", fontWeight: 500, px: 1.5, minWidth: "auto", height: "37.125px" }}
            >
              Advanced Search{!showAdvanced && hasActiveDateFilter ? " •" : ""}
            </Button>
          </Stack>

          {showAdvanced && (
            <Stack direction="row" spacing={1.5} alignItems="flex-end" sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
              <TextField
                size="small"
                type="date"
                label="Submitted from"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { max: dateTo || undefined },
                  input: {
                    endAdornment: dateFrom && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setDateFrom("")} aria-label="Clear from date">
                          <XIcon size={16} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ width: 170, "& .MuiInputBase-root": { height: "37.125px" } }}
              />
              <TextField
                size="small"
                type="date"
                label="Submitted to"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: dateFrom || undefined },
                  input: {
                    endAdornment: dateTo && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setDateTo("")} aria-label="Clear to date">
                          <XIcon size={16} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ width: 170, "& .MuiInputBase-root": { height: "37.125px" } }}
              />
            </Stack>
          )}
        </Stack>
      )}

      {submissions.isLoading ? (
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={96} sx={{ borderRadius: 1.5 }} />
          ))}
        </Stack>
      ) : submissions.isError ? (
        <Alert severity="error">Couldn&apos;t load entries. {describeError(submissions.error)}</Alert>
      ) : filteredItems.length > 0 ? (
        <>
          <Stack spacing={1.5}>
            {pagedItems.map((s) => (
              <SubmissionCard
                key={s.id}
                submission={s}
                canDelete={canModerate || (Boolean(myEmail) && s.submittedByEmail === myEmail)}
                deleting={deletingId === s.id}
                onDelete={() => confirmDelete(s.id)}
                onOpen={() => navigate(`/knowledge-base/${s.id}`)}
              />
            ))}
          </Stack>
          <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2, mt: 2 }}>
            {pageCount > 1 && (
              <Pagination count={pageCount} page={safePage} onChange={(_, p) => setPage(p)} color="primary" />
            )}
            <Typography variant="caption" color="text.secondary">
              {rangeStart}–{rangeEnd} of {filteredItems.length}
            </Typography>
          </Box>
        </>
      ) : (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {tab === "mine" && userInfo.isError
              ? "Couldn't check which entries are yours. Try again shortly."
              : tab === "mine" && !searchQuery.trim() && !dateFrom && !dateTo
                ? "You haven't shared an entry yet."
                : isFiltering
                  ? "No entries match your search."
                  : "No entries yet. Be the first to share something you learned."}
          </Typography>
        </Box>
      )}

      <SubmitEntryDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <ConfirmationDialog content={confirmContent} onClose={() => setConfirmContent(null)} />
    </TilShell>
  );
}
