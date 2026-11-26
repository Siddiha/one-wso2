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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  ToggleButton,
} from "@wso2/oxygen-ui";
import { FilterIcon, SearchIcon, XIcon } from "@wso2/oxygen-ui-icons-react";
import InvoiceAccountMappingFilters from "../InvoiceAccountMappingFilters";
import MasterDataScreen from "../MasterDataScreen";
import { MASTER_DATA_SNACK } from "../masterDataUiText";
import {
  useGlCodes,
  useInvoiceAccountMappingAutoComplete,
  useInvoiceAccountMappings,
  useInvoiceCostTypes,
} from "../useMasterData";
import {
  countActiveInvoiceMappingFilters,
  getInvoiceMappingFilterOptions,
  toInvoiceMappingRequest,
  type InvoiceMappingFilter,
} from "../invoiceMappingFilters";

// The filter panel's height slide, and the fade that covers it. Same values
// as the expense-type bar, so the two tabs open the same way.

/** Easing for the panel opening, which decelerates into place. */
const FILTER_EASE_IN = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Easing for the panel closing, which accelerates away. */
const FILTER_EASE_OUT = "cubic-bezier(0.4, 0, 1, 1)";

/** How long the panel's height takes to open or close. */
const FILTER_SLIDE_MS = 260;

/** How long the panel's contents take to fade in. */
const FILTER_FADE_IN_MS = 220;

/** How long they take to fade out — quicker, so they are gone before the
 *  height finishes collapsing onto them. */
const FILTER_FADE_OUT_MS = 120;

/** Lets the height open before the contents arrive. */
const FILTER_FADE_DELAY_MS = 40;

/** The properties the fade animates. */
const FADE_PROPS = ["opacity", "transform"];

/**
 * One `transition` value covering every property in `FADE_PROPS`.
 *
 * @param ms - Duration of the fade.
 * @param ease - Easing curve to run it on.
 * @param delay - Pause before it starts.
 * @returns A CSS `transition` list.
 */
const fadeTransition = (ms: number, ease: string, delay = 0) =>
  FADE_PROPS.map((prop) => `${prop} ${ms}ms ${ease} ${delay}ms`).join(", ");

/**
 * Rows on a page, and the sizes the grid's footer offers.
 *
 * These match the other tabs' grid so the footer reads the same, and the
 * largest is inside the 500 the endpoint clamps to — asking for more would
 * silently get 500 back and leave the grid believing it had the rest.
 */
const MAPPING_PAGE_SIZE = 100;

/**
 * How long the search box waits before it becomes a request.
 *
 * The box is no longer narrowing rows already in the browser; every settled
 * value is a query. Short enough to feel like typing, long enough that a
 * ten-character engagement code is one request rather than ten.
 */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * The invoice account classification mappings, searched and paged.
 *
 * These decide which NetSuite account and department a travel invoice or per
 * diem bill is posted to.
 *
 * Travel Invoice mappings and Per diem mappings are one table, not two: the
 * cost type is what separates them, and "Currency (per diem / allowances)"
 * is the per diem one. So this is a single screen with a Cost Type column.
 *
 * Only the active mappings are shown unless Show Inactive is switched on. An
 * inactive mapping is a retired one, looked up when something old has to be
 * brought back.
 */
export default function InvoiceAccountMappingsPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  // What the box shows, and what the request asks for — the second follows
  // the first once the typing stops.
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<InvoiceMappingFilter>({});
  const [pageModel, setPageModel] = useState({ page: 0, pageSize: MAPPING_PAGE_SIZE });
  // So clearing the box leaves the cursor in it, ready for the next attempt.
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(search);
      // Reset with the settled term rather than with each keystroke: the page
      // a reader is on only becomes wrong once the question actually changes.
      setPageModel((model) => (model.page === 0 ? model : { ...model, page: 0 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Two cost type lists, deliberately. This one is every ACTIVE cost type, so
  // the form can file a mapping under one nothing uses yet.
  const costTypes = useInvoiceCostTypes();
  // The autocomplete's `costTypes` is the narrower list of those some mapping
  // is actually filed under, which is what the filter should offer: a cost
  // type no row carries could only filter the table down to nothing.
  const autoComplete = useInvoiceAccountMappingAutoComplete();
  // The mapping form's GL Code picker, which fills in the account number,
  // name and internal ID together.
  const glCodes = useGlCodes();

  // Every narrowing goes to the endpoint, so the reader is paging the whole
  // table and not the page they happen to be holding.
  const { request, ready } = useMemo(
    () =>
      toInvoiceMappingRequest({
        filter,
        showInactive,
        search: searchTerm,
        costTypes: autoComplete.data?.costTypes,
        page: pageModel.page,
        pageSize: pageModel.pageSize,
      }),
    [filter, showInactive, searchTerm, autoComplete.data?.costTypes, pageModel],
  );
  const query = useInvoiceAccountMappings(request, ready);

  /**
   * Back to the first page whenever the question changes.
   *
   * Page four of a narrower result may not exist, and the empty table that
   * would come back is the one answer a reader cannot tell apart from
   * "nothing matches". Done in the handlers rather than in an effect on the
   * filter, so the narrower question is never asked for the old page first.
   */
  const firstPage = () => setPageModel((model) => (model.page === 0 ? model : { ...model, page: 0 }));

  const rows = useMemo(() => query.data?.mappings ?? [], [query.data]);
  const totalCount = query.data?.totalCount ?? 0;
  const options = useMemo(
    () => getInvoiceMappingFilterOptions(rows, autoComplete.data),
    [rows, autoComplete.data],
  );
  const activeCount = countActiveInvoiceMappingFilters(filter);

  return (
    <MasterDataScreen
      tab="invoiceAccountMappings"
      rows={rows}
      loading={query.isLoading || query.isPlaceholderData}
      pagination={{ rowCount: totalCount, model: pageModel, onModelChange: setPageModel }}
      error={query.isError ? query.error : undefined}
      onRetry={() => {
        void query.refetch();
        void costTypes.refetch();
        void autoComplete.refetch();
        void glCodes.refetch();
      }}
      costTypes={costTypes.data}
      glCodes={glCodes.data}
      mappingAutoComplete={autoComplete.data}
      showGridSearch={false}
      toolbar={
        <>
          {/* Above the table rather than inside the grid's own toolbar, and
              the same shape as the Autofill Rules search: a reader hunting
              one engagement code should not have to find the box first. */}
          <TextField
            size="small"
            placeholder="Search mappings"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 260 }}
            slotProps={{
              htmlInput: { "aria-label": "Search mappings", ref: searchRef },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon size={16} />
                  </InputAdornment>
                ),
                endAdornment: search && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      edge="end"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearch("");
                        firstPage();
                        searchRef.current?.focus();
                      }}
                    >
                      <XIcon size={14} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <FormControlLabel
            sx={{ mr: 0 }}
            control={
              <Switch
                size="small"
                checked={showInactive}
                onChange={(_e, checked) => {
                  setShowInactive(checked);
                  firstPage();
                }}
              />
            }
            label="Show Inactive"
          />
          <ToggleButton
            value="filters"
            size="small"
            selected={showFilters}
            onChange={() => setShowFilters((v) => !v)}
            // One width for both labels: the toolbar is right-aligned, so a
            // button that resizes on click nudges "Add New" too.
            sx={{ textTransform: "none", gap: 0.75, px: 1.5, minWidth: 140, mr: "auto" }}
          >
            <FilterIcon size={16} />
            {showFilters ? "Hide Filters" : "Show Filters"}
            {activeCount > 0 && ` (${activeCount})`}
          </ToggleButton>
        </>
      }
    >

      {/* The cost types failing is its own failure, not the table's: the rows
          can be entirely fine while the form's required Cost Type picker has
          nothing to offer. Reported on the page rather than in a snackbar so
          it carries its own retry, and so the rows stay readable — the
          screen's retry is only shown when the rows failed as well. */}
      {costTypes.isError && (
        <Alert
          severity="error"
          variant="outlined"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void costTypes.refetch()}>
              Retry
            </Button>
          }
        >
          {MASTER_DATA_SNACK.error.costTypes}
        </Alert>
      )}

      {/* The option lists failing leaves the filter bar with nothing to
          offer, and a bar of empty pickers is the only thing that would
          otherwise say so. It also keeps the cost type filter honest: the
          request is held back while a selected cost type cannot be turned
          into the id the endpoint filters on, and this is what explains the
          wait rather than letting the table sit there looking empty. */}
      {autoComplete.isError && (
        <Alert
          severity="error"
          variant="outlined"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void autoComplete.refetch()}>
              Retry
            </Button>
          }
        >
          {MASTER_DATA_SNACK.error.autoComplete}
        </Alert>
      )}

      {/* The GL Code picker failing stops a mapping being added at all: the
          account number, name and internal ID are filled from it and cannot
          be typed, so the form opens with its three required account fields
          disabled and no way to complete them. Its own message and its own
          retry, because the rows are usually fine — and when the rows are
          fine the screen's retry is not on screen to be used. */}
      {glCodes.isError && (
        <Alert
          severity="error"
          variant="outlined"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void glCodes.refetch()}>
              Retry
            </Button>
          }
        >
          {MASTER_DATA_SNACK.error.glCodes}
        </Alert>
      )}

      {/* flexShrink: 0 stops the flex-column parent squeezing Collapse and
          clipping the buttons. The fade hides Collapse un-clipping the
          filters a row at a time. */}
      <Collapse in={showFilters} timeout={FILTER_SLIDE_MS} easing={FILTER_EASE_IN} sx={{ flexShrink: 0 }}>
        <Box
          sx={{
            opacity: showFilters ? 1 : 0,
            transform: showFilters ? "translateY(0)" : "translateY(-4px)",
            transition: showFilters
              ? fadeTransition(FILTER_FADE_IN_MS, FILTER_EASE_IN, FILTER_FADE_DELAY_MS)
              : fadeTransition(FILTER_FADE_OUT_MS, FILTER_EASE_OUT),
          }}
        >
          <InvoiceAccountMappingFilters
            filter={filter}
            options={options}
            activeCount={activeCount}
            onChange={(next) => {
              setFilter(next);
              firstPage();
            }}
            onClear={() => {
              setFilter({});
              firstPage();
            }}
          />
        </Box>
      </Collapse>
    </MasterDataScreen>
  );
}
