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

import { useEffect, useMemo, useRef, useState } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { Box, IconButton, Tooltip, Typography, useTheme } from "@wso2/oxygen-ui";
import { TrashIcon } from "@wso2/oxygen-ui-icons-react";
import { sanitizeTilHtml } from "../util/tilRichText";

// react-quill-new, same as every other One WSO2 rich-text field -- draft-js
// has no React 19 support. Toolbar is bold/italic/underline, lists, and now
// an image button — the minimum that makes a multi-paragraph learning
// readable plus a screenshot, which is most of what people actually paste
// in. Still no link/undo-redo, kept deliberately simple otherwise.
const FORMATS = ["bold", "italic", "underline", "list", "bullet", "image"];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // matches the upload size limit enforced by the TIL backend — reject oversized files client-side too, not just let the backend 400 after a slow upload

export default function TilRichTextField({
  value,
  onChange,
  onUploadImage,
  onUploadError,
  onUploadingChange,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (html: string) => void;
  // Uploads a picked/pasted image and resolves to its stored URL. Optional
  // only so this component still compiles for a caller with nothing to
  // upload to — every real caller today always provides it.
  onUploadImage?: (file: File) => Promise<string>;
  // Called with a short, user-facing reason whenever an image is rejected
  // or fails to upload. Without this, every one of those cases (oversized
  // file, non-image, network/server failure) failed completely silently --
  // nothing inserted, nothing shown, indistinguishable from the paste/click
  // simply not having registered at all. Optional so this component still
  // compiles for a caller that doesn't care to surface it.
  onUploadError?: (message: string) => void;
  // Fires with true right before an upload starts and false once it settles
  // (success or failure). Lets a caller (SubmitEntryDialog) disable its own
  // Share button for the duration -- without this, clicking Share while an
  // upload is still pending submitted the entry's `what` BEFORE the image
  // was inserted, so a successful submission silently shipped without the
  // image the user thought they'd attached.
  onUploadingChange?: (uploading: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const quillRef = useRef<ReactQuill>(null);
  // Wraps the whole editor (toolbar + ql-container) -- the resize/delete
  // overlay below is positioned absolutely against THIS box, not the page,
  // so it tracks the image correctly even inside a scrolled dialog.
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The <img> element currently selected (clicked) in the editor, and
  // where to float the resize/delete overlay for it. Two different
  // notions of "selected" exist here on purpose: Quill's OWN native
  // embed selection (blue outline, lets Backspace delete it) keeps
  // working untouched -- this is purely a second, additive affordance,
  // since clicking an image gave no visible way to resize or remove it
  // otherwise.
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null);
  // Only one upload accepted at a time -- re-entrant calls are ignored.
  //
  // Does NOT also make the editor read-only for the upload's duration
  // (an earlier version did) -- that toggle caused a real, worse bug:
  // react-quill-new's shouldComponentUpdate compares the incoming `value`
  // prop against Quill's OWN current DOM content on every prop change,
  // including when readOnly flips, and force-resets the editor from the
  // HTML string via setEditorContents() if they don't match exactly. That
  // reset path re-parses HTML rather than trusting insertEmbed's native
  // result, and reliably dropped the just-inserted image -- confirmed
  // directly by removing the readOnly toggle and watching uploads start
  // working again. The trade-off this reopens: if the user types during an
  // upload, the selection index captured before it started can go stale,
  // and insertEmbed can land at the wrong position. Accepted as the lesser
  // problem -- a mispositioned image is recoverable, a 100%-reproducible
  // silent upload failure is not.
  const isUploadingRef = useRef(false);

  // Shared by the toolbar's image button and by pasting an image file
  // directly -- both end up with a File and a cursor position to insert at.
  // Defined with useRef (not a plain function) so the toolbar handler below
  // — captured once into MODULES at first render — always calls the LATEST
  // version rather than one closed over a stale onUploadImage/onUploadError
  // from an earlier render.
  const uploadAndInsert = useRef<(file: File) => Promise<void>>(async () => {});
  uploadAndInsert.current = async (file: File) => {
    const editor = quillRef.current?.getEditor();
    if (!editor || !onUploadImage) return;
    if (isUploadingRef.current) return;
    if (!file.type.startsWith("image/")) {
      onUploadError?.("Only image files can be inserted.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      onUploadError?.("Image must be 5 MB or smaller.");
      return;
    }
    const range = editor.getSelection(true);
    isUploadingRef.current = true;
    onUploadingChange?.(true);
    try {
      const url = await onUploadImage(file);
      const insertAt = range?.index ?? editor.getLength();
      editor.insertEmbed(insertAt, "image", url, "user");
      editor.setSelection(insertAt + 1, 0, "user");
      // The inserted image can easily be taller than the editor's visible
      // area (a full-resolution screenshot in a ~200px-tall box), and
      // nothing about insertEmbed/setSelection scrolls it into view on its
      // own -- without this, a successful upload can look exactly like
      // nothing happened, because the result is real but off-screen below
      // the fold (root-caused: confirmed via DevTools that the upload
      // request itself was succeeding every time this was reported).
      // Queued a frame out so this runs after Quill's own re-render from
      // the insert, not before it.
      requestAnimationFrame(() => {
        editor.root.querySelector(`img[src="${CSS.escape(url)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    } catch (err) {
      // Best-effort in the sense that a failed upload never corrupts or
      // blocks the rest of the entry the user was typing -- but the
      // failure itself is now surfaced, not swallowed.
      const detail = err instanceof Error ? err.message : String(err);
      onUploadError?.(`Couldn't upload that image: ${detail}`);
    } finally {
      isUploadingRef.current = false;
      onUploadingChange?.(false);
    }
  };

  // react-quill-new has no onPaste prop (only onKeyDown/Press/Up — checked
  // against its own type definitions before writing this) — a Quill
  // clipboard matcher doesn't work here either, since matchers only ever
  // see an <img> node already pointing at a URL or data: blob, never the
  // raw image FILE a plain copy-paste of a screenshot carries in
  // clipboardData.items. Attaching directly to Quill's own editable DOM
  // node is the only way to intercept it. Only prevents the paste's
  // default handling when an image file is actually found, so a normal
  // text paste still goes through Quill's own handling untouched.
  useEffect(() => {
    const root = quillRef.current?.getEditor().root;
    if (!root) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData ? Array.from(e.clipboardData.items) : [];
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (file) {
        e.preventDefault();
        void uploadAndInsert.current(file);
      }
    };
    root.addEventListener("paste", handlePaste);
    return () => root.removeEventListener("paste", handlePaste);
  }, []);

  // Reads back the editor's live DOM as HTML and pushes it out through
  // onChange -- the same "DOM is the source of truth, HTML round-trips
  // back out" posture uploadAndInsert already relies on. Needed here
  // because resize/delete below mutate the <img> element directly
  // rather than through a Quill API call, so nothing else would ever
  // tell onChange a change happened.
  const commitChange = () => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    onChange(sanitizeTilHtml(editor.root.innerHTML));
  };

  // Selects an image on click so the overlay below can target it --
  // deliberately NOT preventDefault/stopPropagation, so Quill's own
  // native embed selection (and therefore Backspace-to-delete) keeps
  // working exactly as it did before this existed.
  useEffect(() => {
    const root = quillRef.current?.getEditor().root;
    if (!root || disabled) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      setSelectedImg(target.tagName === "IMG" ? (target as HTMLImageElement) : null);
    };
    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, [disabled]);

  // Clicking anywhere outside the editor+overlay deselects -- without
  // this, clicking into the Title field with an image still "selected"
  // left the overlay floating over content it no longer has any real
  // claim to be anchored to.
  useEffect(() => {
    if (!selectedImg) return;
    const handleDocMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSelectedImg(null);
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, [selectedImg]);

  // Disabling the field (view-only mode) drops any live selection --
  // nothing should float a resize/delete overlay over read-only content.
  useEffect(() => {
    if (disabled) setSelectedImg(null);
  }, [disabled]);

  // Tracks the selected image's position so the overlay stays pinned to
  // it across scrolling/resizing. Also the one place that notices a
  // selected image has been detached from the document entirely (e.g.
  // the editor's content was reset out from under it) and clears the
  // stale selection rather than floating an overlay over nothing.
  useEffect(() => {
    if (!selectedImg || !wrapperRef.current) {
      setOverlayPos(null);
      return;
    }
    const update = () => {
      if (!wrapperRef.current || !document.contains(selectedImg)) {
        setSelectedImg(null);
        return;
      }
      const imgRect = selectedImg.getBoundingClientRect();
      const wrapRect = wrapperRef.current.getBoundingClientRect();
      setOverlayPos({ top: imgRect.top - wrapRect.top, left: imgRect.left - wrapRect.left });
    };
    update();
    const root = quillRef.current?.getEditor().root;
    root?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      root?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [selectedImg]);

  // Width presets rather than a drag handle -- a free-drag resize needs
  // its own mousemove/mouseup tracking and aspect-ratio math for not
  // much real benefit here (this is a feed-preview image, not a design
  // tool); three fixed widths cover "too big"/"fine"/"back to full size"
  // with far less that can go wrong.
  const resizeSelectedImage = (percent: number) => {
    if (!selectedImg) return;
    // A plain HTML "width" attribute, not an inline style -- sanitizeTilHtml
    // (and til-backend's own sanitize_what_html) allowlist specific
    // ATTRIBUTES, not "style" wholesale, so a resize set via .style.width
    // was silently stripped the moment this change round-tripped through
    // either sanitizer, snapping the image back to full size right after
    // (confirmed: ALLOWED_ATTR never included "style"). No explicit height
    // needed -- the browser preserves aspect ratio from width alone, same
    // as the editor's own ".ql-editor img { height: auto }" rule already
    // assumed.
    selectedImg.setAttribute("width", `${percent}%`);
    commitChange();
  };

  const deleteSelectedImage = () => {
    if (!selectedImg) return;
    selectedImg.remove();
    setSelectedImg(null);
    commitChange();
  };

  // Quill's own snow theme never sets a `title` on its toolbar buttons --
  // each one is just an icon with no accessible name and no hover tooltip,
  // which is why none of them say what they do. Set directly on the DOM
  // nodes Quill already built (via the toolbar module's own .container),
  // rather than through modules.toolbar config, which has no option for
  // this at all.
  useEffect(() => {
    const toolbar = quillRef.current?.getEditor().getModule("toolbar") as { container?: HTMLElement } | undefined;
    const container = toolbar?.container;
    if (!container) return;
    const labels: [string, string][] = [
      [".ql-bold", "Bold"],
      [".ql-italic", "Italic"],
      [".ql-underline", "Underline"],
      ['.ql-list[value="ordered"]', "Numbered list"],
      ['.ql-list[value="bullet"]', "Bullet list"],
      [".ql-image", "Insert image (or paste one directly)"],
      [".ql-clean", "Clear formatting"],
    ];
    for (const [selector, label] of labels) {
      container.querySelector(selector)?.setAttribute("title", label);
    }
  }, []);

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["image"], ["clean"]],
        handlers: {
          image: () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
              const file = input.files?.[0];
              if (file) void uploadAndInsert.current(file);
            };
            input.click();
          },
        },
      },
      clipboard: {
        matchVisual: false,
        matchers: [],
      },
    }),
    [],
  );

  return (
    <Box
      ref={wrapperRef}
      sx={{
        height: "100%",
        display: "flex",
        position: "relative",
        "& .quill": {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          // theme.palette.divider is too faint to read as a border at all on
          // this dark surface (same issue the toolbar icons had) — explicit
          // white at low opacity instead, matching the visible weight of the
          // Who/Where fields' own outlines beside it.
          border: "1px solid rgba(255, 255, 255, 0.3)",
          borderRadius: 1,
        },
        "& .ql-container": {
          fontSize: "inherit",
          fontFamily: "inherit",
          border: "none",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        },
        // Same story as the toolbar icons below: a theme-token color here
        // (text.primary) resolved to something too dark to read on this
        // dark surface, so this is hardcoded white like the icons, not
        // theme-derived — and !important for the same reason: quill's own
        // base styles set color directly on this element too.
        "& .ql-editor": {
          flex: 1,
          overflow: "auto",
          minHeight: 0,
          padding: "12px 15px",
          overflowWrap: "break-word",
          color: "#fff !important",
        },
        // TilWhatContent (the read-only view) already constrains images --
        // the live editor never got the same rule, so an inserted image at
        // its original resolution (e.g. a full screenshot) could render far
        // taller than the editor's own visible area with nothing to shrink
        // it, which looked exactly like the upload had silently failed.
        "& .ql-editor img": {
          maxWidth: "100%",
          height: "auto",
          display: "block",
          borderRadius: 4,
          margin: "0.5em 0",
        },
        // Quill's placeholder defaults to italic -- none of this app's other
        // fields do that (see the Who/Where placeholders beside this one),
        // so drop it for visual consistency.
        "& .ql-editor.ql-blank::before": {
          color: "rgba(255, 255, 255, 0.5) !important",
          fontStyle: "normal",
          left: 15,
          right: 15,
        },
        "& .ql-toolbar": {
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          borderBottom: "1px solid rgba(255, 255, 255, 0.3)",
          flexShrink: 0,
        },
        "& .ql-container.ql-snow, & .ql-toolbar.ql-snow": {
          border: "none",
        },
        // quill.snow.css hardcodes its toolbar icon colors for a light
        // background (a dim grey stroke, #444, and #06c blue on hover),
        // which is both low-contrast and off-brand against this app's dark
        // theme — repaint every icon state. !important because quill.snow.
        // css's own hover/active rule (.ql-snow.ql-toolbar button.ql-active
        // .ql-stroke, etc.) sits at the same specificity as a plain nested
        // selector here, so which one wins is a coin flip decided by import
        // order, not a chain worth relying on. Literal white rather than a
        // theme token: this editor only ever renders on this dialog's dark
        // surface, never a light one, so there's no light/dark variant to
        // account for.
        "& .ql-toolbar .ql-stroke": { stroke: "#fff !important" },
        "& .ql-toolbar .ql-fill": { fill: "#fff !important" },
        "& .ql-toolbar .ql-picker-label": { color: "#fff !important" },
        "& .ql-toolbar button:hover .ql-stroke, & .ql-toolbar button.ql-active .ql-stroke, & .ql-toolbar button:focus .ql-stroke":
          { stroke: `${theme.palette.primary.main} !important` },
        "& .ql-toolbar button:hover .ql-fill, & .ql-toolbar button.ql-active .ql-fill, & .ql-toolbar button:focus .ql-fill":
          { fill: `${theme.palette.primary.main} !important` },
        "& .ql-toolbar button:hover, & .ql-toolbar button.ql-active, & .ql-toolbar button:focus": {
          color: `${theme.palette.primary.main} !important`,
        },
      }}
    >
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={(html) => onChange(sanitizeTilHtml(html))}
        placeholder={placeholder}
        modules={modules}
        formats={FORMATS}
        readOnly={disabled}
      />
      {selectedImg && overlayPos && !disabled && (
        <Box
          sx={{
            position: "absolute",
            top: overlayPos.top + 6,
            left: overlayPos.left + 6,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            bgcolor: "rgba(0, 0, 0, 0.75)",
            borderRadius: 1,
            p: 0.25,
            zIndex: 2,
          }}
        >
          <Tooltip title="Small">
            <IconButton size="small" onClick={() => resizeSelectedImage(25)} sx={{ color: "#fff" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>
                S
              </Typography>
            </IconButton>
          </Tooltip>
          <Tooltip title="Medium">
            <IconButton size="small" onClick={() => resizeSelectedImage(50)} sx={{ color: "#fff" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>
                M
              </Typography>
            </IconButton>
          </Tooltip>
          <Tooltip title="Full width">
            <IconButton size="small" onClick={() => resizeSelectedImage(100)} sx={{ color: "#fff" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>
                L
              </Typography>
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove image">
            <IconButton size="small" onClick={deleteSelectedImage} sx={{ color: "#fff" }}>
              <TrashIcon size={14} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
