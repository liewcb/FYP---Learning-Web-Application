"use client";

import { useEffect, useRef } from "react";

import {
  highlightColourNames,
  highlightColours,
  type HighlightColour,
  type StudyHighlight,
  type TextRange,
} from "@/models/revision/highlight.model";
import { NotePlusIcon, TrashIcon } from "@/views/revision/revision-icons.view";

export interface ToolbarPlace {
  /** Pixels inside the reader column. */
  readonly top: number;
  readonly left: number;
  /** Shown under the text, when there is no room above it. */
  readonly below: boolean;
}

/** What the toolbar acts on: text just selected, or a highlight that was clicked. */
export type HighlightToolbarTarget =
  | (ToolbarPlace & { readonly kind: "selection"; readonly range: TextRange })
  | (ToolbarPlace & { readonly kind: "highlight"; readonly highlight: StudyHighlight });

interface HighlightToolbarProps {
  readonly target: HighlightToolbarTarget;
  readonly onColour: (colour: HighlightColour) => void;
  readonly onNote: () => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/** Colours for the selected text or the clicked highlight, with Note and Remove. */
export function HighlightToolbar({ target, onColour, onNote, onRemove, onClose }: HighlightToolbarProps) {
  const current = target.kind === "highlight" ? target.highlight.colour : null;
  const toolbarRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape, or pressing anywhere but the toolbar or another highlight, closes it.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    const closeOnPress = (event: PointerEvent) => {
      const pressed = event.target as Element | null;

      if (!toolbarRef.current?.contains(pressed) && !pressed?.closest?.("mark[data-highlight]")) {
        onCloseRef.current();
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnPress);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnPress);
    };
  }, []);

  return (
    <div
      ref={toolbarRef}
      className={target.below ? "rev-hl-toolbar below" : "rev-hl-toolbar"}
      role="toolbar"
      aria-label={target.kind === "selection" ? "Highlight the selected text" : "Change this highlight"}
      style={{ top: target.top, left: target.left }}
      // Pressing a button must not clear the text selection it acts on.
      onMouseDown={(event) => event.preventDefault()}
    >
      {highlightColours.map((colour) => (
        <button
          key={colour}
          className="rev-hl-swatch"
          type="button"
          data-colour={colour}
          aria-pressed={current === colour}
          aria-label={`${highlightColourNames[colour]} highlight`}
          title={highlightColourNames[colour]}
          onClick={() => onColour(colour)}
        />
      ))}
      <span className="rev-hl-toolbar-divider" aria-hidden="true" />
      <button className="rev-hl-action" type="button" onClick={onNote} title="Add to a new note">
        <NotePlusIcon />
        Note
      </button>
      {target.kind === "highlight" ? (
        <button className="rev-hl-action" type="button" onClick={onRemove} title="Remove highlight">
          <TrashIcon />
          Remove
        </button>
      ) : null}
    </div>
  );
}
