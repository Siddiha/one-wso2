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

import { Link as RouterLink } from "react-router";
import {
  Box,
  Chip,
  IconButton,
  Link,
  ListingTable,
  Skeleton,
  TablePagination,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import {
  PaperclipIcon,
  Trash2Icon,
} from "@wso2/oxygen-ui-icons-react";
import type { Meeting, MeetingScope } from "../api/revOpsTypes";
import { meetingCustomer, meetingTypeLabel } from "../api/revOpsTypes";
import { formatDateTime } from "../util/revOpsTime";

const PAGE_SIZE_OPTIONS = [5, 10, 20];

/** Columns, declared once so the header and the skeleton rows can't drift. */
const COLUMNS = [
  { key: "title", label: "Title", width: "auto" },
  { key: "customer", label: "Account", width: 200 },
  { key: "type", label: "Call type", width: 160 },
  { key: "host", label: "Account Owner", width: 180 },
  { key: "start", label: "Start", width: 150 },
  { key: "end", label: "End", width: 150 },
  { key: "attachments", label: "Files", width: 80, center: true },
] as const;

/**
 * The meeting list.
 *
 * Built on Oxygen's ListingTable rather than hand-rolled Table primitives: it
 * already carries the toolbar, footer pagination and empty state, and its
 * Provider takes `totalCount` separately from the rows, which is exactly the
 * shape server-side paging needs.
 *
 * The Cancel column appears only in the All scope, matching the standalone app.
 * The reasoning holds up: in the Past scope nothing is cancellable — every row
 * has already happened — so the column would be a full width of disabled
 * buttons.
 */
export default function MeetingsTable({
  meetings,
  totalCount,
  loading,
  scope,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onOpenAttachments,
  onCancelMeeting,
  canCancel,
}: {
  meetings: Meeting[];
  totalCount: number;
  loading: boolean;
  scope: MeetingScope;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenAttachments: (meeting: Meeting) => void;
  onCancelMeeting: (meeting: Meeting) => void;
  canCancel: (meeting: Meeting) => boolean;
}) {
  const showCancel = scope === "all";
  const columns = showCancel
    ? [...COLUMNS, { key: "cancel", label: "Cancel", width: 80, center: true } as const]
    : COLUMNS;

  return (
    <ListingTable.Provider
      page={page}
      rowsPerPage={pageSize}
      totalCount={totalCount}
      onPageChange={onPageChange}
      onRowsPerPageChange={onPageSizeChange}
      loading={loading}
    >
      <ListingTable.Container>
        <ListingTable bordered>
          <ListingTable.Head>
            <ListingTable.Row>
              {columns.map((column) => (
                <ListingTable.Cell
                  key={column.key}
                  align={"center" in column && column.center ? "center" : "left"}
                  sx={{ width: column.width, whiteSpace: "nowrap" }}
                >
                  {column.label}
                </ListingTable.Cell>
              ))}
            </ListingTable.Row>
          </ListingTable.Head>

          <ListingTable.Body>
            {loading && meetings.length === 0
              ? // Skeleton rows rather than a spinner: the table keeps its shape,
                // so the page doesn't jump when the rows land.
                Array.from({ length: Math.min(pageSize, 5) }).map((_, rowIndex) => (
                  <ListingTable.Row key={`skeleton-${rowIndex}`}>
                    {columns.map((column) => (
                      <ListingTable.Cell key={column.key}>
                        <Skeleton variant="text" />
                      </ListingTable.Cell>
                    ))}
                  </ListingTable.Row>
                ))
              : meetings.map((meeting) => {
                  const cancellable = canCancel(meeting);
                  const isCancelled = meeting.meetingStatus === "CANCELLED";
                  const customer = meetingCustomer(meeting);
                  const typeLabel = meetingTypeLabel(meeting.meetingType);

                  return (
                    <ListingTable.Row key={meeting.meetingId}>
                      <ListingTable.Cell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          {/* A link, not a row click: the title is the thing that names
                              this meeting, so it is what should look and behave like the
                              way in. A whole-row target would also swallow the file and
                              cancel buttons sitting in it. */}
                          <Link
                            component={RouterLink}
                            to={`/revops/meetings/${meeting.meetingId}`}
                            underline="hover"
                            variant="body2"
                            sx={{
                              // The title carries the customer and meeting type
                              // and is routinely longer than the column; clipping
                              // it keeps every row one line tall, and the tooltip
                              // gives back what the clip took.
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              textDecoration: isCancelled ? "line-through" : "none",
                              color: isCancelled ? "text.disabled" : "text.primary",
                            }}
                            title={meeting.title}
                          >
                            {meeting.title}
                          </Link>
                          {meeting.timeStatus === "UPCOMING" && (
                            <Chip
                              label="Upcoming"
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ height: 20, fontSize: "0.65rem" }}
                            />
                          )}
                        </Box>
                      </ListingTable.Cell>

                      <ListingTable.Cell>
                        {/* Blank rather than a dash when there is no link at all:
                            a meeting scheduled through the old form was never
                            linked to Salesforce, so there is nothing missing to
                            point at. */}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={customer ?? undefined}
                        >
                          {customer ?? ""}
                        </Typography>
                      </ListingTable.Cell>

                      <ListingTable.Cell>
                        {/* Plain text rather than the chip this used to be in the
                            title cell. A chip reads as a status — something
                            notable about this row — but every linked meeting has
                            a call type. */}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={typeLabel ?? undefined}
                        >
                          {typeLabel ?? ""}
                        </Typography>
                      </ListingTable.Cell>

                      <ListingTable.Cell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="body2" color="text.secondary">
                          {meeting.host}
                        </Typography>
                      </ListingTable.Cell>

                      <ListingTable.Cell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(meeting.startTime)}
                        </Typography>
                      </ListingTable.Cell>

                      <ListingTable.Cell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(meeting.endTime)}
                        </Typography>
                      </ListingTable.Cell>


                      <ListingTable.Cell align="center">
                        <Tooltip title="View files" arrow>
                          <IconButton
                            size="small"
                            onClick={() => onOpenAttachments(meeting)}
                            aria-label={`View files for ${meeting.title}`}
                          >
                            <PaperclipIcon size={16} />
                          </IconButton>
                        </Tooltip>
                      </ListingTable.Cell>

                      {showCancel && (
                        <ListingTable.Cell align="center">
                          <Tooltip
                            title={
                              cancellable
                                ? "Cancel meeting"
                                : "Only the host or a RevOps admin can cancel an upcoming meeting"
                            }
                            arrow
                          >
                            {/* The span is required: a disabled button fires no
                                pointer events, so without it the tooltip that
                                explains WHY it is disabled never appears. */}
                            <Box component="span" sx={{ display: "inline-flex" }}>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={!cancellable}
                                onClick={() => onCancelMeeting(meeting)}
                                aria-label={`Cancel ${meeting.title}`}
                              >
                                <Trash2Icon size={16} />
                              </IconButton>
                            </Box>
                          </Tooltip>
                        </ListingTable.Cell>
                      )}
                    </ListingTable.Row>
                  );
                })}
          </ListingTable.Body>
        </ListingTable>

        {!loading && meetings.length === 0 && (
          <ListingTable.EmptyState
            title="No meetings found"
            description="Try a different scope, region, or search term."
          />
        )}

        {/* Pagination is rendered here rather than through ListingTable.Footer.
            `component="div"` because this sits outside <table>, where the
            default `td` element would be invalid markup. */}
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          rowsPerPage={pageSize}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(_, next) => onPageChange(next)}
          onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
          labelRowsPerPage="Per page"
        />
      </ListingTable.Container>
    </ListingTable.Provider>
  );
}
