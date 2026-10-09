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

import { createContext, useContext, useEffect, useRef, useState, type JSX, type ReactNode, type UIEvent } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  type PaperProps,
} from "@wso2/oxygen-ui";
import { PackageIcon, PercentIcon } from "@wso2/oxygen-ui-icons-react";
import { formatMoney } from "@features/sales/cado2/utils/money";
import { useDebouncedValue } from "@hooks/useDebouncedValue";
import { descriptionAfterName } from "@features/sales/cado2/utils/productDescription";
import { lineProblems } from "@features/sales/cado2/quotes/components/lineProblems";
import { useProducts } from "@features/sales/cado2/quotes/api/useQuoteApi";
import type { CategorySource, LineCategory, PricebookRef, Product } from "@features/sales/cado2/quotes/api/quoteTypes";
import type { LineValue } from "@features/sales/cado2/quotes/form/draftForm";

/** A small heading for a group of fields in the dialog. */
function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): JSX.Element {
  return (
    <Box component="section" aria-label={title}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary", mb: 1.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 24,
            height: 24,
            borderRadius: 1,
            display: "grid",
            placeItems: "center",
            color: "primary.main",
            bgcolor: "action.selected",
          }}
        >
          {icon}
        </Box>
        <Typography variant="overline" sx={{ lineHeight: 1.2, fontWeight: 600 }}>
          {title}
        </Typography>
      </Stack>
      <Stack spacing={2}>{children}</Stack>
    </Box>
  );
}

/** The chosen product and its price-book price, shown prominently (the price can't be edited). */
function ProductCard(props: {
  name: string;
  /** The Salesforce description; shown without the name if it repeats it. */
  description: string | null;
  code: string;
  pricebook: string;
  unitPrice: string;
  currency: string;
  note?: string;
}): JSX.Element {
  return (
    <Paper
      variant="outlined"
      aria-label="Chosen product"
      sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: "primary.main" }}
    >
      <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {props.name}
          </Typography>
          {descriptionAfterName(props.name, props.description) ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {descriptionAfterName(props.name, props.description)}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
            {props.code ? (
              <Chip size="small" variant="outlined" label={props.code} sx={{ fontFamily: "monospace" }} />
            ) : null}
            {props.pricebook ? <Chip size="small" variant="outlined" label={props.pricebook} /> : null}
          </Stack>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography
            variant="h6"
            component="p"
            sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}
          >
            {props.currency} {props.unitPrice ? formatMoney(props.unitPrice) : "—"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            per unit, from the price book
          </Typography>
        </Box>
      </Stack>
      {props.note ? (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          {props.note}
        </Typography>
      ) : null}
    </Paper>
  );
}

interface AddLineDialogProps {
  readonly open: boolean;
  /** The line being edited, or null to add one. */
  readonly line: LineValue | null;
  readonly currency: string;
  /** The quote's price book, which is the opportunity's: every product and price comes from it. */
  readonly pricebook: PricebookRef;
  readonly onSave: (line: LineValue) => void;
  readonly onClose: () => void;
}

const CATEGORIES: readonly { value: LineCategory; label: string }[] = [
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "SUPPORT", label: "Support" },
  { value: "PROFESSIONAL_SERVICE", label: "Professional Service (one-time)" },
];

const categoryLabel = (c: LineCategory) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** The product as the list shows it; the code is shown because names repeat. */
const getName = (p: Product) => `${p.name ?? p.id}${p.productCode ? ` (${p.productCode})` : ""}`;

/** What the product list's popup shows below the options. */
interface ProductListState {
  /** "Loading more…", "Showing 50 · scroll for more", "All 182 products shown". */
  status: string;
}
const ProductListContext = createContext<ProductListState | null>(null);

/**
 * The product list's popup, with a status line below the options so a list
 * still loading isn't taken for all there is. A click on it doesn't take
 * the focus from the search box, which would close the popup.
 */
function ProductListPaper({ children, ...props }: PaperProps): JSX.Element {
  const list = useContext(ProductListContext);
  return (
    <Paper {...props}>
      {children}
      {list?.status ? (
        <Typography
          component="div"
          variant="caption"
          color="text.secondary"
          onMouseDown={(e) => e.preventDefault()}
          sx={{ px: 2, py: 0.75, borderTop: 1, borderColor: "divider" }}
        >
          {list.status}
        </Typography>
      ) : null}
    </Paper>
  );
}

/**
 * Add or edit a line. Products and prices come
 * from the price book in the quote's currency; the unit price can't be
 * edited. The product code is shown because names repeat.
 */
export default function AddLineDialog({
  open,
  line,
  currency,
  pricebook,
  onSave,
  onClose,
}: AddLineDialogProps): JSX.Element {
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 300);
  // The quote's price book only, a page at a time as the rep scrolls.
  const products = useProducts(open ? currency : "", debounced, pricebook.id);
  const options = products.data ?? [];
  // MUI scrolls the list back to the top when options are added and none is
  // highlighted, so the position is kept here and put back after a page loads.
  const listbox = useRef<HTMLElement | null>(null);
  const scrolled = useRef(0);
  useEffect(() => {
    if (listbox.current && listbox.current.scrollTop < scrolled.current) listbox.current.scrollTop = scrolled.current;
  }, [options.length]);
  const onListScroll = (el: HTMLElement) => {
    scrolled.current = el.scrollTop;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && products.hasNextPage && !products.isFetchingNextPage) {
      void products.fetchNextPage();
    }
  };
  const listState: ProductListState = {
    status: products.isFetchingNextPage
      ? "Loading more…"
      : options.length === 0 || products.isPending
        ? ""
        : products.hasNextPage
          ? `Showing ${options.length} · scroll for more`
          : `All ${options.length} ${options.length === 1 ? "product" : "products"} shown`,
  };

  const [product, setProduct] = useState<Product | null>(null);
  // The parent mounts the dialog afresh for each add/edit, so the line (or
  // blanks) only needs loading once.
  // The rep's choice, used only for a product without a mapping.
  const [category, setCategory] = useState<LineCategory | "">(line?.category ?? "");
  const [uom, setUom] = useState(line?.unitOfMeasure ?? "");
  const [quantity, setQuantity] = useState(line?.quantity ?? "1");
  const [discount, setDiscount] = useState(line?.discount ?? "0");
  const [tried, setTried] = useState(false);

  // A product carries one price: the quote's book's.
  const entry = product?.pricebookEntries[0];
  // Editing without re-choosing the product keeps the saved snapshot.
  const keepsExisting = line !== null && product === null;
  // A mapped product's category is the Admin's and can't be changed.
  const mapped: LineCategory | null = product
    ? (product.category ?? null)
    : keepsExisting && line.categorySource === "MAPPED"
      ? line.category
      : null;
  const source: CategorySource = mapped ? "MAPPED" : "REP";
  const chosen = product !== null || keepsExisting;
  // Shown again at the unit of measure, which the rep often words from it.
  const about = keepsExisting
    ? descriptionAfterName(line.productName, line.productDescription)
    : product
      ? descriptionAfterName(product.name ?? "", product.description)
      : null;

  const problems = lineProblems({
    pricebookEntryId: keepsExisting ? line.pricebookEntryId : entry ? entry.id : "",
    category: mapped ?? category,
    quantity,
    discount,
  });
  const show = (k: string) => (tried ? problems[k] : undefined);

  const chooseProduct = (p: Product | null) => {
    setProduct(p);
    // No pre-fill: Product_Unit__c turned out to be the product family (APIM,
    // IAM…), not a unit of measure (verified 2026-09-26). The rep types it.
  };

  const save = () => {
    setTried(true);
    if (Object.keys(problems).length > 0) return;
    const base: LineValue = keepsExisting
      ? { ...line }
      : {
          lineId: null,
          pricebookEntryId: entry!.id,
          productName: product!.name ?? product!.id,
          productCode: product!.productCode ?? "",
          productDescription: product!.description ?? "",
          pricebookId: entry!.pricebook?.id ?? "",
          pricebookName: entry!.pricebook?.name ?? "",
          unitPrice: entry!.unitPrice ?? "",
          category: mapped ?? (category as LineCategory),
          categorySource: source,
          unitOfMeasure: "",
          quantity: "",
          discount: "",
        };
    onSave({
      ...base,
      category: mapped ?? (category as LineCategory),
      categorySource: source,
      unitOfMeasure: uom.trim(),
      quantity: String(Number(quantity)),
      discount: discount.trim() || "0",
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle component="div">
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            aria-hidden
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              color: "primary.main",
              bgcolor: "action.selected",
            }}
          >
            <PackageIcon size={20} />
          </Box>
          <Box>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
              {line ? "Edit line" : "Add a product"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Priced from {pricebook.name} in {currency}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Group icon={<PackageIcon size={14} />} title="Product">
            {line && keepsExisting ? (
              <ProductCard
                name={line.productName}
                description={line.productDescription}
                code={line.productCode}
                pricebook={line.pricebookName}
                unitPrice={line.unitPrice}
                currency={currency}
                note="The saved price is kept. Choose the product again below to price it again."
              />
            ) : product && entry ? (
              <ProductCard
                name={product.name ?? product.id}
                description={product.description ?? null}
                code={product.productCode ?? ""}
                pricebook={entry.pricebook?.name ?? ""}
                unitPrice={entry.unitPrice ?? ""}
                currency={currency}
              />
            ) : null}
            <ProductListContext.Provider value={listState}>
              <Autocomplete
                options={options}
                getOptionLabel={getName}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                filterOptions={(x) => x}
                loading={products.isPending && products.fetchStatus !== "idle"}
                value={product}
                onChange={(_, p) => chooseProduct(p)}
                onInputChange={(_, v) => setTerm(v)}
                slots={{ paper: ProductListPaper }}
                slotProps={{
                  listbox: {
                    ref: (el: Element | null) => {
                      listbox.current = el as HTMLElement | null;
                    },
                    onScroll: (e: UIEvent<HTMLElement>) => onListScroll(e.currentTarget),
                  },
                }}
                // The name, then the description on one quiet line; in full on hover.
                renderOption={({ key, ...props }, p) => {
                  const about = descriptionAfterName(p.name ?? "", p.description);
                  return (
                    <li key={key} {...props}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap title={getName(p)}>
                          {getName(p)}
                        </Typography>
                        {about ? (
                          <Typography variant="caption" color="text.secondary" component="div" noWrap title={about}>
                            {about}
                          </Typography>
                        ) : null}
                      </Box>
                    </li>
                  );
                }}
                noOptionsText={`No matching products in ${pricebook.name}`}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={line ? "Change product" : "Product"}
                    placeholder="Search by name or product code"
                    size="small"
                    required={!line}
                    error={Boolean(show("product")) && !product}
                    helperText={show("product") && !product ? show("product") : `Products in ${pricebook.name}, priced in ${currency}`}
                  />
                )}
              />
            </ProductListContext.Provider>
            {chosen && mapped ? (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                aria-label="Category"
                sx={{ flexWrap: "wrap", rowGap: 0.5 }}
              >
                <Typography variant="body2" color="text.secondary">
                  Category
                </Typography>
                <Chip size="small" color="primary" variant="outlined" label={categoryLabel(mapped)} />
                <Typography variant="caption" color="text.secondary">
                  Set for this product by an Admin
                </Typography>
              </Stack>
            ) : chosen ? (
              <>
                <Alert severity="warning">
                  No category is set up for this product. Choose one; Deal Desk will check it.
                </Alert>
                <TextField
                  select
                  label="Category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as LineCategory)}
                  size="small"
                  required
                  error={Boolean(show("category"))}
                  helperText={show("category")}
                >
                  {CATEGORIES.map((c) => (
                    <MenuItem key={c.value} value={c.value}>
                      {c.label}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            ) : null}
          </Group>
          <Group icon={<PercentIcon size={14} />} title="Quantity & discount">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                size="small"
                required
                inputMode="numeric"
                error={Boolean(show("quantity"))}
                helperText={show("quantity") ?? "Whole units only"}
              />
              <TextField
                label="Discount"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                size="small"
                error={Boolean(show("discount"))}
                helperText={show("discount")}
                slotProps={{
                  input: {
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  },
                }}
              />
            </Stack>
            {/* Its own row: the description under it can be up to ~140 characters. */}
            <TextField
              label="Unit of measure"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              size="small"
              fullWidth
              helperText={about ? `Product description: ${about}` : undefined}
            />
          </Group>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>
          {line ? "Update line" : "Add line"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
