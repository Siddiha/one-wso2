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

// Wire types for the quote endpoints; they mirror backend/types. Money values
// are decimal strings ("41000.00") and dates are "YYYY-MM-DD" strings.

export type DealType = "DIRECT" | "PARTNER";
export type BillingFrequency = "ANNUAL" | "UPFRONT";
export type LineCategory = "SUBSCRIPTION" | "SUPPORT" | "PROFESSIONAL_SERVICE";

/**
 * Who chose a line's category: MAPPED = an Admin's product mapping (the
 * rep can't change it); REP = the product isn't mapped, so the rep chose and
 * Deal Desk verifies it.
 */
export type CategorySource = "MAPPED" | "REP";
/**
 * How the subscription term is set: 1 year, a whole number of years
 * (2–10), or an end date the AM types that falls within a year — aligned to
 * a running contract (co-termed) or stand-alone (shorter term).
 */
export type TermMode = "ONE_YEAR" | "MULTI_YEAR" | "CO_TERMED" | "SHORTER";

/** A problem with one field, e.g. { field: "lines[2].quantity", message: "…" }. */
export interface Issue {
  readonly field: string;
  readonly message: string;
}

/** 422 body. */
export interface ValidationProblem {
  readonly message: string;
  readonly issues: readonly Issue[];
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export interface Address {
  readonly street: string | null;
  readonly city: string | null;
  readonly stateProvince: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
}

export interface Account {
  readonly id: string;
  readonly name: string | null;
  readonly billingAddress: Address | null;
  /** Salesforce Sales_Regions__c, e.g. "APAC". Required to quote. */
  readonly salesRegion: string | null;
  /** Salesforce Sub_Region__c, e.g. "South Asia". Optional. */
  readonly subRegion: string | null;
}

export interface Partner {
  readonly id: string | null;
  readonly name: string | null;
  readonly role: string | null;
  readonly recordType: string | null;
  readonly billingAddress: Address | null;
}

export interface Opportunity {
  readonly id: string;
  readonly name: string | null;
  readonly stageName: string | null;
  readonly closeDate: string | null;
  /** Day created (YYYY-MM-DD); the list comes newest-created first. */
  readonly createdDate: string | null;
  readonly currencyIsoCode: string | null;
  readonly isWon: boolean | null;
  readonly isClosed: boolean | null;
  readonly directChannel: string | null;
  readonly dealType: DealType | null;
  readonly partner: Partner | null;
  /** Salesforce RecordType.Name, e.g. "Renewal". */
  readonly recordTypeName: string | null;
  /** What the record type means for the quote and its approvals. */
  readonly dealKind: DealKind;
  /** ARR_Cloud_ARR__c in the opportunity's own currency (SF-Q1 provisional). */
  readonly arr: number | null;
  /** The opportunity's price book, which all its products come from; pre-fills the quote's. */
  readonly pricebook?: PricebookRef | null;
  /** Subs_Start_Date__c / Subs_End_Date__c; null on a consultancy-only deal. A renewal starts the day after the renewed one ends. */
  readonly subsStartDate?: string | null;
  readonly subsEndDate?: string | null;
}

/**
 * When a renewal is expected to start: the day after the renewed opportunity's
 * subscription end date. `differs`: the quote starts another day (a warning
 * for the AM and Deal Desk; never blocks).
 */
export interface RenewalStart {
  readonly expectedStartDate: string;
  readonly fromOpportunityId: string;
  readonly fromOpportunityName: string;
  readonly differs: boolean;
}

/** First Sale, Renewal or Expansion; any other record type is OTHER. */
export type DealKind = "FIRST_SALE" | "RENEWAL" | "EXPANSION" | "OTHER";

export interface Contact {
  readonly id: string | null;
  readonly name: string | null;
  readonly title: string | null;
  readonly email: string | null;
}

export interface PricebookEntry {
  readonly id: string;
  readonly unitPrice: string | null;
  readonly currencyIsoCode: string | null;
  readonly isActive: boolean;
  readonly pricebook: {
    readonly id: string | null;
    readonly name: string | null;
  } | null;
}

/** A price book. */
export interface PricebookRef {
  readonly id: string;
  readonly name: string;
}

/** GET /pricebooks: a price book the quote can use; "(Current)" books first. */
export interface PricebookOption extends PricebookRef {
  readonly current: boolean;
  /** How many active products the book prices in the currency; null when unknown (not shown). */
  readonly productCount?: number | null;
}

export interface Product {
  readonly id: string;
  readonly name: string | null;
  readonly productCode: string | null;
  /** The product's Salesforce description. */
  readonly description?: string | null;
  readonly family: string | null;
  readonly unitOfMeasure: string | null;
  /** Product_Unit__c and product_Classification__c: the approval group inputs. */
  readonly productUnit: string | null;
  readonly classification: string | null;
  /** The Admin's mapping; null = not mapped, the rep chooses. */
  readonly category?: LineCategory | null;
  readonly pricebookEntries: readonly PricebookEntry[];
}

export interface ActiveLegalEntity {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly country: string;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Headline numbers. ARR and ACV are null for a services-only quote. */
export interface Totals {
  readonly arr: string | null;
  readonly acv: string | null;
  readonly tcv: string;
  /** The first invoice: net of any partner commission (A6). */
  readonly payableNow: string;
  /** Partner-led quotes with a commission % only; null otherwise. */
  readonly partnerCommission?: string | null;
  /** TCV less the partner commission: what WSO2 invoices in all. */
  readonly netOrderValue?: string | null;
}

export interface ScheduleRow {
  readonly yearNumber: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly yearFraction: string;
  readonly gross: string;
  readonly discount: string;
  readonly net: string;
  readonly billing: string;
  /** Partner commission on this row, and what is invoiced after it (A6). */
  readonly commission?: string;
  readonly netBilling?: string;
}

export interface PricingYear {
  readonly yearNumber: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly net: string;
  readonly billing: string;
  readonly commission?: string;
  readonly netBilling?: string;
}

export interface PricingPreview {
  readonly rulesVersion: string;
  readonly termMonths: string;
  readonly totals: Totals;
  readonly years: readonly PricingYear[];
  readonly lines: readonly {
    readonly pricebookEntryId: string;
    /** The category priced: a mapped product's comes from its mapping. */
    readonly category?: LineCategory;
    readonly categorySource?: CategorySource;
    readonly annualList: string;
    readonly annualNet: string;
    readonly arr: string;
    readonly tcv: string;
    readonly commission?: string;
    readonly schedule: readonly ScheduleRow[];
  }[];
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export interface ContactInput {
  readonly sfContactId?: string;
  readonly name?: string;
  readonly title?: string;
  readonly email?: string;
}

export interface AddressInput {
  readonly sfAccountId?: string;
  readonly companyName?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly stateProvince?: string;
  readonly postalCode?: string;
  readonly country?: string;
  readonly taxId?: string;
}

export interface DraftLineInput {
  readonly keepSnapshotFromLineId?: number;
  readonly pricebookEntryId: string;
  readonly quantity: number;
  readonly category: LineCategory;
  readonly discretionaryDiscountPercent: string;
  readonly unitOfMeasure?: string;
}

/** POST /quotes and PUT /quotes/{id}/versions/{n} body. */
export interface DraftInput {
  readonly sfOpportunityId: string;
  readonly sfAccountId: string;
  readonly expectedUpdatedAt?: string;
  /** Only kept when Salesforce says the opportunity is a Renewal. */
  readonly previousOpportunityIds: readonly string[];
  readonly legalEntityId?: number;
  readonly currencyIsoCode?: string;
  /** The quote's price book; omitted = none chosen. */
  readonly defaultPricebookId?: string;
  readonly subscriptionStartDate?: string;
  readonly termMode?: TermMode;
  /** Multi-year only (2–10). */
  readonly termYears?: number;
  /** Typed in for Co-termed and Shorter term only; other modes derive it. */
  readonly subscriptionEndDate?: string;
  /** Multi-year only; every other term is billed annually. */
  readonly billingFrequency?: BillingFrequency;
  /** Partner-led quotes only: one % for every line. */
  readonly partnerCommissionPercent?: string;
  readonly netTermsDays?: number;
  readonly specialTerms: { readonly enabled: boolean; readonly text?: string };
  readonly governingTerms: {
    readonly enabled: boolean;
    readonly text?: string;
  };
  readonly poNumber?: string;
  readonly justification?: string;
  readonly contacts: {
    readonly billing?: ContactInput;
    readonly security?: ContactInput;
  };
  readonly billTo?: AddressInput;
  readonly shipTo?: AddressInput;
  readonly shipToSameAsBillTo: boolean;
  readonly lines: readonly DraftLineInput[];
}

export interface LineView {
  readonly id: number;
  readonly lineNumber: number;
  readonly sfProductId: string;
  readonly productName: string;
  readonly productCode: string | null;
  /** The product's description, stored with the line. */
  readonly productDescription?: string | null;
  readonly pricebookEntryId: string;
  readonly pricebookId?: string;
  readonly pricebookName: string;
  readonly unitPrice: string;
  readonly unitOfMeasure: string | null;
  readonly productUnit: string | null;
  readonly classification: string | null;
  readonly quantity: number;
  readonly category: LineCategory;
  readonly categorySource?: CategorySource;
  readonly discretionaryDiscountPercent: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly annualList: string;
  readonly annualNet: string;
  readonly arr: string;
  readonly acv: string;
  readonly tcv: string;
  readonly commission?: string;
  readonly schedule: readonly ScheduleRow[];
}

export interface ContactView {
  readonly role: "BILLING" | "SECURITY";
  readonly source: "SALESFORCE" | "MANUAL";
  readonly sfContactId: string | null;
  readonly name: string;
  readonly title: string | null;
  readonly email: string | null;
}

export interface AddressView {
  readonly type: "BILL_TO" | "SHIP_TO";
  readonly source: "SALESFORCE" | "MANUAL" | "SAME_AS_BILL_TO";
  readonly sfAccountId: string | null;
  readonly companyName: string;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly stateProvince: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly taxId: string | null;
}

/** The WSO2 legal entity as snapshotted on a version. */
export interface LegalEntitySnapshot {
  readonly code: string;
  readonly name: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string | null;
  readonly city?: string;
  readonly stateProvince?: string | null;
  readonly postalCode?: string | null;
  readonly country?: string;
  readonly taxId?: string | null;
  readonly registrationNumber?: string | null;
}

/**
 * Version statuses. The quote shows its latest version's. A
 * SUBMITTED version is in approval.
 */
export type VersionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "RECALLED"
  | "CLOSED"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED";

/** Lifecycle actions the caller may take now. */
export type QuoteAction = "RECALL" | "REVISE" | "CLOSE";

export interface VersionView {
  readonly versionNumber: number;
  readonly status: VersionStatus;
  readonly pricingRulesVersion: string;
  readonly accountName: string | null;
  /** The account's sales region and sub-region, as of the last save; frozen at submit. */
  readonly accountSalesRegion: string | null;
  readonly accountSubRegion: string | null;
  readonly opportunityName: string | null;
  readonly dealType: DealType | null;
  readonly partner: {
    readonly sfAccountId: string | null;
    readonly name: string | null;
    readonly role: string | null;
  } | null;
  readonly legalEntityId: number | null;
  /** Snapshot taken on save. */
  readonly legalEntity: LegalEntitySnapshot | null;
  /** Derived from the opportunity's record type. */
  readonly isRenewal: boolean;
  readonly opportunityRecordType: string | null;
  readonly dealKind: DealKind;
  readonly currencyIsoCode: string | null;
  /** The quote's price book; null until the rep chooses. */
  readonly defaultPricebook?: PricebookRef | null;
  readonly subscriptionStartDate: string | null;
  readonly subscriptionEndDate: string | null;
  /** Null for a services-only quote, or a version submitted before term modes. */
  readonly termMode: TermMode | null;
  readonly termYears: number | null;
  /** "15.00" on a partner-led quote with a commission; null otherwise. */
  readonly partnerCommissionPercent?: string | null;
  readonly billingFrequency: BillingFrequency | null;
  readonly netTermsDays: number | null;
  readonly specialTerms: {
    readonly enabled: boolean;
    readonly text: string | null;
  };
  readonly governingTerms: {
    readonly enabled: boolean;
    readonly text: string | null;
  };
  readonly poNumber: string | null;
  readonly justification: string | null;
  readonly totals: Totals;
  readonly contacts: readonly ContactView[];
  readonly addresses: readonly AddressView[];
  readonly previousOpportunities: readonly {
    readonly sfOpportunityId: string;
    readonly name: string;
    readonly arr: string | null;
    readonly currencyIsoCode: string | null;
    /** Its subscription dates in Salesforce when the version was saved (frozen at submission). */
    readonly subsStartDate?: string | null;
    readonly subsEndDate?: string | null;
  }[];
  /** A renewal's expected start date: the day after the renewed opportunity ends; null when unknown or not a renewal. */
  readonly renewalStart?: RenewalStart | null;
  readonly lines: readonly LineView[];
  /** Set on submit: the UTC day it was submitted, and + validity days. */
  readonly issueDate: string | null;
  readonly expiryDate: string | null;
  readonly submittedAt: string | null;
  readonly submittedByEmail: string | null;
  /** The version this one was revised from. */
  readonly copiedFromVersion: number | null;
  readonly closedReason: string | null;
  readonly closedByEmail: string | null;
  readonly closedAt: string | null;
  readonly updatedAt: string;
  readonly updatedByEmail: string;
}

export interface QuoteView {
  readonly id: number;
  /** Set at the quote's first submit; null before. */
  readonly quoteNumber: string | null;
  /** The latest version's status; the quote has none of its own. */
  readonly status: VersionStatus;
  /** What the caller may do now; empty for anyone but the owner. */
  readonly actions: readonly QuoteAction[];
  readonly ownerEmail: string;
  readonly sfOpportunityId: string;
  readonly sfAccountId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly versions: readonly {
    readonly versionNumber: number;
    readonly status: VersionStatus;
    readonly tcv: string;
    readonly submittedAt: string | null;
    readonly updatedAt: string;
  }[];
}

/** Response of a save or a version read. */
export interface DraftResponse {
  readonly quote: QuoteView;
  readonly version: VersionView;
  readonly issues: readonly Issue[];
}

export interface QuoteListItem {
  readonly id: number;
  /** Set at the quote's first submit; null before. */
  readonly quoteNumber: string | null;
  /** The latest version's status. */
  readonly status: VersionStatus;
  readonly ownerEmail: string;
  readonly accountName: string | null;
  readonly opportunityName: string | null;
  readonly versionNumber: number;
  readonly currencyIsoCode: string | null;
  readonly tcv: string;
  readonly expiryDate: string | null;
  readonly updatedAt: string;
}

/** One entry of GET /quotes/{id}/audit-events. */
export interface AuditEvent {
  readonly id: number;
  readonly eventType:
    | "QUOTE_CREATED"
    | "DRAFT_SAVED"
    | "VERSION_SUBMITTED"
    | "VERSION_RECALLED"
    | "VERSION_DELETED"
    | "VERSION_CREATED"
    | "QUOTE_CLOSED"
    // Approvals.
    | "APPROVAL_WORKFLOW_CREATED"
    | "APPROVAL_REQUESTED"
    | "APPROVAL_APPROVED"
    | "APPROVAL_REJECTED"
    | "APPROVAL_CHANGES_REQUESTED"
    | "VERSION_APPROVED"
    | "ORDER_FORM_PREVIEWED"
    | "ORDER_FORM_ISSUED"
    | "DOCUMENT_DOWNLOADED"
    | "DOCUMENT_GENERATION_FAILED";
  readonly versionNumber: number | null;
  readonly actorEmail: string;
  readonly occurredAt: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly comment: string | null;
  readonly metadata: Record<string, unknown> | null;
}

/** GET /quote-settings. */
export interface QuoteSettings {
  /** Expiry = submission date (UTC) + this many days. */
  readonly validityDays: number;
}

export interface QuoteList {
  readonly items: readonly QuoteListItem[];
  readonly total: number;
}

// ---------------------------------------------------------------------------
// Order form documents
// ---------------------------------------------------------------------------

/** One issued document; the file is immutable (DGD-7). */
export interface DocumentView {
  readonly id: number;
  readonly documentNumber: number;
  readonly documentType: "ORDER_FORM" | "QUOTE";
  readonly layout: "DIRECT" | "PARTNER";
  readonly status: "ACTIVE" | "SUPERSEDED";
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly issueDate: string;
  readonly expiryDate: string;
  readonly generatedAt: string;
  readonly generatedByEmail: string;
}

/** A version's documents and what the caller may do now. */
export interface DocumentsView {
  /** The owner, on an approved version not yet issued (DGD-2, DGD-3). */
  readonly canPreview: boolean;
  readonly canIssue: boolean;
  /** What issuing today would set. */
  readonly issueDate: string;
  readonly expiryDate: string;
  readonly documents: readonly DocumentView[];
}

/** The answer to DELETE /quotes/{id}/versions/{n}. */
export interface DeleteDraftResult {
  /** The draft was the quote's only version, so the whole quote is gone. */
  readonly quoteDeleted: boolean;
  /** The latest version again; null when the quote is gone. */
  readonly latest: DraftResponse | null;
}
