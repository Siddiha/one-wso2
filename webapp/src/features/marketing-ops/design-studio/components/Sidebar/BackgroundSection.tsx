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

import { useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, IconButton, Link, Slider, Switch, Tooltip, Typography } from '@wso2/oxygen-ui'
import {
  XIcon, RotateCwIcon, FlipHorizontalIcon, ExternalLinkIcon, ImageIcon, PlusIcon, PencilIcon, Trash2Icon,
} from '@wso2/oxygen-ui-icons-react'
import { BRAND_KIT_URL } from '../postBuilderCore'
import type { PostState } from '../../designStudioTypes'
import type { BackgroundImageSummary } from '../../../api/useDesignStudio'
import { fetchBackgroundThumbnail } from '../../../api/useDesignStudio'
import { useAccessToken } from '@hooks/useAccessToken'
import { FieldLabel } from './shared'
import { BackgroundImageForm } from './BackgroundImageForm'

// A single library tile: lazy-loads its own thumbnail once it scrolls near the
// viewport, mirroring Email Workbench's TemplateLibrary.tsx Thumbnail component.
function LibraryTile({
  image, picking, onPick, onEdit, onDelete,
}: {
  image: BackgroundImageSummary
  // True while THIS tile's full-resolution image is being fetched (a separate,
  // uncached request from the thumbnail above) — the fetch can take a moment,
  // so the tile needs to show the click landed rather than look unresponsive.
  picking: boolean
  onPick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const getAccessToken = useAccessToken()
  const [url, setUrl] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let active = true
    fetchBackgroundThumbnail(image.id, getAccessToken).then(u => { if (active) setUrl(u) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id, visible])

  return (
    <Box
      ref={ref}
      role="button"
      tabIndex={picking ? -1 : 0}
      aria-label={`Use "${image.name}" as background`}
      aria-busy={picking}
      title={image.description || image.name}
      sx={{
        position: 'relative', height: 72, borderRadius: '8px', overflow: 'hidden',
        cursor: picking ? 'default' : 'pointer',
        border: '1px solid', borderColor: 'divider', bgcolor: 'background.default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        '&:hover .tile-actions, &:focus-within .tile-actions': { opacity: picking ? 0 : 1 },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
      }}
      onClick={picking ? undefined : onPick}
      onKeyDown={e => {
        if (picking) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick() }
      }}
    >
      {url
        ? <Box component="img" src={url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: picking ? 0.5 : 1 }} />
        : <Box sx={{ display: 'flex', color: 'text.disabled', opacity: picking ? 0.5 : 1 }}><ImageIcon size={18} /></Box>}
      {picking && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={20} />
        </Box>
      )}
      <Box
        className="tile-actions"
        sx={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 0.25, opacity: 0, transition: 'opacity .1s' }}
      >
        <IconButton size="small" aria-label={`Edit "${image.name}"`} onClick={e => { e.stopPropagation(); onEdit() }} sx={{ bgcolor: 'background.paper', p: 0.25 }}>
          <PencilIcon size={12} />
        </IconButton>
        <IconButton size="small" aria-label={`Delete "${image.name}"`} onClick={e => { e.stopPropagation(); onDelete() }} sx={{ bgcolor: 'background.paper', p: 0.25 }}>
          <Trash2Icon size={12} />
        </IconButton>
      </Box>
    </Box>
  )
}

export function BackgroundSection({
  state, carouselOn, slideCount, libraryImages, libraryLimit,
  onBgImageFile, onClearBgImage, onOverlayChange, onRotate, onToggleFlip, onSpanToggle,
  pickingLibraryImageId, onPickLibraryImage, onSaveLibraryImage, onDeleteLibraryImage,
}: {
  state: PostState
  carouselOn: boolean
  slideCount: number
  libraryImages: BackgroundImageSummary[]
  libraryLimit: number
  onBgImageFile: (file: File) => void
  onClearBgImage: () => void
  onOverlayChange: (v: number) => void
  onRotate: (delta: number) => void
  onToggleFlip: (key: 'bgFlipH' | 'bgFlipV') => void
  onSpanToggle: (on: boolean) => void
  // Id of the library image currently being fetched at full resolution, or
  // null — see LibraryTile's `picking` prop.
  pickingLibraryImageId: string | null
  onPickLibraryImage: (id: string) => void
  onSaveLibraryImage: (mode: 'new' | 'edit', id: string | undefined, data: { file?: File; name: string; description: string }) => Promise<void>
  onDeleteLibraryImage: (id: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'library' | 'brand'>('library')
  const fileRef = useRef<HTMLInputElement>(null)
  const preview = state.bgImage instanceof HTMLImageElement ? state.bgImage.src : null

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'new' | 'edit'>('new')
  const [formTarget, setFormTarget] = useState<BackgroundImageSummary | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<BackgroundImageSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const atLimit = libraryImages.length >= libraryLimit

  function openNewForm() { setFormMode('new'); setFormTarget(undefined); setFormOpen(true) }
  function openEditForm(img: BackgroundImageSummary) { setFormMode('edit'); setFormTarget(img); setFormOpen(true) }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await onDeleteLibraryImage(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Already surfaced via a toast by the caller — keep the confirm dialog
      // open (with `deleting` cleared below) so the user can retry.
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Box sx={{ mb: 2.5 }}>
      <FieldLabel>Background</FieldLabel>

      {/* Current image — a read-only preview, always visible regardless of where it
          came from (direct upload, Library pick, ...), so rotate/flip stay reachable
          no matter which source tab is open below. Adding a background happens only
          via the "Add background" options underneath — this box no longer opens the
          file picker on click. */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, height: 84, mb: 1,
          borderRadius: '8px', border: '1px dashed', borderColor: 'divider', bgcolor: 'background.default',
          overflow: 'hidden', position: 'relative',
        }}
      >
        {preview ? (
          <Box component="img" src={preview} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, color: 'text.disabled' }}>
            <ImageIcon size={22} />
            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>Select a background to preview</Typography>
          </Box>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onBgImageFile(f); e.target.value = '' }} />
        {preview && (
          <IconButton size="small" onClick={onClearBgImage}
            sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper' }}>
            <XIcon size={14} />
          </IconButton>
        )}
      </Box>

      {preview && (
        <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
          <Button size="small" variant="outlined" startIcon={<RotateCwIcon size={16} />}
            onClick={() => onRotate(90)} sx={{ textTransform: 'none', fontSize: '0.7rem' }}>Rotate</Button>
          <Button size="small" variant="outlined" startIcon={<FlipHorizontalIcon size={16} />}
            onClick={() => onToggleFlip('bgFlipH')} sx={{ textTransform: 'none', fontSize: '0.7rem', color: state.bgFlipH ? 'primary.main' : undefined }}>
            Flip H
          </Button>
          <Button size="small" variant="outlined" startIcon={<FlipHorizontalIcon size={16} style={{ transform: 'rotate(90deg)' }} />}
            onClick={() => onToggleFlip('bgFlipV')} sx={{ textTransform: 'none', fontSize: '0.7rem', color: state.bgFlipV ? 'primary.main' : undefined }}>
            Flip V
          </Button>
        </Box>
      )}

      <FieldLabel>Add background</FieldLabel>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
        {(['library', 'brand'] as const).map(t => (
          <Box
            key={t} component="button" type="button" onClick={() => setTab(t)}
            sx={{
              flex: 1, py: 0.6, borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600,
              border: '1px solid', borderColor: tab === t ? 'primary.main' : 'divider',
              bgcolor: tab === t ? 'action.selected' : 'background.default',
              color: tab === t ? 'primary.main' : 'text.secondary',
            }}
          >
            {t === 'library' ? 'Library' : 'Brand Kit'}
          </Box>
        ))}
        <Box
          component="button" type="button" onClick={() => fileRef.current?.click()}
          sx={{
            flex: 1, py: 0.6, borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600,
            border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', color: 'text.secondary',
          }}
        >
          Upload
        </Box>
      </Box>

      {tab === 'library' && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>{libraryImages.length} / {libraryLimit} used</Typography>
            <Tooltip title={atLimit ? 'Library full — delete an image to add another' : ''}>
              <span>
                <Button size="small" startIcon={<PlusIcon size={16} />} onClick={openNewForm} disabled={atLimit}
                  sx={{ textTransform: 'none', fontSize: '0.7rem', fontWeight: 700 }}>
                  Add to library
                </Button>
              </span>
            </Tooltip>
          </Box>

          {libraryImages.length === 0 ? (
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
              No shared background images yet. Add one to reuse it across posts.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
              {libraryImages.map(img => (
                <LibraryTile
                  key={img.id} image={img}
                  picking={pickingLibraryImageId === img.id}
                  onPick={() => onPickLibraryImage(img.id)}
                  onEdit={() => openEditForm(img)}
                  onDelete={() => setDeleteTarget(img)}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {tab === 'brand' && (
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', mb: 1 }}>
            Approved backgrounds, photography, and textures live in the shared Brand Kit.
          </Typography>
          <Link href={BRAND_KIT_URL} target="_blank" rel="noopener noreferrer"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.76rem', fontWeight: 700, color: 'primary.main' }}>
            Open Drive folder <ExternalLinkIcon size={14} />
          </Link>
        </Box>
      )}

      <Box sx={{ mb: carouselOn && slideCount > 1 ? 1.5 : 0 }}>
        <FieldLabel>Overlay opacity</FieldLabel>
        <Slider size="small" min={0} max={90} value={state.overlayOpacity}
          onChange={(_, v) => onOverlayChange(v as number)} valueLabelDisplay="auto" valueLabelFormat={v => `${v}%`} />
      </Box>

      {carouselOn && slideCount > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>Span image across slides</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>Splits one panorama across all slides instead of repeating it.</Typography>
          </Box>
          <Switch size="small" checked={state.bgSpanSlides} onChange={e => onSpanToggle(e.target.checked)} />
        </Box>
      )}

      <BackgroundImageForm
        open={formOpen}
        mode={formMode}
        initial={formTarget}
        disabled={formMode === 'new' && atLimit}
        onClose={() => setFormOpen(false)}
        onSubmit={data => onSaveLibraryImage(formMode, formTarget?.id, data)}
      />

      <Dialog open={!!deleteTarget} onClose={deleting ? undefined : () => setDeleteTarget(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <Box sx={{ p: 3 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, mb: 1 }}>Delete this image?</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
            "{deleteTarget?.name}" will be removed from the shared library for everyone. This can't be undone.
          </Typography>
        </Box>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting} sx={{ textTransform: 'none', color: 'text.secondary' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
