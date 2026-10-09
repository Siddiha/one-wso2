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

// The read-only quote sheet (2026-09-25): one shape for everything a
// quote says, built either from a saved version (the quote page) or from the
// unsaved wizard form plus the live preview (the Review step), so both show
// exactly the same thing. Pure functions only, so the mapping is unit-tested.
//
//   saved version ──sheetFromVersion──┐
//                                     ├──► QuoteSheet ──► sheet components
//   form + preview ──sheetFromForm────┘

import { descriptionAfterName } from "@features/sales/cado2/utils/productDescription";
import type {
  BillingFrequency,
  DealType,
  DraftResponse,
  LineCategory,
  PricingPreview,
  PricingYear,
  ScheduleRow,
  TermMode,
  Totals,
} from "@features/sales/cado2/quotes/api/quoteTypes";
import { sumMoney } from "@features/sales/cado2/utils/money";
import {
  commissionProblem,
  effectiveBilling,
  endDateFor,
  hasRecurring,
  isPartnerLed,
  storedPricing,
  termEnd,
  type AddressValue,
  type ContactValue,
  type DraftFormValues,
} from "@features/sales/cado2/quotes/form/draftForm";

export type ContactRole = "BILLING" | "SECURITY";

export interface SheetContact {
  readonly role: ContactRole;
  readonly name: string;
  readonly title: string | null;
  readonly email: string | null;
  readonly source: "SALESFORCE" | "MANUAL";
}

export interface SheetAddress {
  readonly companyName: string;
  /** Street, city line and country, each non-empty. */
  readonly lines: readonly string[];
  readonly taxId: string | null;
}

export interface SheetLine {
  readonly number: number;
  readonly productName: string;
  readonly productCode: string | null;
  /** The product's description, without the name if it repeats it. */
  readonly productDescription: string | null;
  readonly pricebookName: string;
  readonly category: LineCategory;
  /** The rep chose the category, because the product isn't mapped: Deal Desk verifies it. */
  readonly categoryByRep: boolean;
  readonly quantity: string;
  readonly unitOfMeasure: string | null;
  readonly unitPrice: string;
  /** e.g. "10" for 10%; "0" when none. */
  readonly discountPercent: string;
  /** Every line covers the quote's term; a service is dated at the start. */
  readonly startDate: string;
  readonly endDate: string;
  /** From the pricing, when the quote can be priced. */
  readonly annualList: string | null;
  readonly annualNet: string | null;
  readonly arr: string | null;
  readonly acv: string | null;
  /** What the line costs over the whole term; the order form's amount. */
  readonly tcv: string | null;
  /** The partner commission on this line; null when unpriced. */
  readonly commission: string | null;
  /** Its yearly rows; empty when the quote can't be priced. */
  readonly schedule: readonly ScheduleRow[];
}

export interface QuoteSheet {
  readonly accountName: string;
  /** Salesforce sales region, e.g. "APAC"; "" when none. */
  readonly salesRegion: string;
  /** Salesforce sub-region, e.g. "South Asia"; "" when none. */
  readonly subRegion: string;
  readonly opportunityName: string;
  readonly dealType: DealType | null;
  readonly partner: { readonly name: string; readonly role: string | null } | null;
  readonly isRenewal: boolean;
  /** Names when known (saved versions); the form only knows how many. */
  readonly previousOpportunities: readonly string[];
  readonly previousOpportunityCount: number;
  /**
   * A renewal's expected start: the day after the renewed opportunity ends,
   * as saved (frozen at submission). `differs`: the quote starts another day.
   * Null when unknown (no end date in Salesforce, an unsaved form) or not a renewal.
   */
  readonly renewalStart: { readonly date: string; readonly fromName: string; readonly differs: boolean } | null;
  readonly legalEntity: { readonly name: string; readonly address: string | null } | null;
  readonly currency: string;
  /** The quote's price book; null when none was chosen. */
  readonly pricebookName: string | null;
  readonly startDate: string;
  /** "" for a services-only quote, which has no term. */
  readonly endDate: string;
  /** Null for a services-only quote, or a version submitted before term modes. */
  readonly termMode: TermMode | null;
  readonly termYears: number | null;
  /** Whether any line recurs, i.e. the quote has a subscription term. */
  readonly recurring: boolean;
  readonly billingFrequency: BillingFrequency | null;
  /** e.g. "15" on a partner-led quote with a commission; null otherwise. */
  readonly partnerCommissionPercent: string | null;
  /** Billing, then security; null when not chosen. */
  readonly contacts: readonly [SheetContact | null, SheetContact | null];
  readonly lines: readonly SheetLine[];
  readonly years: readonly PricingYear[];
  readonly totals: Totals | null;
  readonly netTermsDays: number | null;
  readonly poNumber: string | null;
  /** The text when switched on; null when off. */
  readonly specialTerms: string | null;
  readonly governingTerms: string | null;
  readonly billTo: SheetAddress | null;
  /** null with shipToSameAsBillTo = the bill-to address. */
  readonly shipTo: SheetAddress | null;
  readonly shipToSameAsBillTo: boolean;
  readonly justification: string | null;
  readonly pricingRulesVersion: string | null;
}

const ROLES: readonly ContactRole[] = ["BILLING", "SECURITY"];
const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

function addressLines(a: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string[] {
  const cityLine = [a.city, a.stateProvince, a.postalCode].map(blank).filter(Boolean).join(", ");
  return [a.addressLine1, a.addressLine2, cityLine, a.country].map(blank).filter((x): x is string => x !== null);
}

// ---------------------------------------------------------------------------
// From a saved version
// ---------------------------------------------------------------------------

export function sheetFromVersion(res: DraftResponse): QuoteSheet {
  const v = res.version;
  const pricing = storedPricing(res);
  const contact = (role: ContactRole): SheetContact | null => {
    const c = v.contacts.find((x) => x.role === role);
    return c ? { role, name: c.name, title: blank(c.title), email: blank(c.email), source: c.source } : null;
  };
  const address = (type: "BILL_TO" | "SHIP_TO"): SheetAddress | null => {
    const a = v.addresses.find((x) => x.type === type);
    if (!a || a.source === "SAME_AS_BILL_TO") return null;
    return { companyName: a.companyName, lines: addressLines(a), taxId: blank(a.taxId) };
  };
  const le = v.legalEntity;
  return {
    accountName: v.accountName ?? "",
    salesRegion: v.accountSalesRegion ?? "",
    subRegion: v.accountSubRegion ?? "",
    opportunityName: v.opportunityName ?? "",
    dealType: v.dealType,
    partner: v.partner?.name ? { name: v.partner.name, role: v.partner.role } : null,
    isRenewal: v.isRenewal,
    previousOpportunities: v.previousOpportunities.map((p) => p.name),
    previousOpportunityCount: v.previousOpportunities.length,
    renewalStart: v.renewalStart
      ? { date: v.renewalStart.expectedStartDate, fromName: v.renewalStart.fromOpportunityName, differs: v.renewalStart.differs }
      : null,
    legalEntity: le ? { name: le.name, address: addressLines(le).join(", ") || null } : null,
    currency: v.currencyIsoCode ?? "",
    pricebookName: v.defaultPricebook?.name ?? null,
    startDate: v.subscriptionStartDate ?? "",
    endDate: v.subscriptionEndDate ?? "",
    termMode: v.termMode,
    termYears: v.termYears,
    recurring: hasRecurring(v.lines),
    billingFrequency: v.billingFrequency,
    partnerCommissionPercent: v.partnerCommissionPercent ? String(Number(v.partnerCommissionPercent)) : null,
    contacts: [contact("BILLING"), contact("SECURITY")],
    lines: v.lines.map((l) => ({
      number: l.lineNumber,
      productName: l.productName,
      productCode: blank(l.productCode),
      productDescription: descriptionAfterName(l.productName, l.productDescription),
      pricebookName: l.pricebookName,
      category: l.category,
      categoryByRep: l.categorySource !== "MAPPED",
      quantity: String(l.quantity),
      unitOfMeasure: blank(l.unitOfMeasure),
      unitPrice: l.unitPrice,
      discountPercent: String(Number(l.discretionaryDiscountPercent)),
      startDate: l.startDate,
      endDate: l.endDate,
      annualList: pricing ? l.annualList : null,
      annualNet: pricing ? l.annualNet : null,
      arr: pricing ? l.arr : null,
      acv: pricing ? l.acv : null,
      tcv: pricing ? l.tcv : null,
      commission: pricing ? (l.commission ?? "0.00") : null,
      schedule: pricing ? l.schedule : [],
    })),
    years: pricing?.years ?? [],
    totals: pricing ? v.totals : null,
    netTermsDays: v.netTermsDays,
    poNumber: blank(v.poNumber),
    specialTerms: v.specialTerms.enabled ? blank(v.specialTerms.text) : null,
    governingTerms: v.governingTerms.enabled ? blank(v.governingTerms.text) : null,
    billTo: address("BILL_TO"),
    shipTo: address("SHIP_TO"),
    shipToSameAsBillTo: v.addresses.some((a) => a.type === "SHIP_TO" && a.source === "SAME_AS_BILL_TO"),
    justification: blank(v.justification),
    pricingRulesVersion: v.pricingRulesVersion || null,
  };
}

// ---------------------------------------------------------------------------
// From the unsaved wizard form (the Review step)
// ---------------------------------------------------------------------------

function formContact(role: ContactRole, c: ContactValue): SheetContact | null {
  if (c.mode === "none" || !blank(c.name)) return null;
  return { role, name: c.name.trim(), title: blank(c.title), email: blank(c.email), source: c.mode === "manual" ? "MANUAL" : "SALESFORCE" };
}

function formAddress(a: AddressValue): SheetAddress | null {
  const lines = addressLines(a);
  if (!blank(a.companyName) && lines.length === 0) return null;
  return { companyName: a.companyName.trim(), lines, taxId: blank(a.taxId) };
}

export function sheetFromForm(
  v: DraftFormValues,
  preview: PricingPreview | null,
  legalEntity: { name: string; country?: string } | null,
): QuoteSheet {
  const recurring = hasRecurring(v.lines);
  const end = recurring ? termEnd(v) : "";
  const contacts = [v.billingContact, v.securityContact].map((c, i) => formContact(ROLES[i], c));
  return {
    accountName: v.accountName,
    salesRegion: v.accountSalesRegion,
    subRegion: v.accountSubRegion,
    opportunityName: v.opportunityName,
    dealType: v.dealType,
    partner: v.dealType === "PARTNER" && v.partner?.name ? { name: v.partner.name, role: v.partner.role ?? null } : null,
    isRenewal: v.isRenewal,
    previousOpportunities: [],
    previousOpportunityCount: v.isRenewal ? v.previousOpportunityIds.length : 0,
    renewalStart: null,
    legalEntity: legalEntity ? { name: legalEntity.name, address: legalEntity.country ?? null } : null,
    currency: v.currencyIsoCode,
    pricebookName: v.defaultPricebookName || null,
    startDate: v.startDate,
    endDate: end,
    termMode: recurring && v.termMode ? v.termMode : null,
    termYears: recurring && v.termMode === "MULTI_YEAR" ? Number(v.termYears) : null,
    recurring,
    billingFrequency: recurring ? effectiveBilling(v) || null : null,
    partnerCommissionPercent:
      isPartnerLed(v) && !commissionProblem(v.partnerCommissionPercent) ? String(Number(v.partnerCommissionPercent)) : null,
    contacts: [contacts[0], contacts[1]],
    lines: v.lines.map((l, i) => {
      const p = preview?.lines[i];
      return {
        number: i + 1,
        productName: l.productName,
        productCode: blank(l.productCode),
        productDescription: descriptionAfterName(l.productName, l.productDescription),
        pricebookName: l.pricebookName,
        category: l.category,
        categoryByRep: l.categorySource !== "MAPPED",
        quantity: l.quantity,
        unitOfMeasure: blank(l.unitOfMeasure),
        unitPrice: l.unitPrice,
        discountPercent: String(Number(l.discount || "0")),
        startDate: v.startDate,
        endDate: l.category === "PROFESSIONAL_SERVICE" ? v.startDate : end,
        annualList: p?.annualList ?? null,
        annualNet: p?.annualNet ?? null,
        arr: p?.arr ?? null,
        acv: null,
        tcv: p?.tcv ?? null,
        commission: p ? (p.commission ?? "0.00") : null,
        schedule: p?.schedule ?? [],
      };
    }),
    years: preview?.years ?? [],
    totals: preview?.totals ?? null,
    netTermsDays: v.netTermsDays ? Number(v.netTermsDays) : null,
    poNumber: blank(v.poNumber),
    specialTerms: v.specialTermsEnabled ? blank(v.specialTerms) : null,
    governingTerms: v.governingTermsEnabled ? blank(v.governingTerms) : null,
    billTo: formAddress(v.billTo),
    shipTo: v.shipToSameAsBillTo ? null : formAddress(v.shipTo),
    shipToSameAsBillTo: v.shipToSameAsBillTo,
    justification: blank(v.justification),
    pricingRulesVersion: preview?.rulesVersion ?? null,
  };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** "3 years" when the term is whole years, else "18 months" (rounded), else "". */
export function termLength(start: string, end: string): string {
  if (!start || !end) return "";
  for (let y = 1; y <= 10; y++) if (endDateFor(start, y) === end) return y === 1 ? "1 year" : `${y} years`;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const months = (ey - sy) * 12 + (em - sm) + (ed + 1 >= sd ? 1 : 0);
  return months > 0 ? `${months} month${months === 1 ? "" : "s"}` : "";
}

export const MODE_LABEL: Record<TermMode, string> = {
  ONE_YEAR: "1 year",
  MULTI_YEAR: "Multi-year",
  CO_TERMED: "Co-termed",
  SHORTER: "Shorter term",
};

/**
 * How the term reads: "3 years · Multi-year", "5 months · Co-termed",
 * "1 year". A version submitted before term modes shows its length only.
 */
export function termLabel(s: Pick<QuoteSheet, "startDate" | "endDate" | "termMode">): string {
  const length = termLength(s.startDate, s.endDate);
  if (!s.termMode || s.termMode === "ONE_YEAR") return length;
  return [length, MODE_LABEL[s.termMode]].filter(Boolean).join(" · ");
}

/** The yearly schedule is shown only when the term runs over more than one contract year. */
export const hasYearlySchedule = (s: Pick<QuoteSheet, "years">) => s.years.length > 1;

/**
 * Which Salesforce opportunity a contract year belongs to, for display
 * only: Year 1 is this quote's; later years get their own, usually created later.
 */
export const yearOpportunity = (yearNumber: number) => (yearNumber === 1 ? "This quote's opportunity" : "Own opportunity, created later");

// ---------------------------------------------------------------------------
// The order form (invoice-style products table)
// ---------------------------------------------------------------------------

export interface OrderFormGroup {
  readonly category: LineCategory;
  readonly title: string;
  readonly lines: readonly SheetLine[];
  /** The group's own subtotal; null until every line in it is priced. */
  readonly subtotal: string | null;
}

export interface OrderForm {
  /** Subscription, Support, Professional Services; empty groups left out. */
  readonly groups: readonly OrderFormGroup[];
  /** Null when there is nothing to add up, or a line isn't priced yet. */
  readonly total: string | null;
  /**
   * A partner-led quote with a commission: the commission, the sum of
   * the lines' (like the engine), and the net order value. Null otherwise.
   */
  readonly commission: string | null;
  readonly netOrderValue: string | null;
}

const GROUP_TITLE: Record<LineCategory, string> = {
  SUBSCRIPTION: "Subscription",
  SUPPORT: "Support",
  PROFESSIONAL_SERVICE: "Professional Services",
};

/** Sums the lines' term amounts, or null if any isn't priced. */
function subtotal(lines: readonly SheetLine[]): string | null {
  if (lines.length === 0 || lines.some((l) => l.tcv === null)) return null;
  return sumMoney(lines.map((l) => l.tcv!));
}

/**
 * The lines grouped by category, in the style of the sample order form
 * (misc/WSO2_Order_Form_Sample.docx), each group with its own subtotal
 * (2026-09-28: Support and Professional Services are not added together):
 *
 *   Subscription            …lines…   Subscription subtotal
 *   Support                 …lines…   Support subtotal
 *   Professional Services   …lines…   Professional Services subtotal
 *                                     Total order value  (= TCV)
 *
 * Each line's amount is its cost over the whole term, so the totals always add up.
 */
export function orderForm(lines: readonly SheetLine[], commissionPercent: string | null = null): OrderForm {
  const groups = (["SUBSCRIPTION", "SUPPORT", "PROFESSIONAL_SERVICE"] as const)
    .map((category) => {
      const of = lines.filter((l) => l.category === category);
      return { category, title: GROUP_TITLE[category], lines: of, subtotal: subtotal(of) };
    })
    .filter((g) => g.lines.length > 0);
  const total = subtotal(lines);
  const commission =
    commissionPercent !== null && total !== null && lines.every((l) => l.commission !== null)
      ? sumMoney(lines.map((l) => l.commission!))
      : null;
  return { groups, total, commission, netOrderValue: commission !== null ? sumMoney([total!, `-${commission}`]) : null };
}

// ---------------------------------------------------------------------------
// Deal figures (ARR, TCV, ACV, first invoice) and how each is worked out
// ---------------------------------------------------------------------------

/** Shown for ARR and ACV on a services-only quote, which has only TCV. */
export const NOT_APPLICABLE = "Not applicable";

export interface DealFigures {
  readonly arr: string | null;
  readonly tcv: string;
  readonly acv: string | null;
  readonly payableNow: string;
  /** The lines that make up ARR: one year of each Subscription and Support line. */
  readonly arrParts: readonly { readonly productName: string; readonly amount: string }[];
  /** Lines left out of ARR (one-time services). */
  readonly arrExcluded: readonly string[];
  /** The years that make up TCV. */
  readonly tcvParts: readonly { readonly yearNumber: number; readonly amount: string }[];
  /** The number of contract years ACV divides by, e.g. "3" or "0.5"; null when ACV doesn't apply. */
  readonly contractYears: string | null;
  /** Each line's share: ARR (null for a one-time service), TCV and commission. */
  readonly byProduct: readonly {
    readonly number: number;
    readonly productName: string;
    readonly arr: string | null;
    readonly tcv: string;
    readonly commission: string | null;
  }[];
  /** A partner-led quote with a commission: the %, the commission and the net order value. */
  readonly partner: { readonly percent: string; readonly commission: string; readonly netOrderValue: string } | null;
}

/**
 * The figures and their workings, or null until the quote is priced. ACV's
 * divisor is read back from the backend's own TCV and ACV, so it is
 * never recalculated differently here.
 */
export function dealFigures(
  s: Pick<QuoteSheet, "totals" | "lines" | "years"> & Partial<Pick<QuoteSheet, "partnerCommissionPercent">>,
): DealFigures | null {
  const t = s.totals;
  if (!t || s.lines.some((l) => l.tcv === null)) return null;
  const recurring = s.lines.filter((l) => l.category !== "PROFESSIONAL_SERVICE");
  const years = t.acv && Number(t.acv) > 0 ? Number(t.tcv) / Number(t.acv) : null;
  return {
    arr: t.arr,
    tcv: t.tcv,
    acv: t.acv,
    payableNow: t.payableNow,
    arrParts: recurring.map((l) => ({ productName: l.productName, amount: l.arr ?? "0.00" })),
    arrExcluded: s.lines.filter((l) => l.category === "PROFESSIONAL_SERVICE").map((l) => l.productName),
    tcvParts: s.years.map((y) => ({ yearNumber: y.yearNumber, amount: y.net })),
    contractYears: years === null ? null : String(Math.round(years * 100) / 100),
    byProduct: s.lines.map((l) => ({
      number: l.number,
      productName: l.productName,
      arr: l.category === "PROFESSIONAL_SERVICE" ? null : l.arr,
      tcv: l.tcv!,
      commission: s.partnerCommissionPercent ? l.commission : null,
    })),
    partner:
      s.partnerCommissionPercent && t.partnerCommission && t.netOrderValue
        ? { percent: s.partnerCommissionPercent, commission: t.partnerCommission, netOrderValue: t.netOrderValue }
        : null,
  };
}

export type ExpiryTone = "ok" | "soon" | "expired";

/**
 * Days until a quote expires, judged by the UTC day as the backend is:
 * "soon" inside 7 days, "expired" after the expiry day.
 */
export function expiryState(expiryDate: string, now: Date): { days: number; tone: ExpiryTone; label: string } {
  const [y, m, d] = expiryDate.split("-").map(Number);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
  if (days < 0) return { days, tone: "expired", label: `Expired ${-days} day${days === -1 ? "" : "s"} ago` };
  if (days === 0) return { days, tone: "soon", label: "Expires today" };
  return { days, tone: days <= 7 ? "soon" : "ok", label: `${days} day${days === 1 ? "" : "s"} left` };
}
