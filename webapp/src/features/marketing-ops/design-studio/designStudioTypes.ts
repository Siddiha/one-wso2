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

// The data model for a single LinkedIn post/banner design, ported from the
// standalone "WSO2 Post Builder" HTML tool. Every field here mirrors a field
// of that tool's global `state` object — see postBuilderCore.ts for the
// rendering engine that draws it onto a canvas.

export type PostType = 'organic' | 'casestudy' | 'ad' | 'quote' | 'event' | 'statistic'
export type PostFormat = 'square' | 'banner'
export type EventFormat = 'icons' | 'lockup'
export type LogoPos = 'aboveHeadline' | 'none'
export type LogoColor = 'white' | 'black'
export type IconColor = '#FFFFFF' | '#F14E23' | '#0D0D0D'
export type ColorKey = 'white' | 'black' | 'orange' | 'blue'

// An uploaded image can be drawn either as a loaded <img> (after a project
// reload, or as the raw background image) or as a <canvas> (the in-session
// output of recolorToWhite() for customer/partner logos) — both are valid
// CanvasImageSource values everywhere they're used.
export type ImageSource = HTMLImageElement | HTMLCanvasElement

export interface PostState {
  type: PostType
  logoPos: LogoPos
  iconOn: boolean
  iconColor: IconColor
  logoColor: LogoColor
  format: PostFormat
  canvasW: number
  canvasH: number
  tag: string
  headline: string
  sub: string
  body: string
  cta: string
  bgImage: ImageSource | null
  overlayOpacity: number
  headlineWeight: number
  textScale: number
  bgRotate: 0 | 90 | 180 | 270
  bgFlipH: boolean
  bgFlipV: boolean
  bgSpanSlides: boolean
  customerLogo: ImageSource | null
  quote1: string
  quote2: string
  quoteName: string
  quoteTitle: string
  eventFormat: EventFormat
  eventHeadline: string
  eventSub: string
  eventDate: string
  eventTime: string
  eventLocation: string
  eventKicker: string
  eventName: string
  eventVenue: string
  eventDates: string
  partnerLogo: ImageSource | null
  statLeadin: string
  statNumber: string
  statLabel: string
  statTwoUp: boolean
  statNumber2: string
  statLabel2: string
}

// Every field the source tool lets the designer color independently — note
// this is 7 keys, not just the 4 main content fields: the quote attribution
// name and the event headline/sub each get their own color chip too.
export type TextColorField = 'tag' | 'headline' | 'sub' | 'body' | 'quoteName' | 'eventHeadline' | 'eventSub'
export type TextColors = Record<TextColorField, ColorKey>

// ─────────────────────────────────────────────────────────────────────────────
// Carousel — a slide snapshots only the content fields; background, logo,
// icon, and format stay shared/global across the whole carousel (matching
// the source tool's SLIDE_KEYS/SLIDE_COLOR_KEYS exactly).

export const SLIDE_KEYS = [
  'type', 'tag', 'headline', 'sub', 'body', 'cta', 'headlineWeight',
  'statLeadin', 'statNumber', 'statLabel', 'statTwoUp', 'statNumber2', 'statLabel2',
] as const satisfies readonly (keyof PostState)[]
export type SlideKey = (typeof SLIDE_KEYS)[number]

export const SLIDE_COLOR_KEYS = ['tag', 'headline', 'sub', 'body'] as const satisfies readonly TextColorField[]
export type SlideColorKey = (typeof SLIDE_COLOR_KEYS)[number]

export type Slide = Pick<PostState, SlideKey> & { colors: Pick<TextColors, SlideColorKey> }

// ─────────────────────────────────────────────────────────────────────────────
// Project file — the shape saved to a downloadable .json and to the
// localStorage autosave slot. Image fields aren't JSON-safe, so they're
// stored as data URLs and rebuilt into real Image objects on load.

export const PROJECT_VERSION = 1

export interface ProjectFile {
  v: number
  savedAt: string
  state: Omit<PostState, 'bgImage' | 'customerLogo' | 'partnerLogo'>
  images: { bgImage: string | null; customerLogo: string | null; partnerLogo: string | null }
  textColors: TextColors
  carouselOn: boolean
  slides: Slide[]
  activeSlideIdx: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults — mirrors the source tool's initial `state`/`textColors` (default
// post type: Case Study).

export function defaultPostState(): PostState {
  return {
    type: 'casestudy', logoPos: 'none', iconOn: true, iconColor: '#FFFFFF', logoColor: 'white',
    format: 'square', canvasW: 1080, canvasH: 1080,
    tag: 'CASE STUDY_', headline: 'How a Leading Business Association Uses WSO2',
    sub: 'to Unify Member Services', body: '', cta: '',
    bgImage: null, overlayOpacity: 45, headlineWeight: 800, textScale: 1,
    bgRotate: 0, bgFlipH: false, bgFlipV: false, bgSpanSlides: false, customerLogo: null,
    quote1: '', quote2: '', quoteName: '', quoteTitle: '',
    eventFormat: 'icons', eventHeadline: '', eventSub: '', eventDate: '', eventTime: '', eventLocation: '',
    eventKicker: 'See us at', eventName: '', eventVenue: '', eventDates: '', partnerLogo: null,
    statLeadin: '', statNumber: '', statLabel: '', statTwoUp: false, statNumber2: '', statLabel2: '',
  }
}

export function defaultTextColors(): TextColors {
  return { tag: 'white', headline: 'white', sub: 'white', body: 'white', quoteName: 'white', eventHeadline: 'white', eventSub: 'white' }
}

// Per-type placeholder/default content, applied when switching post type —
// mirrors the source tool's setType()/PHS table exactly.
export const TYPE_PLACEHOLDERS: Record<'organic' | 'casestudy' | 'ad', { tag: string; headline: string; sub: string; body: string; cta: string }> = {
  organic: { tag: '', headline: 'WSO2 Turns 20', sub: 'Two decades of building open-source integration technology', body: 'Thank you to everyone who has been part of the journey.', cta: '' },
  casestudy: { tag: 'CASE STUDY_', headline: 'How a Leading Business Association Uses WSO2', sub: 'to Unify Member Services', body: 'See how they cut **integration time** by 70%.', cta: 'Read the Case Study' },
  ad: { tag: '', headline: 'Deploy anywhere. Control everything.', sub: 'Built for enterprise-grade IAM', body: '', cta: 'Learn More' },
}
