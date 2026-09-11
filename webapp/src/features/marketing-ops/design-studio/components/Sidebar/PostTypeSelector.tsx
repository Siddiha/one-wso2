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

import { Box, Switch, Typography, IconButton } from '@wso2/oxygen-ui'
import { XIcon, PlusIcon } from '@wso2/oxygen-ui-icons-react'
import { POST_TYPE_OPTS, slideLabel } from '../postBuilderCore'
import type { PostType, Slide } from '../../designStudioTypes'
import { FieldLabel } from './shared'

export function PostTypeSelector({
  type, onTypeChange, carouselOn, onCarouselToggle, slides, activeSlideIdx, onSwitchSlide, onAddSlide, onRemoveSlide,
}: {
  type: PostType
  onTypeChange: (t: PostType) => void
  carouselOn: boolean
  onCarouselToggle: (on: boolean) => void
  slides: Slide[]
  activeSlideIdx: number
  onSwitchSlide: (i: number) => void
  onAddSlide: () => void
  onRemoveSlide: (i: number) => void
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <FieldLabel>Post type</FieldLabel>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, mb: 1.5 }}>
        {POST_TYPE_OPTS.map(opt => (
          <Box
            key={opt.id} component="button" type="button" onClick={() => onTypeChange(opt.id)}
            sx={{
              py: 1, px: 0.5, borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: type === opt.id ? 700 : 500,
              border: '1px solid', borderColor: type === opt.id ? 'primary.main' : 'divider',
              bgcolor: type === opt.id ? 'action.selected' : 'background.default',
              color: type === opt.id ? 'primary.main' : 'text.secondary',
            }}
          >
            {opt.label}
          </Box>
        ))}
      </Box>

      {(type === 'organic' || type === 'casestudy' || type === 'ad' || type === 'statistic') && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>Carousel (multi-slide)</Typography>
            <Switch size="small" checked={carouselOn} onChange={e => onCarouselToggle(e.target.checked)} />
          </Box>

          {carouselOn && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
                {slides.map((slide, i) => (
                  <Box
                    key={i}
                    role="button"
                    tabIndex={0}
                    aria-current={i === activeSlideIdx}
                    onClick={() => onSwitchSlide(i)}
                    // Can't become a <button> (component="button") — it nests
                    // the "remove slide" IconButton below, and interactive
                    // elements can't nest. The target check keeps Enter/Space
                    // on that nested button from also switching the slide.
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSwitchSlide(i) }
                    }}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                      px: 1, py: 0.5, borderRadius: '6px', fontSize: '0.68rem',
                      border: '1px solid', borderColor: i === activeSlideIdx ? 'primary.main' : 'divider',
                      bgcolor: i === activeSlideIdx ? 'action.selected' : 'background.default',
                      color: i === activeSlideIdx ? 'primary.main' : 'text.secondary',
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
                    }}
                  >
                    <span>{i + 1}. {slideLabel(slide)}</span>
                    {slides.length > 1 && (
                      <IconButton
                        size="small" sx={{ p: 0.1 }}
                        onClick={e => { e.stopPropagation(); onRemoveSlide(i) }}
                        aria-label="Remove slide"
                      >
                        <XIcon size={12} />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Box>
              <Box
                component="button" type="button" onClick={onAddSlide} disabled={slides.length >= 10}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.7rem', fontWeight: 600,
                  cursor: slides.length >= 10 ? 'default' : 'pointer', color: slides.length >= 10 ? 'text.disabled' : 'primary.main',
                  border: '1px dashed', borderColor: 'divider', borderRadius: '6px', px: 1, py: 0.5, bgcolor: 'transparent',
                }}
              >
                <PlusIcon size={14} /> Add slide
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
