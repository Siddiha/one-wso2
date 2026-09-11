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

// Tag / headline / sub / body / CTA — the fields shared by Organic Post,
// Case Study, Ad, and Statistic. Visibility per field mirrors the source
// tool's showFieldsForType() exactly:
//   - tag:      casestudy, statistic
//   - headline/sub/body: organic, casestudy, ad
//   - cta:      casestudy, ad, statistic

import { useMemo, useRef } from 'react'
import { Box, Button, OutlinedInput, Slider, Typography } from '@wso2/oxygen-ui'
import { XIcon } from '@wso2/oxygen-ui-icons-react'
import { imageToDataURL } from '../postBuilderCore'
import type { PostState, TextColors } from '../../designStudioTypes'
import { FieldLabel, ColorChipRow, HeadlineWeightSelector } from './shared'

const inputSx = { fontSize: '0.82rem', bgcolor: 'background.default', '& fieldset': { borderColor: 'divider' } }

export function ContentFields({
  state, textColors, onField, onColorField, onTextScale, onCustomerLogoFile, onClearCustomerLogo,
}: {
  state: PostState
  textColors: TextColors
  onField: (patch: Partial<PostState>) => void
  onColorField: (field: keyof TextColors, color: TextColors[keyof TextColors]) => void
  onTextScale: (scale: number) => void
  onCustomerLogoFile: (file: File) => void
  onClearCustomerLogo: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  // Memoized: customerLogo can be an HTMLCanvasElement (recolorToWhite's offscreen
  // canvas), so imageToDataURL() calls canvas.toDataURL() — a real re-encode that
  // shouldn't rerun on every keystroke in an unrelated sidebar field.
  const customerLogoPreview = useMemo(() => state.customerLogo ? imageToDataURL(state.customerLogo) : null, [state.customerLogo])
  const showTag = state.type === 'casestudy' || state.type === 'statistic'
  const showHeadlineGroup = state.type === 'organic' || state.type === 'casestudy' || state.type === 'ad'
  const showCta = state.type === 'casestudy' || state.type === 'ad' || state.type === 'statistic'

  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Text size</FieldLabel>
        <Slider size="small" min={60} max={150} value={Math.round(state.textScale * 100)}
          onChange={(_, v) => onTextScale(v as number)}
          valueLabelDisplay="auto" valueLabelFormat={v => `${v}%`} />
      </Box>

      {showTag && (
        <Box sx={{ mb: 1.5 }}>
          <FieldLabel>Tag</FieldLabel>
          <OutlinedInput fullWidth size="small" value={state.tag} placeholder="CASE STUDY_"
            disabled={!!state.customerLogo}
            onChange={e => onField({ tag: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
          <ColorChipRow value={textColors.tag} onChange={c => onColorField('tag', c)} />
          <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', mt: 0.75, mb: 0.5 }}>
            Or show a customer logo instead of the tag text:
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {customerLogoPreview && (
              <Box component="img" src={customerLogoPreview} alt="" sx={{ height: 24, filter: 'invert(1)', bgcolor: '#0D1B2E', borderRadius: '4px', p: 0.5 }} />
            )}
            <input ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) onCustomerLogoFile(f); e.target.value = '' }} />
            <Button size="small" variant="outlined" onClick={() => fileRef.current?.click()} sx={{ textTransform: 'none' }}>
              {customerLogoPreview ? 'Replace logo' : 'Upload logo'}
            </Button>
            {customerLogoPreview && (
              <Button size="small" onClick={onClearCustomerLogo} startIcon={<XIcon size={14} />} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                Remove
              </Button>
            )}
          </Box>
        </Box>
      )}

      {showHeadlineGroup && (
        <>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Headline</FieldLabel>
            <OutlinedInput fullWidth size="small" multiline minRows={2} value={state.headline}
              placeholder="Use **word** for bold" onChange={e => onField({ headline: e.target.value })}
              sx={{ ...inputSx, mb: 0.75 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flex: 1 }}>
                <HeadlineWeightSelector value={state.headlineWeight} onChange={w => onField({ headlineWeight: w })} />
              </Box>
              <ColorChipRow value={textColors.headline} onChange={c => onColorField('headline', c)} />
            </Box>
          </Box>

          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Sub-headline</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.sub}
              onChange={e => onField({ sub: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
            <ColorChipRow value={textColors.sub} onChange={c => onColorField('sub', c)} />
          </Box>

          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Body</FieldLabel>
            <OutlinedInput fullWidth size="small" multiline minRows={2} value={state.body}
              placeholder="Optional detail…" onChange={e => onField({ body: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
            <ColorChipRow value={textColors.body} onChange={c => onColorField('body', c)} />
          </Box>
        </>
      )}

      {showCta && (
        <Box sx={{ mb: 1.5 }}>
          <FieldLabel>CTA</FieldLabel>
          <OutlinedInput fullWidth size="small" value={state.cta}
            onChange={e => onField({ cta: e.target.value })} sx={inputSx} />
        </Box>
      )}

      {!showTag && !showHeadlineGroup && !showCta && (
        <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
          This post type's fields are below.
        </Typography>
      )}
    </Box>
  )
}
