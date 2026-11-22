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

import { useMemo } from "react";
import { Box, Chip, DataGrid, IconButton, Stack, TextField, Tooltip, Typography } from "@wso2/oxygen-ui";
import {
  DownloadIcon,
  InfoIcon,
  ListFilterIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
} from "@wso2/oxygen-ui-icons-react";
import { FINANCE_GRID_SX } from "../util/financeGridSx";
import { INITIAL_SORT_FIELD } from "./masterDataForm";
import {
  MASTER_DATA_STATUS,
  type Department,
  type ExpenseType,
  type InvoiceAccountMapping,
  type MasterDataRow,
  type MasterDataTab,
} from "./masterDataTypes";

/**
 * The one table all four master-data screens are drawn with.
 *
 * The per-tab column list is a plain declaration below, and the cell
 * behaviour shared across tabs is three named renderers, because "which
 * columns does Subsidiaries have" is the question a reader actually
 * arrives with.
 */

/** Empty cells read as a dash, not as blank. */
const EMPTY = "-";

const CHIP_SX = { fontSize: 11, fontWeight: 600 } as const;

// A small MUI Chip and the wrap gap between two rows of them, in px. Used to
// turn a line count into the pixel height that caps a cell.
const CHIP_ROW_PX = 24;
const CHIP_GAP_PX = 4;
const CHIP_PAD_PX = 12;

/**
 * Lists render as chips; `valueFormatter` keeps CSV export readable.
 *
 * `max` caps how many are drawn, and the rest become a `+n` chip with the
 * whole list in a tooltip. A mapping can carry a dozen engagement codes, and
 * uncapped that one row is as tall as the screen — which makes the table
 * unreadable precisely when there is the most in it to find. Uncapped by
 * default, so only the columns that need it pay for it.
 *
 * `lines` caps the height as well, because `max` alone cannot: it counts
 * chips, and how many of them fit on a line depends on the column width and
 * on how long the codes are. At a narrow width a code like MKT-BU_CORP-GEN
 * takes a line to itself, so four chips meant four lines. With `lines` set
 * the cell stops at that many rows whatever the width, and the tooltip
 * carries the whole list — so a value hidden by the cap OR by the clip is
 * still readable, which is why the tooltip goes on as soon as there is more
 * than one value rather than only when `max` dropped some.
 */
function ChipList({ values, max, lines }: { values: string[]; max?: number; lines?: number }) {
  if (!values || values.length === 0) return <>{EMPTY}</>;

  const shown = max === undefined ? values : values.slice(0, max);
  const hiddenCount = values.length - shown.length;
  const chips = (
    <Stack
      direction="row"
      gap={0.5}
      flexWrap="wrap"
      sx={{
        py: 0.75,
        ...(lines === undefined
          ? {}
          : {
              maxHeight: lines * CHIP_ROW_PX + (lines - 1) * CHIP_GAP_PX + CHIP_PAD_PX,
              overflow: "hidden",
            }),
      }}
    >
      {shown.map((v) => (
        <Chip key={v} label={v} title={v} size="small" sx={CHIP_SX} />
      ))}
      {hiddenCount > 0 && (
        <Chip label={`+${hiddenCount}`} size="small" variant="outlined" sx={CHIP_SX} />
      )}
    </Stack>
  );

  // No tooltip when there is one value and nothing can be hidden — one that
  // repeats the cell is just something that flickers when the pointer
  // crosses the row.
  const mayHide = hiddenCount > 0 || (lines !== undefined && values.length > 1);
  if (!mayHide) return chips;
  return (
    <Tooltip
      arrow
      placement="top"
      title={<Box sx={{ p: 0.5, fontSize: 12.5 }}>{values.join(", ")}</Box>}
    >
      {chips}
    </Tooltip>
  );
}

/** Which page of rows the grid is showing, and how many there are in all. */
export interface MasterDataPagination {
  /** Rows the filter matches across every page, for the grid's row count. */
  rowCount: number;
  model: { page: number; pageSize: number };
  onModelChange: (model: { page: number; pageSize: number }) => void;
}

/**
 * Active / inactive.
 *
 * The source hardcodes four hex values for the two states. Here it is the
 * theme's success and error colours through `Chip`'s own `color` prop, which
 * is the same green-means-active reading and survives a theme change.
 */
function StatusChip({ value }: { value: string }) {
  const label = (value ?? "").toLowerCase();
  return (
    <Chip
      label={label}
      title={label}
      size="small"
      variant="outlined"
      color={label === MASTER_DATA_STATUS.active ? "success" : "error"}
      sx={{ fontWeight: 600, textTransform: "capitalize" }}
    />
  );
}

/**
 * A value with an info icon carrying the fields that did not get a column.
 *
 * `TooltipCell.tsx` — a GL code is only meaningful alongside its internal id,
 * account name and cost centre, but four columns for one concept would crowd
 * out the rest of the table. The icon is omitted entirely when there is
 * nothing to show, rather than offering an empty tooltip.
 */
function InfoCell({ text, details }: { text: string; details: [string, string][] }) {
  const shown = details.filter(([, v]) => v && v !== EMPTY);
  return (
    <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12.5, wordBreak: "break-word" }}>{text || EMPTY}</Typography>
      {shown.length > 0 && (
        <Tooltip
          arrow
          placement="left"
          title={
            <Box sx={{ p: 0.5 }}>
              {details.map(([k, v]) => (
                <Typography key={k} sx={{ fontSize: 12.5, py: 0.25 }}>
                  {k}: <strong>{v || "N/A"}</strong>
                </Typography>
              ))}
            </Box>
          }
        >
          {/* `flexShrink: 0` so the icon is not squeezed away by a long value. */}
          <InfoIcon size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
        </Tooltip>
      )}
    </Stack>
  );
}

/** Plain text cell — dash when empty. */
const text = (): Partial<DataGrid.GridColDef> => ({
  renderCell: (p) => (p.value === null || p.value === undefined || p.value === "" || p.value === 0
    ? EMPTY
    : String(p.value)),
});

const chips = (max?: number, lines?: number): Partial<DataGrid.GridColDef> => ({
  renderCell: (p) => <ChipList values={(p.value as string[]) ?? []} max={max} lines={lines} />,
  // Export writes "a, b", not "[object Object]" — and writes every value,
  // not the `max` the cell shows.
  valueFormatter: (value) => ((value as string[])?.length ? (value as string[]).join(", ") : EMPTY),
});

/**
 * Chips shown per mapping code cell before the rest move into the tooltip.
 *
 * An upper bound on the count; `MAX_MAPPING_CHIP_LINES` is what actually
 * holds the row height, since four short codes fit two rows but four long
 * ones at a narrow column did not.
 */
const MAX_MAPPING_CHIPS = 4;

/** Rows of chips a mapping code cell may grow to. */
const MAX_MAPPING_CHIP_LINES = 2;

/** Per-tab columns, headers and widths, in the order they're read left to right. */
const MASTER_DATA_COLUMNS: Record<MasterDataTab, DataGrid.GridColDef[]> = {
  subsidiaries: [
    { field: "legalName", headerName: "Subsidiary Legal Name", flex: 4, minWidth: 220, ...text() },
    { field: "code", headerName: "Subsidiary Code", flex: 3, minWidth: 170, ...text() },
    { field: "taxCodeInternalId", headerName: "Tax ID", flex: 1, minWidth: 90, ...text() },
    { field: "taxCode", headerName: "Tax Code", flex: 2, minWidth: 120, ...text() },
    { field: "country", headerName: "Country", flex: 2, minWidth: 140, ...text() },
    { field: "currencyCode", headerName: "Currency", flex: 1, minWidth: 100, ...text() },
  ],
  departments: [
    { field: "employeeDepartment", headerName: "Employee Department", flex: 4, minWidth: 220, ...text() },
    { field: "engagementCode", headerName: "Engagement Code", flex: 2, minWidth: 150, ...text() },
    {
      field: "glCode",
      headerName: "GL Code",
      flex: 2,
      minWidth: 140,
      renderCell: (p) => {
        const r = p.row as Department;
        return (
          <InfoCell
            text={r.glCode}
            details={[
              ["Internal ID", String(r.glCodeInternalId ?? "")],
              ["Account Name", r.glAccountName ?? ""],
              ["Cost Center", r.costCenter ?? ""],
            ]}
          />
        );
      },
    },
  ],
  expenseTypes: [
    { field: "expenseCategory", headerName: "Expense Category", flex: 2, minWidth: 160, ...text() },
    {
      field: "glCode",
      headerName: "Gl Code",
      flex: 1.5,
      minWidth: 130,
      renderCell: (p) => {
        const r = p.row as ExpenseType;
        return (
          <InfoCell
            text={r.glCode}
            details={[
              ["Internal ID", String(r.glCodeInternalId ?? "")],
              ["Account Name", r.glAccountName ?? ""],
              ["Cost Center", r.costCenter ?? ""],
            ]}
          />
        );
      },
    },
    {
      field: "expenseType",
      headerName: "Expense Type",
      flex: 2.5,
      minWidth: 180,
      renderCell: (p) => {
        const r = p.row as ExpenseType;
        return (
          <InfoCell
            text={r.expenseType}
            details={[["Expense Type Description", r.expenseTypeDescription ?? ""]]}
          />
        );
      },
    },
    { field: "engagementCodes", headerName: "Engagement Code", flex: 2, minWidth: 160, ...chips() },
    {
      field: "engagementCodeSuffixes",
      headerName: "Engagement Code Suffix",
      flex: 2,
      minWidth: 170,
      ...chips(),
    },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      minWidth: 110,
      renderCell: (p) => <StatusChip value={p.value as string} />,
    },
  ],
  invoiceAccountMappings: [
    // Keyed on the code rather than on the account name, the way the
    // expense-type tab is: a code identifies one account and a name does not
    // — several accounts read as "Travel" — so scanning down the names tells
    // you less per row than scanning down the codes.
    {
      field: "accountNumber",
      headerName: "GL Code",
      flex: 2,
      minWidth: 150,
      renderCell: (p) => {
        const r = p.row as InvoiceAccountMapping;
        return (
          <InfoCell
            text={r.accountNumber}
            details={[
              ["Account Name", r.accountClassification ?? ""],
              ["Internal ID", r.internalId ?? ""],
            ]}
          />
        );
      },
    },
    { field: "costType", headerName: "Cost Type", flex: 2, minWidth: 160, ...text() },
    {
      field: "engagementCodes",
      headerName: "Engagement Code",
      flex: 2.5,
      minWidth: 180,
      ...chips(MAX_MAPPING_CHIPS, MAX_MAPPING_CHIP_LINES),
    },
    {
      field: "engagementCodeSuffixes",
      headerName: "Engagement Code Suffix",
      flex: 2.5,
      minWidth: 180,
      ...chips(MAX_MAPPING_CHIPS, MAX_MAPPING_CHIP_LINES),
    },
    { field: "department", headerName: "Department", flex: 1.5, minWidth: 130, ...text() },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      minWidth: 110,
      renderCell: (p) => <StatusChip value={p.value as string} />,
    },
  ],
  creditCards: [
    { field: "ccNumber", headerName: "CC Number", flex: 1.5, minWidth: 130, ...text() },
    { field: "ccProviderCode", headerName: "CC Provider Code", flex: 1.5, minWidth: 150, ...text() },
    { field: "employeeEmail", headerName: "Employee Email", flex: 2.2, minWidth: 210, ...text() },
    { field: "leadEmails", headerName: "Lead Email", flex: 2.2, minWidth: 210, ...chips() },
    { field: "comment", headerName: "Comment", flex: 2, minWidth: 160, ...text() },
    {
      field: "status",
      headerName: "Status",
      flex: 1.2,
      minWidth: 110,
      renderCell: (p) => <StatusChip value={p.value as string} />,
    },
  ],
};

/**
 * Columns, Column Search, Export and an always-visible search box.
 *
 * "Column Search" rather than "Filters": on a reference table you filter a
 * column to find a record, and that label says so directly. The columns
 * button stays visible, unlike density and the column selector — these
 * tables are wide, and hiding a column you do not need is worth the extra
 * button.
 */
function MasterDataToolbar({
  showSearch = true,
  showColumnSearch = true,
}: {
  showSearch?: boolean;
  showColumnSearch?: boolean;
}) {
  return (
    <DataGrid.Toolbar>
      {/* `Toolbar` is a bare container and takes no `sx`, so the row's
          spacing and the muted button colour live on a Box inside it. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1.5,
          width: "100%",
          "& .MuiButtonBase-root": { color: "text.secondary" },
        }}
      >
        {showColumnSearch && (
          <DataGrid.FilterPanelTrigger render={<DataGrid.ToolbarButton />}>
            <ListFilterIcon size={16} style={{ marginRight: 6 }} />
            Column Search
          </DataGrid.FilterPanelTrigger>
        )}
        <DataGrid.ExportCsv render={<DataGrid.ToolbarButton />}>
          <DownloadIcon size={16} style={{ marginRight: 6 }} />
          Export
        </DataGrid.ExportCsv>
        <Box sx={{ flex: 1 }} />
        {/* `expanded`, so the field is on screen rather than behind a
            magnifier the reader has to click first. Hidden on the tabs that
            put their own search above the table, so there is never a second
            box that searches the same rows a different way. */}
        <DataGrid.QuickFilter expanded hidden={!showSearch}>
          <DataGrid.QuickFilterControl
            render={(props) => (
              <TextField
                {...props}
                variant="standard"
                size="small"
                placeholder="Search..."
                sx={{ minWidth: 220 }}
                InputProps={{
                  startAdornment: <SearchIcon size={16} style={{ marginRight: 6, opacity: 0.6 }} />,
                }}
              />
            )}
          />
        </DataGrid.QuickFilter>
      </Box>
    </DataGrid.Toolbar>
  );
}

/**
 * One tab's table, with an Actions column of Edit and — on Subsidiaries and
 * Departments — Delete.
 *
 * Credit Cards, Expense Types and Invoice Account Mappings have no Delete:
 * each carries a status column and retires a record through its form's
 * Active/Inactive toggle instead.
 *
 * Rows auto-size their height (`getRowHeight: () => "auto"`) because an
 * expense type can carry a dozen engagement-code chips and a fixed row
 * would clip all but the first line.
 */
export default function MasterDataGrid({
  tab,
  rows,
  loading,
  showSearch = true,
  pagination,
  onEdit,
  onDelete,
}: {
  tab: MasterDataTab;
  rows: MasterDataRow[];
  loading: boolean;
  /** False where the page puts its own search box above the table. */
  showSearch?: boolean;
  /**
   * Server-side paging. Absent — which is every tab but the mappings — means
   * `rows` is the whole table and the grid pages it itself.
   */
  pagination?: MasterDataPagination;
  onEdit: (row: MasterDataRow) => void;
  onDelete: (row: MasterDataRow) => void;
}) {
  // These tabs retire a record through their form's Active/Inactive toggle
  // instead — see `StatusToggle` in MasterDataFormDialog.
  const showsDelete =
    tab !== "creditCards" && tab !== "expenseTypes" && tab !== "invoiceAccountMappings";

  // Closed over rather than passed through `slotProps`, which would need the
  // grid's ToolbarPropsOverrides augmenting to carry a prop of our own.
  // Memoised so the toolbar is not a new component type on every render.
  // Column Search narrows the rows the grid holds, which on a server-paged
  // tab is one page, so it is left off there.
  const showColumnSearch = pagination === undefined;
  const toolbar = useMemo(
    () => function Toolbar() {
      return <MasterDataToolbar showSearch={showSearch} showColumnSearch={showColumnSearch} />;
    },
    [showSearch, showColumnSearch],
  );

  const columns: DataGrid.GridColDef[] = [
    ...MASTER_DATA_COLUMNS[tab],
    {
      field: "actions",
      headerName: "Actions",
      headerAlign: "right",
      align: "right",
      flex: 1.2,
      minWidth: showsDelete ? 110 : 80,
      sortable: false,
      filterable: false,
      disableExport: true,
      disableColumnMenu: true,
      renderCell: (p) => (
        <Stack direction="row" justifyContent="flex-end" gap={0.5}>
          <Tooltip title="Edit">
            <IconButton size="small" aria-label="Edit" onClick={() => onEdit(p.row as MasterDataRow)}>
              <PencilIcon size={16} />
            </IconButton>
          </Tooltip>
          {showsDelete && (
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                aria-label="Delete"
                onClick={() => onDelete(p.row as MasterDataRow)}
              >
                <TrashIcon size={16} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ flex: 1, minHeight: 420, width: "100%" }}>
      <DataGrid.DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        getRowId={(r) => (r as MasterDataRow).id}
        getRowHeight={() => "auto"}
        disableRowSelectionOnClick
        disableColumnMenu
        slots={{ toolbar }}
        localeText={{ toolbarFilters: "Column Search" }}
        // A server-paged tab takes its order and its page from the request,
        // so the grid is seeded with neither.
        initialState={pagination
          ? {}
          : {
              sorting: { sortModel: [{ field: INITIAL_SORT_FIELD[tab], sort: "asc" }] },
              pagination: { paginationModel: { pageSize: 100, page: 0 } },
            }}
        pageSizeOptions={[25, 50, 100]}
        {...(pagination
          ? {
              paginationMode: "server" as const,
              rowCount: pagination.rowCount,
              paginationModel: pagination.model,
              onPaginationModelChange: pagination.onModelChange,
              // The request carries no sort or filter model, so these would
              // reorder or narrow the page on screen while reading as though
              // they covered every match.
              disableColumnSorting: true,
              disableColumnFilter: true,
            }
          : {})}
        sx={{
          ...FINANCE_GRID_SX,
          // Wrap a long header rather than clipping it — two of these tables
          // have headers longer than their column ("Engagement Code Suffix").
          "& .MuiDataGrid-columnHeaderTitle": { whiteSpace: "normal", lineHeight: 1.3 },
          // Auto row height needs its own vertical padding; without it the
          // chips sit flush against the row divider.
          "& .MuiDataGrid-cell": { py: 1, alignItems: "center" },
        }}
      />
    </Box>
  );
}
