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

// The dominant Post Builder component — owns nearly all state, the canvas ref,
// autosave, and the single-slot toast-undo mechanism. PostState is a plain,
// JSON-serializable object (aside from three HTMLImageElement/HTMLCanvasElement
// fields), so it lives directly in useState — React's own state-then-effect
// cycle IS the render pipeline (one effect redraws the canvas whenever
// state/textColors change), with no separate imperative render() call needed.
//
// Undo here is intentionally NOT a multi-level undo/redo stack: the source tool only
// ever calls pushUndo() for three destructive actions (clear customer logo, clear
// background image, remove a carousel slide) — text-field edits are never snapshotted.
// Porting a bigger undo system than the source actually has would be invented
// complexity, not parity.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Snackbar, Alert } from '@wso2/oxygen-ui'
import { DownloadIcon } from '@wso2/oxygen-ui-icons-react'
import JSZip from 'jszip'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'

import {
  defaultPostState, defaultTextColors, TYPE_PLACEHOLDERS,
  type PostState, type TextColors, type PostType, type PostFormat, type Slide, type ProjectFile, type IconColor, type LogoColor, type LogoPos,
} from '../designStudioTypes'
import {
  draw, validateImageFile, recolorToWhite, serializeProject, deserializeProject,
  snapshotSlide, applySlideToState, postFilenameSlug, slidePngFilename, loadImageFromDataURL,
  importRowToPatch, csvRowTitle, type ImportedRowPatch,
} from './postBuilderCore'
import {
  useBackgroundImages, useUploadBackgroundImage, useUpdateBackgroundImage, useDeleteBackgroundImage,
  fetchBackgroundImage, type BackgroundImageSummary,
} from '../../api/useDesignStudio'
import { useAccessToken } from '@hooks/useAccessToken'
import { describeError } from '@api/errors'
import { PostTypeSelector } from './Sidebar/PostTypeSelector'
import { ContentFields } from './Sidebar/ContentFields'
import { QuoteFields } from './Sidebar/QuoteFields'
import { EventFields } from './Sidebar/EventFields'
import { StatisticFields } from './Sidebar/StatisticFields'
import { LogoIconSection } from './Sidebar/LogoIconSection'
import { BackgroundSection } from './Sidebar/BackgroundSection'
import { BulkImportPanel } from './Sidebar/BulkImportPanel'
import { ProjectActions } from './Sidebar/ProjectActions'
import { PreviewStage } from './PreviewStage'
import { ExportDialog } from './ExportDialog'

const AUTOSAVE_KEY = 'postbuilder-autosave-v1'

function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Couldn't read that file. Please try again."))
    reader.onload = ev => {
      const img = new Image()
      img.onerror = () => reject(new Error(`"${file.name}" couldn't be loaded as an image.`))
      img.onload = () => resolve(img)
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Couldn't read that file. Please try again."))
    reader.onload = ev => resolve(ev.target?.result as string)
    reader.readAsDataURL(file)
  })
}

export function PostBuilderEditor() {
  const [state, setState] = useState<PostState>(defaultPostState)
  const [textColors, setTextColors] = useState<TextColors>(defaultTextColors)
  const [carouselOn, setCarouselOn] = useState(false)
  const [slides, setSlides] = useState<Slide[]>([])
  const [activeSlideIdx, setActiveSlideIdx] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  // Which library tile's full-resolution image is currently being fetched —
  // that request can take a moment (unlike the thumbnail, it's never
  // pre-warmed), so BackgroundSection needs this to show the tile isn't just
  // ignoring the click.
  const [pickingLibraryImageId, setPickingLibraryImageId] = useState<string | null>(null)
  const pickingLibraryImageIdRef = useRef<string | null>(null)

  const getAccessToken = useAccessToken()
  // Shared background-image library (DB-backed, not localStorage) — a TanStack
  // Query, refreshed automatically after any upload/edit/delete (the mutations
  // below invalidate its query key on success).
  const backgroundImagesQuery = useBackgroundImages()
  const libraryImages = backgroundImagesQuery.data?.images ?? []
  const libraryLimit = backgroundImagesQuery.data?.limit ?? 20
  const uploadBackgroundImage = useUploadBackgroundImage()
  const updateBackgroundImage = useUpdateBackgroundImage()
  const deleteBackgroundImage = useDeleteBackgroundImage()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastUndoRef = useRef<{ label: string; undo: () => void } | null>(null)
  // Mirrors of state/textColors kept current across renders, so undo callbacks created
  // in an earlier render (e.g. removeSlide's) can rebuild from the LATEST values instead
  // of the stale ones they closed over — otherwise a shared-field edit made between the
  // destructive action and clicking "Undo" would be silently discarded.
  const stateRef = useRef(state)
  const textColorsRef = useRef(textColors)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { textColorsRef.current = textColors }, [textColors])
  const [undoToast, setUndoToast] = useState<string | null>(null)
  const [infoToast, setInfoToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null)
  const [recovery, setRecovery] = useState<{ proj: ProjectFile; whenLabel: string } | null>(null)

  const carouselInfo = useMemo(
    () => ({ on: carouselOn, slideCount: slides.length, activeIdx: activeSlideIdx }),
    [carouselOn, slides.length, activeSlideIdx],
  )

  // Redraw whenever anything visible changes — React's state-then-effect cycle IS
  // the render pipeline here (no separate imperative render() call to remember).
  // Debounced: draw() runs several 15-iteration text-fit binary searches, so
  // redrawing synchronously on every keystroke causes visible input lag.
  useEffect(() => {
    const id = setTimeout(() => {
      if (canvasRef.current) draw(canvasRef.current, state, textColors, carouselInfo)
    }, 120)
    return () => clearTimeout(id)
  }, [state, textColors, carouselInfo])

  // Never throws into the UI: a failed library load surfaces its own toast
  // rather than an unhandled error, and (since onSaveLibraryImage awaits its
  // own mutation, not this query) rather than making a successful save look
  // like it failed just because the library is momentarily unreachable.
  useEffect(() => {
    if (backgroundImagesQuery.isError) {
      setInfoToast({ message: "Couldn't load the background library.", severity: 'error' })
    }
  }, [backgroundImagesQuery.isError])

  // ---- Autosave (localStorage), debounced 800ms — matches the source tool exactly ----
  useEffect(() => {
    // Don't clobber the recoverable snapshot with the current (still-default,
    // pre-restore) state before the user has answered the recovery prompt.
    if (recovery) return
    const timer = window.setTimeout(() => {
      try {
        const proj = serializeProject(state, textColors, carouselOn, currentSlidesSnapshot(), activeSlideIdx)
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(proj))
      } catch (err) {
        // Most likely a quota error from a very large embedded background image —
        // non-fatal, the user's in-session work is unaffected.
        console.warn('Autosave failed (continuing without it):', err)
      }
    }, 800)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, textColors, carouselOn, slides, activeSlideIdx, recovery])

  // ---- Autosave recovery, checked once on mount ----
  useEffect(() => {
    let raw: string | null = null
    try { raw = localStorage.getItem(AUTOSAVE_KEY) } catch { return }
    if (!raw) return
    try {
      const proj = JSON.parse(raw) as ProjectFile
      const when = proj.savedAt ? new Date(proj.savedAt) : null
      setRecovery({ proj, whenLabel: when ? when.toLocaleString() : 'a previous session' })
    } catch {
      try { localStorage.removeItem(AUTOSAVE_KEY) } catch { /* non-fatal */ }
    }
  }, [])

  function currentSlidesSnapshot(): Slide[] {
    if (!carouselOn || !slides.length) return slides
    const copy = [...slides]
    copy[activeSlideIdx] = snapshotSlide(state, textColors)
    return copy
  }

  function pushUndo(label: string, undo: () => void) {
    lastUndoRef.current = { label, undo }
    setUndoToast(label)
  }
  function performUndo() {
    lastUndoRef.current?.undo()
    lastUndoRef.current = null
    setUndoToast(null)
  }

  function onField(patch: Partial<PostState>) { setState(s => ({ ...s, ...patch })) }
  function onColorField(field: keyof TextColors, color: TextColors[keyof TextColors]) {
    setTextColors(c => ({ ...c, [field]: color }))
  }

  function setType(t: PostType) {
    setState(s => {
      if (t === 'quote' || t === 'event') return { ...s, type: t }
      if (t === 'statistic') return { ...s, type: t, tag: 'BY THE NUMBERS_', cta: 'Learn More' }
      const p = TYPE_PLACEHOLDERS[t]
      return { ...s, type: t, tag: p.tag, headline: p.headline, sub: p.sub, body: p.body, cta: p.cta }
    })
  }

  function setFormat(fmt: PostFormat) {
    setState(s => ({ ...s, format: fmt, canvasW: fmt === 'square' ? 1080 : 1200, canvasH: fmt === 'square' ? 1080 : 628 }))
  }

  // ---- Image uploads ----
  async function onCustomerLogoFile(file: File) {
    const err = validateImageFile(file)
    if (err) { setInfoToast({ message: err, severity: 'error' }); return }
    try {
      const img = await loadImageFile(file)
      setState(s => ({ ...s, customerLogo: recolorToWhite(img) }))
    } catch (e) { setInfoToast({ message: (e as Error).message, severity: 'error' }) }
  }
  function onClearCustomerLogo() {
    const removed = state.customerLogo
    setState(s => ({ ...s, customerLogo: null }))
    if (removed) pushUndo('Customer logo removed.', () => setState(s => ({ ...s, customerLogo: removed })))
  }

  async function onPartnerLogoFile(file: File) {
    const err = validateImageFile(file)
    if (err) { setInfoToast({ message: err, severity: 'error' }); return }
    try {
      const img = await loadImageFile(file)
      setState(s => ({ ...s, partnerLogo: recolorToWhite(img) }))
    } catch (e) { setInfoToast({ message: (e as Error).message, severity: 'error' }) }
  }
  function onClearPartnerLogo() {
    const removed = state.partnerLogo
    setState(s => ({ ...s, partnerLogo: null }))
    if (removed) pushUndo('Partner logo removed.', () => setState(s => ({ ...s, partnerLogo: removed })))
  }

  async function onBgImageFile(file: File) {
    const err = validateImageFile(file)
    if (err) { setInfoToast({ message: err, severity: 'error' }); return }
    try {
      const img = await loadImageFile(file)
      setState(s => ({ ...s, bgImage: img, bgRotate: 0, bgFlipH: false, bgFlipV: false }))
    } catch (e) { setInfoToast({ message: (e as Error).message, severity: 'error' }) }
  }
  function onClearBgImage() {
    const removed = { img: state.bgImage, rotate: state.bgRotate, flipH: state.bgFlipH, flipV: state.bgFlipV }
    setState(s => ({ ...s, bgImage: null, bgRotate: 0, bgFlipH: false, bgFlipV: false }))
    if (removed.img) pushUndo('Background image removed.', () => setState(s => ({
      ...s, bgImage: removed.img, bgRotate: removed.rotate, bgFlipH: removed.flipH, bgFlipV: removed.flipV,
    })))
  }

  function onRotate(delta: number) { setState(s => ({ ...s, bgRotate: (((s.bgRotate + delta) % 360 + 360) % 360) as 0 | 90 | 180 | 270 })) }
  function onToggleFlip(key: 'bgFlipH' | 'bgFlipV') { setState(s => ({ ...s, [key]: !s[key] })) }

  // ---- Shared background-image library ----
  async function onSaveLibraryImage(
    mode: 'new' | 'edit', id: string | undefined, data: { file?: File; name: string; description: string },
  ) {
    try {
      if (mode === 'new') {
        if (!data.file) return
        const err = validateImageFile(data.file)
        if (err) { setInfoToast({ message: err, severity: 'error' }); return }
        const dataUrl = await fileToDataURL(data.file)
        await uploadBackgroundImage.mutateAsync({ name: data.name, description: data.description || null, imageDataUrl: dataUrl })
      } else if (id) {
        await updateBackgroundImage.mutateAsync({ id, name: data.name, description: data.description || null })
      }
    } catch (e) {
      // Rethrow so BackgroundImageForm's submit keeps the dialog open (with the
      // entered name/description intact) instead of closing on a failed save —
      // most relevant for a 409 duplicate name, which the user can fix inline.
      setInfoToast({ message: describeError(e), severity: 'error' })
      throw e
    }
  }
  async function onPickLibraryImage(id: string) {
    // Serialize library picks: without this, selecting image A and then B
    // before A's fetch resolves lets A's completion apply AFTER B's, silently
    // reverting the user's later choice. pickingLibraryImageIdRef (unlike the
    // state var) is readable synchronously, so a second click landing before
    // the first render commits still sees the in-flight pick and bails.
    if (pickingLibraryImageIdRef.current) return
    pickingLibraryImageIdRef.current = id
    setPickingLibraryImageId(id)
    try {
      const url = await fetchBackgroundImage(id, getAccessToken)
      if (!url) { setInfoToast({ message: "Couldn't load that image.", severity: 'error' }); return }
      const img = await loadImageFromDataURL(url)
      if (!img) { setInfoToast({ message: "Couldn't load that image.", severity: 'error' }); return }
      setState(s => ({ ...s, bgImage: img, bgRotate: 0, bgFlipH: false, bgFlipV: false }))
    } finally {
      pickingLibraryImageIdRef.current = null
      setPickingLibraryImageId(null)
    }
  }
  async function onDeleteLibraryImage(id: string) {
    try {
      await deleteBackgroundImage.mutateAsync(id)
    } catch (e) {
      // Rethrow so BackgroundSection's delete-confirm dialog stays open (and its
      // "deleting" state reflects the real request lifecycle) instead of closing
      // as if the delete had succeeded.
      setInfoToast({ message: describeError(e), severity: 'error' })
      throw e
    }
  }

  // ---- Carousel ----
  function switchToSlide(i: number) {
    if (i === activeSlideIdx) return
    const saved = [...slides]
    saved[activeSlideIdx] = snapshotSlide(state, textColors)
    const { state: nextState, textColors: nextColors } = applySlideToState(saved[i], state, textColors)
    setSlides(saved)
    setActiveSlideIdx(i)
    setState(nextState)
    setTextColors(nextColors)
  }

  function addSlide() {
    if (slides.length >= 10) return
    const saved = [...slides]
    saved[activeSlideIdx] = snapshotSlide(state, textColors)
    const t = state.type
    // Fills the new slide with that type's default example content, exactly like the
    // source tool's addSlide(), which calls setType(t) on the newly-added slide.
    const defaulted: PostState = t === 'quote' || t === 'event'
      ? state
      : t === 'statistic'
        ? { ...state, tag: 'BY THE NUMBERS_', cta: 'Learn More' }
        : { ...state, ...TYPE_PLACEHOLDERS[t] }
    saved.push(snapshotSlide(defaulted, textColors))
    setSlides(saved)
    setActiveSlideIdx(saved.length - 1)
    setState(defaulted)
  }

  function removeSlide(i: number) {
    if (slides.length <= 1) return
    // Snapshot the live editor state into the active slide first, matching
    // switchToSlide/addSlide — otherwise deleting a DIFFERENT slide than the
    // active one discards whatever the user just edited on the active slide,
    // since the active slide's array entry would still hold its stale,
    // pre-edit content.
    const saved = [...slides]
    saved[activeSlideIdx] = snapshotSlide(state, textColors)
    const removedSlide = saved[i], removedIdx = i, prevActiveIdx = activeSlideIdx
    const next = [...saved]
    next.splice(i, 1)
    const nextActiveIdx = activeSlideIdx >= next.length ? next.length - 1 : (i < activeSlideIdx ? activeSlideIdx - 1 : activeSlideIdx)
    const { state: nextState, textColors: nextColors } = applySlideToState(next[nextActiveIdx], state, textColors)
    setSlides(next)
    setActiveSlideIdx(nextActiveIdx)
    setState(nextState)
    setTextColors(nextColors)
    pushUndo('Slide removed.', () => {
      const restored = [...next]
      restored.splice(removedIdx, 0, removedSlide)
      const { state: restoredState, textColors: restoredColors } = applySlideToState(restored[prevActiveIdx], stateRef.current, textColorsRef.current)
      setSlides(restored)
      setActiveSlideIdx(prevActiveIdx)
      setState(restoredState)
      setTextColors(restoredColors)
    })
  }

  function toggleCarousel(on: boolean) {
    setCarouselOn(on)
    if (on) { setSlides([snapshotSlide(state, textColors)]); setActiveSlideIdx(0) }
    else { setSlides([]) }
  }

  // ---- Bulk import ----
  // Case-insensitive: CSV/Excel entry is error-prone, and the library enforces
  // exact-name uniqueness server-side regardless, so a looser match here only
  // helps, never causes ambiguity.
  function findLibraryImageByName(name: string): BackgroundImageSummary | undefined {
    const needle = name.trim().toLowerCase()
    return libraryImages.find(img => img.name.trim().toLowerCase() === needle)
  }
  async function applyImportedRow(patch: ImportedRowPatch) {
    setState(s => ({ ...s, ...(patch.type ? { type: patch.type } : {}), ...patch.fields }))
    if (!patch.backgroundName) return
    const match = findLibraryImageByName(patch.backgroundName)
    if (!match) {
      setInfoToast({ message: `No library background named "${patch.backgroundName}" — check the name and try again.`, severity: 'error' })
      return
    }
    await onPickLibraryImage(match.id)
  }

  // Renders every imported row to its own PNG and downloads them as one zip —
  // each row is a standalone post (never a carousel), using the current format
  // and whatever shared fields (logo, icon, ...) the editor currently has; a
  // row's own type/fields/background (if any) override those per-row, mirroring
  // applyImportedRow's merge. Reuses the same canvas the single-post export does.
  async function exportAllRows(rows: Record<string, string>[]) {
    const canvas = canvasRef.current
    if (!canvas || !rows.length) return
    const zip = new JSZip()
    const missingBackgrounds = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const patch = importRowToPatch(rows[i])
      let rowState: PostState = { ...state, ...(patch.type ? { type: patch.type } : {}), ...patch.fields }
      if (patch.backgroundName) {
        const match = findLibraryImageByName(patch.backgroundName)
        const url = match ? await fetchBackgroundImage(match.id, getAccessToken) : null
        const img = url ? await loadImageFromDataURL(url) : null
        if (img) rowState = { ...rowState, bgImage: img, bgRotate: 0, bgFlipH: false, bgFlipV: false }
        else missingBackgrounds.add(patch.backgroundName)
      }
      draw(canvas, rowState, textColors, { on: false, slideCount: 1, activeIdx: 0 })
      const dataUrl = canvas.toDataURL('image/png', 1)
      const label = postFilenameSlug(csvRowTitle(rows[i]), `row-${i + 1}`, 24)
      zip.file(`wso2-row-${i + 1}-${label}.png`, dataUrl.split(',')[1], { base64: true })
    }
    draw(canvas, state, textColors, carouselInfo) // restore the visible canvas
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wso2-bulk-export-${state.format}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    setInfoToast(
      missingBackgrounds.size
        ? { message: `Exported ${rows.length} images. Missing background: ${[...missingBackgrounds].join(', ')}.`, severity: 'error' }
        : { message: `Exported ${rows.length} images.`, severity: 'success' },
    )
  }

  // ---- Project save / load ----
  function exportProjectFile() {
    const proj = serializeProject(state, textColors, carouselOn, currentSlidesSnapshot(), activeSlideIdx)
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' })
    const slug = postFilenameSlug(state.headline || state.type, 'project')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wso2-project-${slug}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    setInfoToast({ message: 'Project saved.', severity: 'success' })
  }

  async function applyDeserialized(proj: ProjectFile) {
    const result = await deserializeProject(proj)
    setState(result.state)
    setTextColors(result.textColors)
    setCarouselOn(result.carouselOn)
    setSlides(result.slides)
    setActiveSlideIdx(result.activeSlideIdx)
  }

  function importProjectFile(file: File) {
    const reader = new FileReader()
    reader.onerror = () => setInfoToast({ message: "Couldn't read that file. Please try again.", severity: 'error' })
    reader.onload = async ev => {
      let proj: ProjectFile
      try { proj = JSON.parse(ev.target?.result as string) }
      catch { setInfoToast({ message: "That doesn't look like a valid project file.", severity: 'error' }); return }
      try {
        await applyDeserialized(proj)
        setInfoToast({ message: 'Project loaded.', severity: 'success' })
      } catch (err) {
        console.error(err)
        setInfoToast({ message: "Couldn't load that project file.", severity: 'error' })
      }
    }
    reader.readAsText(file)
  }

  async function restoreAutosave() {
    if (!recovery) return
    try {
      await applyDeserialized(recovery.proj)
      setInfoToast({ message: 'Session restored.', severity: 'success' })
    } finally {
      setRecovery(null)
    }
  }

  // ---- Export ----
  function downloadPost() {
    const canvas = canvasRef.current
    if (!canvas) return
    draw(canvas, state, textColors, carouselInfo)
    const slug = postFilenameSlug(state.headline, 'post')
    const a = document.createElement('a')
    a.download = `wso2-${state.type}-${state.format}-${slug}.png`
    a.href = canvas.toDataURL('image/png', 1)
    a.click()
  }

  function copyImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    draw(canvas, state, textColors, carouselInfo)
    canvas.toBlob(blob => {
      if (blob && navigator.clipboard && 'ClipboardItem' in window) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => { /* non-fatal */ })
      }
    })
  }

  async function downloadAllSlides() {
    const canvas = canvasRef.current
    if (!canvas || !carouselOn || !slides.length) return
    const saved = currentSlidesSnapshot()
    const zip = new JSZip()
    for (let i = 0; i < saved.length; i++) {
      const { state: slideState, textColors: slideColors } = applySlideToState(saved[i], state, textColors)
      draw(canvas, slideState, slideColors, { on: true, slideCount: saved.length, activeIdx: i })
      const dataUrl = canvas.toDataURL('image/png', 1)
      const label = postFilenameSlug(slideState.headline || slideState.statNumber || slideState.type, 'slide', 24)
      zip.file(slidePngFilename(i, label), dataUrl.split(',')[1], { base64: true })
    }
    draw(canvas, state, textColors, carouselInfo) // restore the visible canvas
    setSlides(saved)
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wso2-carousel-${state.format}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  function computeFormatState(fmt: PostFormat): PostState {
    return fmt === 'square' ? { ...state, format: 'square', canvasW: 1080, canvasH: 1080 } : { ...state, format: 'banner', canvasW: 1200, canvasH: 628 }
  }

  async function downloadBatchFormats(formats: PostFormat[]) {
    const canvas = canvasRef.current
    if (!canvas || !formats.length) return
    if (carouselOn && slides.length) {
      const saved = currentSlidesSnapshot()
      const zip = new JSZip()
      formats.forEach(fmt => {
        const fmtBase = computeFormatState(fmt)
        for (let i = 0; i < saved.length; i++) {
          const { state: slideState, textColors: slideColors } = applySlideToState(saved[i], fmtBase, textColors)
          draw(canvas, slideState, slideColors, { on: true, slideCount: saved.length, activeIdx: i })
          const dataUrl = canvas.toDataURL('image/png', 1)
          const label = postFilenameSlug(slideState.headline || slideState.statNumber || slideState.type, 'slide', 24)
          zip.file(slidePngFilename(i, label, fmt), dataUrl.split(',')[1], { base64: true })
        }
      })
      draw(canvas, state, textColors, carouselInfo)
      setSlides(saved)
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'wso2-carousel-all-formats.zip'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } else {
      // Non-carousel multi-format: stagger the downloads (browsers block near-
      // simultaneous ones), matching the source tool's 250ms spacing. Each tick
      // briefly shows that format on the live canvas — same as the original,
      // which visibly switches the preview through each format during this export.
      const slug = postFilenameSlug(state.headline, 'post')
      formats.forEach((fmt, idx) => {
        setTimeout(() => {
          // Read live state/colors (not the click-time closure) so an edit made
          // mid-batch is reflected in later downloads and in the final restore.
          const liveState = stateRef.current
          const liveColors = textColorsRef.current
          const fmtState = { ...liveState, format: fmt, ...(fmt === 'square' ? { canvasW: 1080, canvasH: 1080 } : { canvasW: 1200, canvasH: 628 }) }
          draw(canvas, fmtState, liveColors, { on: false, slideCount: 0, activeIdx: 0 })
          const a = document.createElement('a')
          a.download = `wso2-${liveState.type}-${fmt}-${slug}.png`
          a.href = canvas.toDataURL('image/png', 1)
          a.click()
          if (idx === formats.length - 1) draw(canvas, liveState, liveColors, carouselInfo)
        }, idx * 250)
      })
    }
  }

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 190px)', minHeight: 520 }}>
      <Box sx={{ width: 340, flexShrink: 0, overflowY: 'auto', pr: 1 }}>
        <PostTypeSelector
          type={state.type} onTypeChange={setType}
          carouselOn={carouselOn} onCarouselToggle={toggleCarousel}
          slides={slides} activeSlideIdx={activeSlideIdx}
          onSwitchSlide={switchToSlide} onAddSlide={addSlide} onRemoveSlide={removeSlide}
        />

        <ContentFields
          state={state} textColors={textColors} onField={onField} onColorField={onColorField}
          onTextScale={pct => onField({ textScale: pct / 100 })}
          onCustomerLogoFile={onCustomerLogoFile} onClearCustomerLogo={onClearCustomerLogo}
        />

        {state.type === 'quote' && <QuoteFields state={state} textColors={textColors} onField={onField} onColorField={onColorField} />}
        {state.type === 'event' && (
          <EventFields
            state={state} textColors={textColors} onField={onField} onColorField={onColorField}
            onPartnerLogoFile={onPartnerLogoFile} onClearPartnerLogo={onClearPartnerLogo}
          />
        )}
        {state.type === 'statistic' && <StatisticFields state={state} textColors={textColors} onField={onField} onColorField={onColorField} />}

        <LogoIconSection
          logoPos={state.logoPos as LogoPos} logoColor={state.logoColor as LogoColor}
          iconOn={state.iconOn} iconColor={state.iconColor as IconColor}
          onLogoPosChange={pos => onField({ logoPos: pos })}
          onLogoColorChange={c => onField({ logoColor: c })}
          onIconToggle={on => onField({ iconOn: on })}
          onIconColorChange={c => onField({ iconColor: c })}
        />

        <BackgroundSection
          state={state} carouselOn={carouselOn} slideCount={slides.length}
          libraryImages={libraryImages} libraryLimit={libraryLimit}
          pickingLibraryImageId={pickingLibraryImageId}
          onBgImageFile={onBgImageFile} onClearBgImage={onClearBgImage}
          onOverlayChange={v => onField({ overlayOpacity: v })}
          onRotate={onRotate} onToggleFlip={onToggleFlip}
          onSpanToggle={on => onField({ bgSpanSlides: on })}
          onPickLibraryImage={onPickLibraryImage}
          onSaveLibraryImage={onSaveLibraryImage}
          onDeleteLibraryImage={onDeleteLibraryImage}
        />

        <BulkImportPanel onApplyRow={applyImportedRow} onExportAll={exportAllRows} onError={m => setInfoToast({ message: m, severity: 'error' })} />

        <ProjectActions onSave={exportProjectFile} onLoadFile={importProjectFile} />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button variant="contained" startIcon={<DownloadIcon size={18} />} onClick={() => setExportOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            Export
          </Button>
        </Box>
        <PreviewStage canvasRef={canvasRef} canvasW={state.canvasW} canvasH={state.canvasH} format={state.format} onFormatChange={setFormat} />
      </Box>

      <ExportDialog
        open={exportOpen} onClose={() => setExportOpen(false)} carouselOn={carouselOn}
        onDownloadPost={downloadPost} onCopyImage={copyImage}
        onDownloadAllSlides={downloadAllSlides} onDownloadBatch={downloadBatchFormats}
      />

      <Snackbar open={!!undoToast} autoHideDuration={6000} onClose={() => setUndoToast(null)}
        message={undoToast}
        action={<Button size="small" onClick={performUndo} sx={{ color: '#fff', textTransform: 'none' }}>Undo</Button>} />

      <Snackbar open={!!infoToast} autoHideDuration={4000} onClose={() => setInfoToast(null)}>
        {infoToast ? <Alert severity={infoToast.severity} onClose={() => setInfoToast(null)} sx={{ fontSize: '0.8rem' }}>{infoToast.message}</Alert> : undefined}
      </Snackbar>

      <Snackbar open={!!recovery} onClose={() => setRecovery(null)}>
        {recovery ? (
          <Alert severity="info" onClose={() => setRecovery(null)} sx={{ fontSize: '0.8rem' }}
            action={<Button size="small" onClick={restoreAutosave} sx={{ textTransform: 'none' }}>Restore</Button>}>
            Restore your unsaved work from {recovery.whenLabel}?
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
