/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { CreditCardIcon, PencilIcon } from "@wso2/oxygen-ui-icons-react";
import { CcBankIcon } from "./CcBankIcon";
import { ccCardName, type CcCreditCard } from "../ccTypes";

/**
 * The credit-card picker — a dropdown with a rename button beside it, as the
 * source has it (`CardMenu.tsx`).
 *
 * This was a row of tiles before. The dropdown is what the source uses and what
 * the screens were designed around: the tiles took the full width of the header
 * for something that is picked once and then left alone, and with more than
 * three cards they scrolled sideways.
 *
 * The change also removes a hazard the tiles had. The rename button sat INSIDE
 * each tile, which was itself a `role="button"` selecting on Enter/Space, so
 * reaching rename by keyboard both opened the dialog and switched card
 * underneath it — held off only by stopping propagation in two handlers. Here
 * the rename button is a sibling of the select and cannot select anything.
 */
export function CardMenu({
  cards,
  active,
  onSelect,
  badge,
  onRename,
}: {
  cards: CcCreditCard[];
  active: string | null;
  onSelect: (ccNumber: string) => void;
  badge?: "countNew" | "countPendingLead" | "countPendingFinance";
  /**
   * Lets the selected card be renamed. The label is the only thing telling two
   * cards with similar numbers apart, so the source keeps this next to the
   * picker rather than in a settings screen.
   */
  onRename?: (card: CcCreditCard, label: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");

  const activeIndex = cards.findIndex((c) => c.ccNumber === active);
  const activeCard = activeIndex >= 0 ? cards[activeIndex] : null;

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <FormControl size="small" sx={{ width: 270 }}>
          <Select
            value={activeCard ? activeCard.ccNumber : ""}
            onChange={(e) => onSelect(String(e.target.value))}
            displayEmpty
            variant="standard"
            inputProps={{ "aria-label": "Credit card" }}
            renderValue={() =>
              activeCard ? (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CreditCardIcon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700 }}>
                    {ccCardName(activeCard.label, activeIndex)}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 13.5, color: "text.secondary" }}>
                    ({activeCard.ccNumber})
                  </Typography>
                </Stack>
              ) : (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CreditCardIcon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <Typography component="span" sx={{ fontSize: 13.5, color: "text.secondary" }}>
                    Select Credit Card
                  </Typography>
                </Stack>
              )
            }
          >
            {cards.map((card, index) => {
              const count = badge ? card[badge] : 0;
              return (
                <MenuItem key={card.id} value={card.ccNumber}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      gap: 2,
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CcBankIcon bankCode={card.bankCode} />
                      <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700 }}>
                        {ccCardName(card.label, index)}
                      </Typography>
                      {count > 0 && (
                        <Badge
                          badgeContent={count}
                          color="primary"
                          sx={{ ml: 1, "& .MuiBadge-badge": { fontSize: 10, height: 17, minWidth: 17 } }}
                        />
                      )}
                      {card.status !== "Active" && (
                        <Typography component="span" sx={{ fontSize: 11, color: "text.disabled" }}>
                          Inactive
                        </Typography>
                      )}
                    </Stack>
                    <Typography component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                      {card.ccNumber}
                    </Typography>
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        {onRename && activeCard && (
          <IconButton
            size="small"
            aria-label="Rename card"
            onClick={() => {
              setDraftLabel(activeCard.label ?? "");
              setRenaming(true);
            }}
            sx={{ color: "text.secondary" }}
          >
            <PencilIcon size={15} />
          </IconButton>
        )}
      </Stack>

      <Dialog open={renaming} onClose={() => setRenaming(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>Rename card</DialogTitle>
        <DialogContent dividers>
          <TextField
            size="small"
            fullWidth
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="e.g. Travel card"
            inputProps={{ "aria-label": "Card label" }}
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              if (activeCard) onRename?.(activeCard, draftLabel.trim());
              setRenaming(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
