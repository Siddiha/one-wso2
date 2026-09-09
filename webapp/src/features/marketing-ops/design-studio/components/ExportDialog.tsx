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

import { useState } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, FormControlLabel, Typography } from '@wso2/oxygen-ui'
import { DownloadIcon, CopyIcon, FolderArchiveIcon } from '@wso2/oxygen-ui-icons-react'
import type { PostFormat } from '../designStudioTypes'

export function ExportDialog({ open, onClose, carouselOn, onDownloadPost, onCopyImage, onDownloadAllSlides, onDownloadBatch }: {
  open: boolean
  onClose: () => void
  carouselOn: boolean
  onDownloadPost: () => void
  onCopyImage: () => void
  onDownloadAllSlides: () => void
  onDownloadBatch: (formats: PostFormat[]) => void
}) {
  const [square, setSquare] = useState(true)
  const [banner, setBanner] = useState(false)

  function runBatch() {
    const formats: PostFormat[] = []
    if (square) formats.push('square')
    if (banner) formats.push('banner')
    if (formats.length) onDownloadBatch(formats)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 800, mb: 2 }}>Export</Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button variant="contained" startIcon={<DownloadIcon size={18} />} onClick={onDownloadPost}
            sx={{ textTransform: 'none', fontWeight: 700, flex: 1, boxShadow: 'none' }}>
            Download PNG
          </Button>
          <Button variant="outlined" startIcon={<CopyIcon size={16} />} onClick={onCopyImage}
            sx={{ textTransform: 'none', fontWeight: 700, flex: 1 }}>
            Copy
          </Button>
        </Box>

        {carouselOn && (
          <Button variant="outlined" fullWidth startIcon={<FolderArchiveIcon size={16} />} onClick={onDownloadAllSlides}
            sx={{ textTransform: 'none', fontWeight: 700, mb: 2.5 }}>
            All slides (.zip)
          </Button>
        )}

        <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.75 }}>
          Export multiple formats at once
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
          <FormControlLabel
            control={<Checkbox size="small" checked={square} onChange={e => setSquare(e.target.checked)} />}
            label={<Typography sx={{ fontSize: '0.78rem' }}>Square</Typography>} />
          <FormControlLabel
            control={<Checkbox size="small" checked={banner} onChange={e => setBanner(e.target.checked)} />}
            label={<Typography sx={{ fontSize: '0.78rem' }}>Banner</Typography>} />
        </Box>
        <Button variant="outlined" fullWidth onClick={runBatch} disabled={!square && !banner} sx={{ textTransform: 'none', fontWeight: 700 }}>
          Export formats
        </Button>
      </Box>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', color: 'text.secondary' }}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
