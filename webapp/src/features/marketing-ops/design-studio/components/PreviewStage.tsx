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

// The preview panel: format tabs, zoom controls, the canvas itself, and a
// dimension readout. The canvas's internal pixel buffer (width/height
// attributes) is owned by the editor — it's always sized to the full export
// resolution, set inside postBuilderCore.draw(). This component only ever
// touches the canvas element's CSS style (style.width/height), scaling how
// it's *displayed* — exactly the source tool's zoom model, which keeps
// on-screen zoom completely decoupled from export resolution.

import { useEffect, useRef, useState } from 'react'
import { Box, Button, IconButton, Typography } from '@wso2/oxygen-ui'
import { ZoomInIcon, ZoomOutIcon, MaximizeIcon, BadgeCheckIcon } from '@wso2/oxygen-ui-icons-react'
import type { PostFormat } from '../designStudioTypes'

const ZOOM_STEPS = [25, 33, 50, 67, 75, 100, 125, 150, 200, 250, 300]

export function PreviewStage({ canvasRef, canvasW, canvasH, format, onFormatChange }: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  canvasW: number
  canvasH: number
  format: PostFormat
  onFormatChange: (f: PostFormat) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0)
  const [isFit, setIsFit] = useState(true)

  function applySize(scale: number) {
    const canvas = canvasRef.current, wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dw = Math.round(canvasW * scale), dh = Math.round(canvasH * scale)
    canvas.style.width = `${dw}px`; canvas.style.height = `${dh}px`
    wrap.style.width = `${dw}px`; wrap.style.height = `${dh}px`
  }

  function applyFit() {
    const stage = stageRef.current
    if (!stage) return
    const scale = Math.min((stage.clientWidth - 48) / canvasW, (stage.clientHeight - 48) / canvasH, 1)
    applySize(scale)
    setZoom(Math.round(scale * 100))
  }

  useEffect(() => {
    if (isFit) applyFit()
    else applySize(zoom / 100)
    // Re-runs whenever the format/size changes, zoom changes, or fit is
    // (re-)enabled — matches the source tool's setFormat()/zoomFit() calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH, isFit, zoom])

  useEffect(() => {
    function onResize() { if (isFit) applyFit() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFit, canvasW, canvasH])

  function zoomFit() { setIsFit(true) }
  function zoom100() { setIsFit(false); setZoom(100) }
  function zoomIn() { setIsFit(false); setZoom(z => ZOOM_STEPS.find(x => x > z) ?? 300) }
  function zoomOut() { setIsFit(false); setZoom(z => [...ZOOM_STEPS].reverse().find(x => x < z) ?? 25) }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: '10px', overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(['square', 'banner'] as const).map(f => (
            <Box
              key={f} component="button" type="button" onClick={() => onFormatChange(f)}
              sx={{
                px: 1.5, py: 0.5, borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '0.72rem', fontWeight: format === f ? 700 : 500,
                border: '1px solid', borderColor: format === f ? 'primary.main' : 'divider',
                bgcolor: format === f ? 'action.selected' : 'transparent',
                color: format === f ? 'primary.main' : 'text.secondary',
              }}
            >
              {f === 'square' ? 'Square' : 'Banner'}
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" onClick={zoomOut} aria-label="Zoom out"><ZoomOutIcon size={18} /></IconButton>
          <Typography sx={{ fontSize: '0.72rem', minWidth: 34, textAlign: 'center', color: 'text.secondary' }}>
            {isFit ? 'Fit' : `${zoom}%`}
          </Typography>
          <IconButton size="small" onClick={zoomIn} aria-label="Zoom in"><ZoomInIcon size={18} /></IconButton>
          <IconButton size="small" onClick={zoomFit} aria-label="Fit to window" sx={{ color: isFit ? 'primary.main' : undefined }}>
            <MaximizeIcon size={18} />
          </IconButton>
          <Button size="small" onClick={zoom100} sx={{ textTransform: 'none', fontSize: '0.68rem', minWidth: 0, color: 'text.secondary' }}>100%</Button>
        </Box>
      </Box>

      <Box ref={stageRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
        <Box ref={wrapRef}>
          <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 4 }} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
          {canvasW} × {canvasH} px · {format === 'square' ? 'LinkedIn Square' : 'LinkedIn Banner'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
          <BadgeCheckIcon size={14} />
          <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>Brand compliant</Typography>
        </Box>
      </Box>
    </Box>
  )
}
