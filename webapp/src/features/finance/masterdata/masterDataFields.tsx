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

import { useState } from "react";
import { Autocomplete, Chip, TextField } from "@wso2/oxygen-ui";
import { isCreditCardNumberValid } from "./masterDataForm";
import type { LabelledId } from "./masterDataTypes";

/**
 * The form controls the four master-data dialogs are built from.
 *
 * Shared rule across all of them: a required field only turns red once it
 * has been touched and left empty, never while it is still being filled in
 * for the first time. Written here as a `touched` flag set on blur.
 *
 * `TextField`/`Autocomplete` come through Oxygen UI, so these pick up the
 * portal's field sizing, focus ring and dark-mode tokens automatically.
 */

const FIELD_PROPS = {
  fullWidth: true,
  margin: "dense",
  size: "small",
  autoComplete: "off",
} as const;

/**
 * A single-line text or number field.
 *
 * `type="number"` reports its value as a number and treats a blank box as 0
 * — how "nothing entered" is spelled for the numeric ids on this backend,
 * and `isFormComplete` reads it back the same way.
 */
export function TextInput({
  id,
  label,
  value,
  required,
  numeric = false,
  multiline = false,
  disabled = false,
  helperText,
  onChange,
}: {
  id: string;
  label: string;
  value: string | number;
  required: boolean;
  numeric?: boolean;
  multiline?: boolean;
  /** Shown but not editable, for a value another field derives. */
  disabled?: boolean;
  /** A sample value, so the shape expected is readable before it is typed. */
  helperText?: string;
  onChange: (id: string, value: string | number) => void;
}) {
  const [touched, setTouched] = useState(false);
  // Held locally so a number field can show an empty box rather than the 0
  // it reports upward, and so trailing whitespace survives until blur.
  const [text, setText] = useState(value === 0 ? "" : String(value ?? ""));

  const handleChange = (next: string) => {
    setText(next);
    if (numeric) {
      const parsed = Number.parseInt(next, 10);
      onChange(id, Number.isNaN(parsed) ? 0 : parsed);
    } else {
      onChange(id, next.trim());
    }
  };

  return (
    <TextField
      {...FIELD_PROPS}
      id={id}
      label={label}
      required={required}
      type={numeric ? "number" : "text"}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      disabled={disabled}
      helperText={helperText}
      // A derived field is driven by its prop, not by the local draft: `text`
      // is seeded once at mount, so a value another field fills in would
      // otherwise never show.
      value={disabled ? String(value ?? "") : text}
      error={required && !disabled && touched && !text.trim()}
      onBlur={() => required && setTouched(true)}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}

/**
 * Pick one of a fixed list.
 *
 * `freeSolo` lets a value be typed that is not on the list — turned on for
 * Expense Type, where the list is the types that already exist and the
 * point of the form is often to add one that does not.
 */
export function SelectInput({
  id,
  label,
  value,
  options,
  required,
  freeSolo = false,
  helperText,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  required: boolean;
  freeSolo?: boolean;
  /** A sample value, or a note on what the list is. */
  helperText?: string;
  onChange: (id: string, value: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  return (
    <Autocomplete
      id={id}
      options={options}
      value={value || null}
      freeSolo={freeSolo}
      autoHighlight
      onBlur={() => required && setTouched(true)}
      // One handler or the other, never both — `CustomAutoCompleteTextField.tsx:89-95`.
      // A free-text single reports through `onInputChange`, because the value
      // is whatever has been typed, committed to an option or not; a fixed
      // list reports through `onChange`, which only fires on a real choice.
      onChange={freeSolo ? undefined : (_e, next) => onChange(id, next ?? "")}
      onInputChange={freeSolo ? (_e, next) => onChange(id, next ?? "") : undefined}
      renderInput={(params) => (
        <TextField
          {...params}
          {...FIELD_PROPS}
          label={label}
          required={required}
          helperText={helperText}
          error={required && touched && !value}
        />
      )}
    />
  );
}

/**
 * Pick one of a list whose entries are an id with a label.
 *
 * Expense Category and GL Code filter on a numeric id but read as a name, so
 * the option object goes in and the id comes out.
 */
export function IdSelectInput({
  id,
  label,
  value,
  options,
  required,
  helperText,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  options: readonly LabelledId[];
  required: boolean;
  /** A sample value, or a note on what the list is. */
  helperText?: string;
  onChange: (id: string, value: number) => void;
}) {
  const [touched, setTouched] = useState(false);
  // 0 is "nothing chosen", so it must not resolve to an option.
  const selected = options.find((o) => o.id === value) ?? null;
  return (
    <Autocomplete
      id={id}
      options={options}
      value={selected}
      autoHighlight
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      onBlur={() => required && setTouched(true)}
      onChange={(_e, next) => onChange(id, next ? next.id : 0)}
      renderInput={(params) => (
        <TextField
          {...params}
          {...FIELD_PROPS}
          label={label}
          required={required}
          helperText={helperText}
          error={required && touched && !value}
        />
      )}
    />
  );
}

/**
 * The helper line every multi-select carries unless it is given another.
 *
 * Without it, that these lists accept values not already on them is
 * something the reader has to guess.
 */
const MULTI_SELECT_HELPER = "Pick from the list, or type a new value";

/**
 * Caps the field's height and scrolls its chips inside it.
 *
 * Opt-in, because by default a multi-select grows a row taller per chip,
 * which is what a form with room below it should do. On a form that has none
 * the growing field pushes everything under it off the dialog instead.
 * Scrolled rather than truncated: every chip has to stay reachable, because
 * reaching it is how you delete it.
 */
const SCROLLING_CHIPS_SX = {
  "& .MuiAutocomplete-inputRoot": { maxHeight: 72, overflowY: "auto" },
} as const;

/**
 * Pick any number of values, typing new ones as needed.
 *
 * Every multi-select in the source is `freeForm` — engagement codes, their
 * suffixes and lead emails are all lists the form is allowed to extend.
 *
 * `autoSelect` is what makes a typed value count. Without it a half-typed
 * entry is thrown away when the field loses focus, so someone who types a
 * code the list does not offer and goes straight for Submit loses it: the
 * list ends up empty, the either-or group it belongs to reads as unfilled
 * and Submit stays disabled. The field then looks like it accepts only the
 * codes already on the list, because picking one of those is the only route
 * that leaves a chip behind.
 *
 * `autoHighlight` is off for the same reason. It highlights the first
 * suggestion as you type, and Enter takes the highlight over what was typed
 * — so a new code that happens to read as the start of an existing one is
 * quietly replaced by that existing one.
 */
export function MultiSelectInput({
  id,
  label,
  values,
  options,
  required,
  helperText,
  hideHelper = false,
  scrollChips = false,
  onChange,
}: {
  id: string;
  label: string;
  values: readonly string[];
  options: readonly string[];
  required: boolean;
  /** Replaces the default "type and press Enter" line — add a sample to it. */
  helperText?: string;
  /**
   * Drops the helper line altogether, for a form that says the same thing
   * once below a pair of these fields rather than twice beside them.
   */
  hideHelper?: boolean;
  /** Keeps the field one height whatever is selected — see `SCROLLING_CHIPS_SX`. */
  scrollChips?: boolean;
  onChange: (id: string, values: string[]) => void;
}) {
  const [touched, setTouched] = useState(false);
  return (
    <Autocomplete
      id={id}
      multiple
      freeSolo
      autoSelect
      options={options}
      value={[...values]}
      sx={scrollChips ? SCROLLING_CHIPS_SX : undefined}
      onBlur={() => required && setTouched(true)}
      // Blank entries are dropped on the way in, the way `FormDialog.tsx:96-110`
      // filters them — pressing Enter on an empty box should not add a chip
      // that then counts as "filled".
      onChange={(_e, next) => onChange(id, next.map((v) => v.trim()).filter(Boolean))}
      renderTags={(tags, getTagProps) =>
        tags.map((tag, index) => (
          <Chip {...getTagProps({ index })} key={tag} label={tag} size="small" />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          {...FIELD_PROPS}
          label={label}
          required={required}
          error={required && touched && values.length === 0}
          helperText={hideHelper ? undefined : (helperText ?? MULTI_SELECT_HELPER)}
        />
      )}
    />
  );
}

/**
 * The card number, validated against the shape its provider issues.
 *
 * `CCNumberValidateTextField.tsx` — the helper text tells you the format
 * before you type it, and says to choose a provider first when none is
 * chosen, because the format depends on which one it is.
 */
export function CreditCardNumberInput({
  id,
  label,
  value,
  providerCode,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  providerCode: string;
  required: boolean;
  onChange: (id: string, value: string) => void;
}) {
  const [touched, setTouched] = useState(false);
  const helperText = !providerCode
    ? "Please select credit card provider code"
    : providerCode === "AMEX"
      ? "Format should be 123-12345"
      : "Format should be 1234-1234";
  const valid = providerCode.length > 0 && isCreditCardNumberValid(providerCode, value);

  return (
    <TextField
      {...FIELD_PROPS}
      id={id}
      label={label}
      required={required}
      value={value}
      helperText={helperText}
      error={touched && (!value.trim() || !valid)}
      onBlur={() => required && setTouched(true)}
      onChange={(e) => onChange(id, e.target.value.trim())}
    />
  );
}
