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

import { useMemo, useState, type JSX } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { ChartColumnIcon, PackageIcon, PencilIcon, PlusIcon, Trash2Icon } from "@wso2/oxygen-ui-icons-react";
import SectionCard from "@features/sales/cado2/components/section-card/SectionCard";
import OrderFormTable from "@features/sales/cado2/quotes/components/sheet/OrderFormTable";
import DealFiguresSection from "@features/sales/cado2/quotes/components/sheet/DealFiguresSection";
import ScheduleTable from "@features/sales/cado2/quotes/components/sheet/ScheduleTable";
import { hasYearlySchedule, orderForm, sheetFromForm } from "@features/sales/cado2/quotes/sheet/sheetModel";
import type { PricingPreview } from "@features/sales/cado2/quotes/api/quoteTypes";
import { hasRecurring, isPartnerLed, type DraftFormValues, type LineValue } from "@features/sales/cado2/quotes/form/draftForm";
import AddLineDialog from "@features/sales/cado2/quotes/components/AddLineDialog";
import SubscriptionTermCard from "@features/sales/cado2/quotes/components/SubscriptionTermCard";
import PartnerCommissionCard from "@features/sales/cado2/quotes/components/PartnerCommissionCard";
import PricingSetupCard from "@features/sales/cado2/quotes/components/PricingSetupCard";
import { useFieldIssue } from "@features/sales/cado2/quotes/components/fieldIssues";

interface ProductsStepProps {
  /** The latest live preview, if the quote could be priced. */
  readonly preview: PricingPreview | null;
}

function LineIssue({ index }: { index: number }) {
  const issues = [
    useFieldIssue(`lines[${index}].pricebookEntryId`),
    useFieldIssue(`lines[${index}].quantity`),
    useFieldIssue(`lines[${index}].discretionaryDiscountPercent`),
    useFieldIssue(`lines[${index}]`),
  ].filter(Boolean);
  if (issues.length === 0) return null;
  return (
    <TableRow>
      <TableCell colSpan={7} sx={{ pt: 0, borderTop: 0 }}>
        <Typography variant="caption" color="error">
          {issues.join(" · ")}
        </Typography>
      </TableCell>
    </TableRow>
  );
}

/** Step ② Products & Pricing. */
export default function ProductsStep({ preview }: ProductsStepProps): JSX.Element {
  const { control, getValues } = useFormContext<DraftFormValues>();
  const { fields, append, update, remove } = useFieldArray({
    control,
    name: "lines",
  });
  const values = useWatch({ control }) as DraftFormValues;
  const [editing, setEditing] = useState<{
    open: boolean;
    index: number | null;
  }>({ open: false, index: null });
  const linesIssue = useFieldIssue("lines");

  const currency = values.currencyIsoCode;
  // The opportunity's book must be usable; the card says what to fix otherwise.
  const ready = Boolean(currency && values.defaultPricebookId && values.startDate);
  const recurring = hasRecurring(values.lines);
  // The same lines, amounts and figures as the Review step's sheet.
  const sheet = useMemo(() => sheetFromForm(values, preview, null), [values, preview]);

  const onSave = (line: LineValue) => {
    if (editing.index === null) append(line);
    else update(editing.index, line);
    setEditing({ open: false, index: null });
  };

  const addButton = (
    <Button
      variant="contained"
      startIcon={<PlusIcon size={16} />}
      disabled={!ready}
      onClick={() => setEditing({ open: true, index: null })}
    >
      Add line
    </Button>
  );

  return (
    <Stack spacing={2.5}>
      {!values.startDate ? (
        <Alert severity="info">Choose the start date in Step 1 before adding products.</Alert>
      ) : null}
      {linesIssue ? <Alert severity="error">{linesIssue}</Alert> : null}

      {/* The opportunity's currency and price book, locked. */}
      <PricingSetupCard />

      {/* The term only matters once something recurs. */}
      {recurring ? (
        <SubscriptionTermCard />
      ) : fields.length > 0 ? (
        <Alert severity="info">
          Services only: this quote has no subscription term. Only the contract total (TCV) applies.
        </Alert>
      ) : null}

      <SectionCard title="Products" icon={<PackageIcon size={18} />} aside={fields.length > 0 ? addButton : undefined}>
        {fields.length === 0 ? (
          <Box sx={{ py: 3, textAlign: "center" }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              No products yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {/* One price book: the opportunity's (D57), named. */}
              Add products from {values.defaultPricebookName ? `the ${values.defaultPricebookName} price book` : "the quote's price book"}.
              Prices come from this price book.
            </Typography>
            {addButton}
          </Box>
        ) : (
          <OrderFormTable
            lines={sheet.lines}
            currency={currency}
            commissionPercent={sheet.partnerCommissionPercent}
            actions={(i) => (
              <>
                <Tooltip title="Edit">
                  <IconButton size="small" aria-label={`Edit line ${i + 1}`} onClick={() => setEditing({ open: true, index: i })}>
                    <PencilIcon size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove">
                  <IconButton size="small" aria-label={`Remove line ${i + 1}`} onClick={() => remove(i)}>
                    <Trash2Icon size={16} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            below={(i) => <LineIssue key={fields[i]?.id} index={i} />}
          />
        )}
      </SectionCard>

      {/* Partner-led: the partner's commission. */}
      {isPartnerLed(values) && fields.length > 0 ? (
        <PartnerCommissionCard
          commission={orderForm(sheet.lines, sheet.partnerCommissionPercent).commission}
          total={orderForm(sheet.lines).total}
          currency={currency}
        />
      ) : null}

      {fields.length > 0 ? <DealFiguresSection sheet={sheet} /> : null}

      {hasYearlySchedule(sheet) ? (
        <SectionCard title="Yearly schedule" icon={<ChartColumnIcon size={18} />}>
          <ScheduleTable years={sheet.years} lines={sheet.lines} netOfCommission={sheet.partnerCommissionPercent !== null} />
        </SectionCard>
      ) : null}

      {editing.open && values.defaultPricebookId ? (
        <AddLineDialog
          key={editing.index ?? "new"}
          open
          line={editing.index === null ? null : getValues(`lines.${editing.index}`)}
          currency={currency}
          pricebook={{ id: values.defaultPricebookId, name: values.defaultPricebookName }}
          onSave={onSave}
          onClose={() => setEditing({ open: false, index: null })}
        />
      ) : null}
    </Stack>
  );
}

