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

import { useState, type JSX } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Avatar, Box, Button, ButtonBase, Chip, InputAdornment, Paper, Skeleton, Stack, TextField, Typography } from "@wso2/oxygen-ui";
import { MailIcon, SearchIcon, UserPlusIcon } from "@wso2/oxygen-ui-icons-react";
import type { Contact } from "@features/sales/cado2/quotes/api/quoteTypes";
import { emptyContact, type DraftFormValues } from "@features/sales/cado2/quotes/form/draftForm";
import { initialsOfName } from "@features/sales/cado2/utils/initials";
import { useFieldIssue } from "./fieldIssues";

type ContactField = "billingContact" | "securityContact";

interface ContactPickerProps {
  readonly name: ContactField;
  /** Backend field prefix for issues, e.g. "contacts.billing". */
  readonly issueField: string;
  readonly label: string;
  /** The customer account's contacts. */
  readonly contacts: readonly Contact[];
  readonly loading: boolean;
  readonly helperText?: string;
}

/** What each picker chooses, for "No billing contact chosen yet" and "Choose the billing contact". */
const ROLE: Record<ContactField, string> = { billingContact: "billing contact", securityContact: "security contact" };

/**
 * Pick a contact of the account, or type in someone who isn't in Salesforce.
 * Nothing chosen yet: a card offering "Choose from Salesforce" or "Someone
 * not in Salesforce…" (2026-10-09: an open list on arrival read as a directory,
 * not a choice). Choosing shows a searchable list headed "Choose the billing
 * contact"; a click on a name picks it (F5 feedback, 2026-09-25). A chosen
 * contact shows as a card with Change. Only Salesforce Ids and typed text are
 * sent; the backend snapshots the contact's details.
 */
export default function ContactPicker({ name, issueField, label, contacts, loading, helperText }: ContactPickerProps): JSX.Element {
  const { control, setValue } = useFormContext<DraftFormValues>();
  const value = useWatch({ control, name });
  const idIssue = useFieldIssue(`${issueField}.sfContactId`);
  const nameIssue = useFieldIssue(`${issueField}.name`);
  const [changing, setChanging] = useState(false);
  const [search, setSearch] = useState("");

  const pick = (c: Contact) => {
    setValue(name, { mode: "salesforce", sfContactId: c.id ?? "", name: c.name ?? "", title: c.title ?? "", email: c.email ?? "" }, { shouldDirty: true });
    setChanging(false);
    setSearch("");
  };
  const typeIn = () => {
    setValue(name, { ...emptyContact, mode: "manual" }, { shouldDirty: true });
    setChanging(false);
  };
  const clear = () => setValue(name, { ...emptyContact }, { shouldDirty: true });

  const heading = (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      {helperText ? (
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      ) : null}
    </Box>
  );

  // Nothing chosen yet: say so, and offer the two ways to choose.
  if (value.mode === "none" && !changing) {
    return (
      <Stack spacing={1}>
        {heading}
        <Paper variant="outlined" aria-label={`${label}: none chosen`} sx={{ p: 1.75, borderRadius: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "flex-start", sm: "center" }}>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              No {ROLE[name]} chosen yet
            </Typography>
            <Button size="small" variant="outlined" startIcon={<SearchIcon size={14} />} onClick={() => setChanging(true)}>
              Choose from Salesforce
            </Button>
            <Button size="small" startIcon={<UserPlusIcon size={14} />} onClick={typeIn}>
              Someone not in Salesforce…
            </Button>
          </Stack>
        </Paper>
        {idIssue ? (
          <Typography variant="caption" color="error">
            {idIssue}
          </Typography>
        ) : null}
      </Stack>
    );
  }

  // Chosen from Salesforce: a card.
  if (value.mode === "salesforce" && value.sfContactId && !changing) {
    return (
      <Stack spacing={1}>
        {heading}
        <Paper variant="outlined" aria-label={`${label}: ${value.name}`} sx={{ p: 1.75, borderRadius: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ width: 40, height: 40, bgcolor: "primary.main", color: "primary.contrastText", fontSize: 15 }}>
              {initialsOfName(value.name || "?")}
            </Avatar>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                {value.name || value.sfContactId}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div" noWrap>
                {[value.title, value.email].filter(Boolean).join(" · ") || "Salesforce contact"}
              </Typography>
            </Box>
            <Chip size="small" variant="outlined" label="Salesforce" sx={{ display: { xs: "none", sm: "flex" } }} />
            <Button size="small" onClick={() => setChanging(true)} aria-label={`Change ${label.toLowerCase()}`}>
              Change
            </Button>
          </Stack>
        </Paper>
        {idIssue ? (
          <Typography variant="caption" color="error">
            {idIssue}
          </Typography>
        ) : null}
      </Stack>
    );
  }

  // Typed in: the fields, with a way back to Salesforce.
  if (value.mode === "manual" && !changing) {
    return (
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          {heading}
          <Button size="small" onClick={() => setChanging(true)}>
            Pick from Salesforce instead
          </Button>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Controller
            name={`${name}.name`}
            control={control}
            render={({ field }) => (
              <TextField {...field} label="Name" size="small" fullWidth required error={Boolean(nameIssue)} helperText={nameIssue} />
            )}
          />
          <Controller
            name={`${name}.email`}
            control={control}
            render={({ field }) => <TextField {...field} label="Email" type="email" size="small" fullWidth />}
          />
          <Controller name={`${name}.title`} control={control} render={({ field }) => <TextField {...field} label="Title" size="small" fullWidth />} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Someone not in Salesforce. They are kept on this quote only, not added to Salesforce.
        </Typography>
      </Stack>
    );
  }

  // Choosing: a searchable list of the account's contacts.
  const term = search.trim().toLowerCase();
  const shown = contacts.filter((c) => c.id && (!term || [c.name, c.title, c.email].some((f) => f?.toLowerCase().includes(term))));
  const hadValue = value.mode !== "none";
  return (
    <Stack spacing={1}>
      {heading}
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Choose the {ROLE[name]}
          </Typography>
          <TextField
            size="small"
            placeholder="Search by name, title or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              htmlInput: { "aria-label": `Search ${label.toLowerCase()}` },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon size={16} />
                  </InputAdornment>
                ),
              },
            }}
          />
          {loading ? (
            <Stack spacing={1} aria-label="Loading contacts">
              {[0, 1].map((i) => (
                <Skeleton key={i} variant="rounded" height={48} />
              ))}
            </Stack>
          ) : shown.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
              {contacts.length === 0 ? "This account has no contacts in Salesforce." : `No contacts match “${search}”.`}
            </Typography>
          ) : (
            <Box role="radiogroup" aria-label={label} sx={{ display: "flex", flexDirection: "column", gap: 0.75, maxHeight: 260, overflowY: "auto" }}>
              {shown.map((c) => (
                <ButtonBase
                  key={c.id}
                  role="radio"
                  aria-checked={value.mode === "salesforce" && value.sfContactId === c.id}
                  aria-label={c.name ?? c.id ?? ""}
                  onClick={() => pick(c)}
                  sx={{
                    display: "flex",
                    justifyContent: "flex-start",
                    gap: 1.5,
                    p: 1,
                    borderRadius: 1.5,
                    textAlign: "left",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: "primary.main", color: "primary.contrastText" }}>
                    {initialsOfName(c.name ?? "?")}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {c.name ?? c.id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div" noWrap>
                      {c.title ?? ""}
                      {c.title && c.email ? " · " : ""}
                      {c.email ? (
                        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                          <MailIcon size={11} /> {c.email}
                        </Box>
                      ) : null}
                    </Typography>
                  </Box>
                </ButtonBase>
              ))}
            </Box>
          )}
          <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ flexWrap: "wrap", rowGap: 1 }}>
            <Button size="small" startIcon={<UserPlusIcon size={14} />} onClick={typeIn}>
              Someone not in Salesforce…
            </Button>
            {changing || hadValue ? (
              <Stack direction="row" spacing={1}>
                {hadValue ? (
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => {
                      clear();
                      setChanging(false);
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
                {changing ? (
                  <Button size="small" onClick={() => setChanging(false)}>
                    Cancel
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </Stack>
      </Paper>
      {idIssue ? (
        <Typography variant="caption" color="error">
          {idIssue}
        </Typography>
      ) : null}
    </Stack>
  );
}
