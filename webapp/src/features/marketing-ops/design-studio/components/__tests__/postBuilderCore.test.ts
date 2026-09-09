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

// Unit tests for postBuilderCore's PURE functions — the parts that don't need
// real canvas rasterization. jsdom has no layout engine or real font metrics,
// so fitScale/countRichLines are exercised against a fake, deterministic text
// measurer (constant width per character) rather than a real
// CanvasRenderingContext2D — that's enough to pin the monotonicity guarantee,
// which is what actually matters here, without needing a browser.
// The 12 pixel-layout functions themselves are NOT unit-tested (see the Post
// Builder plan's Testing section) — they draw to a real canvas, which jsdom
// doesn't rasterize, so a unit test could at best assert "some calls
// happened," which has little bug-catching value for a visual concern.
// Those get manual/browser pixel-parity verification instead.

import { describe, it, expect } from 'vitest'
import {
  fitScale, parseInlineBold, segmentsToWords, countRichLines, resolvePostTypeAlias,
  parseCsvRows, importRowToPatch, filterMeaningfulRows, csvRowTitle, slidePngFilename, postFilenameSlug,
  BULK_IMPORT_TEMPLATE_HEADERS, BULK_IMPORT_TEMPLATE_ROWS,
} from '../postBuilderCore'
import { snapshotSlide, applySlideToState } from '../postBuilderCore'
import { defaultPostState, defaultTextColors, SLIDE_KEYS, SLIDE_COLOR_KEYS } from '../../designStudioTypes'

// A minimal fake 2D context: constant-width-per-character text measurement,
// so line counts / heights are deterministic and font-independent.
function fakeCtx(): CanvasRenderingContext2D {
  const state = { font: '' }
  return {
    get font() { return state.font },
    set font(v: string) { state.font = v },
    measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
  } as unknown as CanvasRenderingContext2D
}

describe('fitScale', () => {
  const ctx = fakeCtx()
  const items = [
    { text: 'A fairly long headline that will wrap across more than one line at full size', weight: 800, baseSize: 40, lhRatio: 1.15, gapAfter: 8 },
    { text: 'A shorter sub-headline', weight: 500, baseSize: 20, lhRatio: 1.3, gapAfter: 6 },
  ]

  it('returns the requested textScale unchanged when everything already fits', () => {
    const scale = fitScale(ctx, items, 2000, 0, 5000, 0.3, 1)
    expect(scale).toBe(1)
  })

  it('never exceeds the available height once the content overflows at textScale=1', () => {
    const maxW = 220
    const available = 100
    const scale = fitScale(ctx, items, maxW, 0, available, 0.3, 1)
    expect(scale).toBeLessThan(1)
    expect(scale).toBeGreaterThanOrEqual(0.3)
  })

  it('is monotonic: a higher textScale slider value never yields a smaller rendered scale', () => {
    const maxW = 220
    const available = 260
    const scales = [0.5, 0.7, 0.85, 1, 1.3, 1.5].map(ts => fitScale(ctx, items, maxW, 0, available, 0.3, ts))
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1])
    }
  })

  it('respects minScale as a floor even when nothing fits', () => {
    const scale = fitScale(ctx, items, 40, 0, 10, 0.3, 1)
    expect(scale).toBeGreaterThanOrEqual(0.3)
  })
})

describe('parseInlineBold / segmentsToWords', () => {
  it('splits **word** markup into bold/non-bold segments', () => {
    const segs = parseInlineBold('Unify **Member Services** today')
    expect(segs).toEqual([
      { text: 'Unify ', bold: false },
      { text: 'Member Services', bold: true },
      { text: ' today', bold: false },
    ])
  })

  it('handles text with no bold markup', () => {
    expect(parseInlineBold('Plain text')).toEqual([{ text: 'Plain text', bold: false }])
  })

  it('carries the bold flag onto individual words after splitting on spaces', () => {
    const words = segmentsToWords(parseInlineBold('cut **integration time** by 70%'))
    expect(words).toEqual([
      { text: 'cut', bold: false },
      { text: 'integration', bold: true },
      { text: 'time', bold: true },
      { text: 'by', bold: false },
      { text: '70%', bold: false },
    ])
  })
})

describe('countRichLines', () => {
  const ctx = fakeCtx()
  it('returns 0 for empty text', () => {
    expect(countRichLines(ctx, '', 200, 20, 500, 800, 'sans-serif')).toBe(0)
  })
  it('wraps to more lines as maxW shrinks', () => {
    const text = 'This headline is long enough that it should wrap onto multiple lines'
    const wide = countRichLines(ctx, text, 1000, 20, 500, 800, 'sans-serif')
    const narrow = countRichLines(ctx, text, 100, 20, 500, 800, 'sans-serif')
    expect(narrow).toBeGreaterThan(wide)
  })
})

describe('carousel snapshot/apply round-trip', () => {
  it('snapshotSlide captures exactly the SLIDE_KEYS/SLIDE_COLOR_KEYS fields', () => {
    const state = { ...defaultPostState(), headline: 'My headline', tag: 'MY TAG_', bgRotate: 90 as const }
    const colors = { ...defaultTextColors(), headline: 'orange' as const }
    const slide = snapshotSlide(state, colors)
    SLIDE_KEYS.forEach(k => expect(slide[k]).toEqual(state[k]))
    SLIDE_COLOR_KEYS.forEach(k => expect(slide.colors[k]).toEqual(colors[k]))
    // Not part of the slide — shared across the whole carousel.
    expect('bgRotate' in slide).toBe(false)
  })

  it('applySlideToState restores exactly the fields a slide carries, leaving shared fields untouched', () => {
    const original = { ...defaultPostState(), bgRotate: 180 as const, iconOn: false }
    const colors = defaultTextColors()
    const slideA = snapshotSlide({ ...original, headline: 'Slide A headline', tag: 'A_' }, colors)

    // Simulate having since edited the live form to something else entirely.
    const editedState = { ...original, headline: 'Something the user typed after switching', tag: 'EDITED_' }
    const { state: restored, textColors: restoredColors } = applySlideToState(slideA, editedState, colors)

    expect(restored.headline).toBe('Slide A headline')
    expect(restored.tag).toBe('A_')
    // Shared/global fields are untouched by a slide restore.
    expect(restored.bgRotate).toBe(180)
    expect(restored.iconOn).toBe(false)
    expect(restoredColors).toEqual(colors)
  })
})

describe('CSV/XLSX row import', () => {
  it('resolves post type aliases case- and separator-insensitively', () => {
    expect(resolvePostTypeAlias('Case Study')).toBe('casestudy')
    expect(resolvePostTypeAlias('case_study')).toBe('casestudy')
    expect(resolvePostTypeAlias('Organic Post')).toBe('organic')
    expect(resolvePostTypeAlias('Advertisement')).toBe('ad')
    expect(resolvePostTypeAlias('Stats')).toBe('statistic')
    expect(resolvePostTypeAlias('not-a-real-type')).toBeNull()
  })

  it('parseCsvRows lowercases headers and filters out fully-empty rows', () => {
    const csv = 'Type,Headline,Sub\ncasestudy,Hello world,A subtitle\n,,\n'
    const rows = parseCsvRows(csv)
    expect(rows).toEqual([{ type: 'casestudy', headline: 'Hello world', sub: 'A subtitle' }])
  })

  it('filterMeaningfulRows drops rows where every value is blank', () => {
    expect(filterMeaningfulRows([{ a: '', b: '  ' }, { a: 'x', b: '' }])).toEqual([{ a: 'x', b: '' }])
  })

  it('csvRowTitle falls back through headline -> quote1 -> eventheadline -> eventname -> statnumber -> untitled', () => {
    expect(csvRowTitle({ headline: 'H' })).toBe('H')
    expect(csvRowTitle({ quote1: 'Q' })).toBe('Q')
    expect(csvRowTitle({ statnumber: '70%' })).toBe('70%')
    expect(csvRowTitle({})).toBe('(untitled row)')
  })

  it('importRowToPatch only applies a field group when its columns are present', () => {
    const generic = importRowToPatch({ headline: 'Hello', cta: 'Go' })
    expect(generic.fields.headline).toBe('Hello')
    expect(generic.fields.quote1).toBeUndefined()
    expect(generic.fields.eventHeadline).toBeUndefined()
    expect(generic.fields.statNumber).toBeUndefined()
  })

  it('importRowToPatch maps quote columns, defaulting quote1 from either quote1 or quote', () => {
    const patch = importRowToPatch({ quote: 'A great quote', name: 'Jane Doe', title: 'CTO' })
    expect(patch.fields.quote1).toBe('A great quote')
    expect(patch.fields.quoteName).toBe('Jane Doe')
    expect(patch.fields.quoteTitle).toBe('CTO')
  })

  it('importRowToPatch picks the lockup event sub-format only when lockup-only columns are present', () => {
    const icons = importRowToPatch({ eventdate: '12 May', eventtime: '10am', eventlocation: 'Hall A|Booth 4' })
    expect(icons.fields.eventFormat).toBe('icons')
    expect(icons.fields.eventLocation).toBe('Hall A\nBooth 4')

    const lockup = importRowToPatch({ eventname: 'Summit 2026', eventvenue: 'Convention Center' })
    expect(lockup.fields.eventFormat).toBe('lockup')
  })

  it('importRowToPatch turns on the second stat only when stat2 columns are present', () => {
    const oneStat = importRowToPatch({ statnumber: '70%', statlabel: 'faster' })
    expect(oneStat.fields.statTwoUp).toBe(false)
    const twoStats = importRowToPatch({ statnumber: '70%', statnumber2: '3x' })
    expect(twoStats.fields.statTwoUp).toBe(true)
  })

  it('importRowToPatch surfaces a trimmed background name, or none when the column is absent', () => {
    const withBg = importRowToPatch({ headline: 'Hello', background: '  Event gradient  ' })
    expect(withBg.backgroundName).toBe('Event gradient')
    const withoutBg = importRowToPatch({ headline: 'Hello' })
    expect(withoutBg.backgroundName).toBeUndefined()
  })
})

describe('bulk import template', () => {
  it('every template row only uses columns declared in the header list', () => {
    const headerSet = new Set<string>(BULK_IMPORT_TEMPLATE_HEADERS)
    BULK_IMPORT_TEMPLATE_ROWS.forEach(row => {
      Object.keys(row).forEach(col => expect(headerSet.has(col)).toBe(true))
    })
  })

  it('every template row resolves through importRowToPatch to its declared type', () => {
    BULK_IMPORT_TEMPLATE_ROWS.forEach(row => {
      const patch = importRowToPatch(row)
      expect(patch.type).toBe(resolvePostTypeAlias(row.type))
    })
  })

  it('covers every post type the tool supports', () => {
    const types = new Set(BULK_IMPORT_TEMPLATE_ROWS.map(r => resolvePostTypeAlias(r.type)))
    expect(types).toEqual(new Set(['organic', 'casestudy', 'ad', 'quote', 'event', 'statistic']))
  })
})

describe('export filename helpers', () => {
  it('postFilenameSlug slugifies and truncates', () => {
    expect(postFilenameSlug('How a Leading Business Association Uses WSO2', 'post')).toBe('how-a-leading-business-assoc')
  })
  it('postFilenameSlug falls back when text is empty', () => {
    expect(postFilenameSlug('', 'post')).toBe('post')
  })
  it('postFilenameSlug strips unsafe path/filename characters', () => {
    const slug = postFilenameSlug('Q3/Q4 Results: A "Win"\\Win', 'post')
    expect(slug).not.toMatch(/[/\\:"]/)
    expect(slug).toBe('q3-q4-results-a-win-win')
  })
  it('slidePngFilename nests under a format subdirectory when provided', () => {
    expect(slidePngFilename(0, 'hello')).toBe('wso2-slide-1-hello.png')
    expect(slidePngFilename(2, 'hello', 'square')).toBe('square/wso2-slide-3-hello.png')
  })
})
