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
  Collapse,
  FormControlLabel,
  Switch,
  ToggleButton,
} from "@wso2/oxygen-ui";
import { FilterIcon } from "@wso2/oxygen-ui-icons-react";
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
  applyInvoiceMappingFilters,
  countActiveInvoiceMappingFilters,
  getInvoiceMappingFilterOptions,
  type InvoiceMappingFilter,
} from "../invoiceMappingFilters";

// The filter panel's height slide, and the fade that covers it. Same values as
// the expense-type bar, so the two tabs open the same way.
const FILTER_EASE_IN = "cubic-bezier(0.4, 0, 0.2, 1)";
const FILTER_EASE_OUT = "cubic-bezier(0.4, 0, 1, 1)";
const FILTER_SLIDE_MS = 260;
const FILTER_FADE_IN_MS = 220;
const FILTER_FADE_OUT_MS = 120;
// Lets the height open before the contents arrive.
const FILTER_FADE_DELAY_MS = 40;

const FADE_PROPS = ["opacity", "transform"];
const fadeTransition = (ms: number, ease: string, delay = 0) =>
  FADE_PROPS.map((prop) => `${prop} ${ms}ms ${ease} ${delay}ms`).join(", ");

/**
 * Rows asked for in one go.
 *
 * The search endpoint pages, and this is the largest page it will serve. The
 * table holds a few hundred rows, so one page is the whole table today — but
 * it is a page, and `totalCount` is what says whether it still is. When it
 * stops being one, the filters move to the request instead of being applied
 * here, which is what the endpoint already takes them for.
 */
const MAPPING_PAGE_SIZE = 500;

/**
 * The invoice account classification mappings.
 *
 * These decide which NetSuite account and department a travel invoice or per
 * diem bill is posted to. Until this screen existed they were maintained by
 * emailing Finance's spreadsheet to the Digital team, who inserted the rows
 * by hand — so a missing mapping surfaced as a failed NetSuite sync and took
 * a person in another team to fix.
 *
 * Travel Invoice mappings and Per diem mappings are one table, not two: the
 * cost type is what separates them, and "Currency (per diem / allowances)" is
 * the per diem one. So this is a single screen with a Cost Type column rather
 * than the two screens Finance's two spreadsheet tabs might suggest.
 *
 * Only the active mappings are shown unless Show Inactive is switched on,
 * which is what a reader wants nearly every time — an inactive mapping is a
 * retired one, looked up when something old has to be brought back.
 */
export default function InvoiceAccountMappingsPage() {
  const query = useInvoiceAccountMappings({ limit: MAPPING_PAGE_SIZE });
  const costTypes = useInvoiceCostTypes();
  const autoComplete = useInvoiceAccountMappingAutoComplete();
  // The mapping form's GL Code picker, which fills in the account number,
  // name and internal ID together.
  const glCodes = useGlCodes();

  const [showFilters, setShowFilters] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [filter, setFilter] = useState<InvoiceMappingFilter>({});

  const rows = useMemo(() => query.data?.mappings ?? [], [query.data]);
  const totalCount = query.data?.totalCount ?? 0;
  const options = useMemo(
    () => getInvoiceMappingFilterOptions(rows, autoComplete.data),
    [rows, autoComplete.data],
  );
  const visibleRows = useMemo(
    () => applyInvoiceMappingFilters(rows, filter, showInactive),
    [rows, filter, showInactive],
  );
  const activeCount = countActiveInvoiceMappingFilters(filter);

  return (
    <MasterDataScreen
      tab="invoiceAccountMappings"
      rows={visibleRows}
      loading={query.isLoading}
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
      toolbar={
        <>
          <FormControlLabel
            sx={{ mr: 0 }}
            control={
              <Switch
                size="small"
                checked={showInactive}
                onChange={(_e, checked) => setShowInactive(checked)}
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
            sx={{ textTransform: "none", gap: 0.75, px: 1.5, minWidth: 140 }}
          >
            <FilterIcon size={16} />
            {showFilters ? "Hide Filters" : "Show Filters"}
            {activeCount > 0 && ` (${activeCount})`}
          </ToggleButton>
        </>
      }
    >
      {/* The rows arrive a page at a time. One page has been the whole table
          so far, so this says nothing — but it is the only thing that would,
          and a table quietly missing its tail is worse than a line of text. */}
      {totalCount > rows.length && (
        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
          Showing the first {rows.length} of {totalCount} mappings. Use the search box or the
          filters to narrow down to the one you are looking for.
        </Alert>
      )}

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
            onChange={setFilter}
            onClear={() => setFilter({})}
          />
        </Box>
      </Collapse>
    </MasterDataScreen>
  );
}
