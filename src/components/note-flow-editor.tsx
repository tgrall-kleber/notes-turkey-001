"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import {
  Bold,
  CheckSquare2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  RotateCcw,
  ShieldAlert,
  Strikethrough,
  Trash2,
} from "lucide-react";
import clsx from "clsx";

import type { Note } from "@/lib/noteflow/types";
import {
  dedupeTags,
  getRelativeTime,
  normalizeTag,
} from "@/lib/noteflow/utils";

interface NoteFlowEditorProps {
  note: Note | null;
  allTags: string[];
  autoFocusTitle: boolean;
  storageWarning: string | null;
  isTrashView: boolean;
  onClearAutoFocus: () => void;
  onUpdate: (noteId: string, patch: Partial<Pick<Note, "title" | "contentHtml" | "tags">>) => void;
  onTogglePin: (noteId: string) => void;
  onTrashNote: (noteId: string) => void;
  onRestoreNote: (noteId: string) => void;
  onDeleteForever: (noteId: string) => void;
  onExportMarkdown: (noteId: string) => void;
  onExportText: (noteId: string) => void;
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        "inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-[var(--muted-ink)] transition hover:-translate-y-px hover:border-[var(--accent-strong)] hover:text-[var(--text-primary)]",
        active
          ? "border-[var(--accent-strong)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--text-primary)] shadow-[0_10px_30px_rgba(79,70,229,0.18)]"
          : "border-[var(--border)] bg-[var(--panel-soft)]",
      )}
    >
      {children}
    </button>
  );
}

export function NoteFlowEditor({
  note,
  allTags,
  autoFocusTitle,
  storageWarning,
  isTrashView,
  onClearAutoFocus,
  onUpdate,
  onTogglePin,
  onTrashNote,
  onRestoreNote,
  onDeleteForever,
  onExportMarkdown,
  onExportText,
}: NoteFlowEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(note?.title ?? "");
  const [contentHtml, setContentHtml] = useState(note?.contentHtml ?? "");
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: { class: "noteflow-code" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Shape ideas, tasks, code, and quiet observations...",
      }),
    ],
    content: note?.contentHtml ?? "<p></p>",
    editorProps: {
      attributes: {
        class: "noteflow-editor prose-none",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      setContentHtml(activeEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!autoFocusTitle || !note) {
      return;
    }

    titleRef.current?.focus();
    titleRef.current?.select();
    onClearAutoFocus();
  }, [autoFocusTitle, note, onClearAutoFocus]);

  useEffect(() => {
    if (!note) {
      return;
    }

    const nextTitle = title.trim() || "Untitled Note";
    const nextTags = dedupeTags(tags);
    if (
      note.title === nextTitle &&
      note.contentHtml === contentHtml &&
      JSON.stringify(note.tags) === JSON.stringify(nextTags)
    ) {
      return;
    }

    const handle = window.setTimeout(() => {
      onUpdate(note.id, {
        title: nextTitle,
        contentHtml,
        tags: nextTags,
      });
    }, 400);

    return () => window.clearTimeout(handle);
  }, [contentHtml, note, onUpdate, tags, title]);

  useEffect(() => {
    if (!editor || !editorWrapperRef.current) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        !activeElement ||
        !editorWrapperRef.current?.contains(activeElement) ||
        !event.ctrlKey
      ) {
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "x") {
        event.preventDefault();
        editor.chain().focus().toggleStrike().run();
      }

      if (event.shiftKey && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        editor
          .chain()
          .focus()
          .toggleHeading({ level: Number(event.key) as 1 | 2 | 3 })
          .run();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  const normalizedTags = useMemo(() => dedupeTags(tags), [tags]);

  const addTag = () => {
    const next = normalizeTag(tagDraft);
    if (!next) return;
    setTags((current) => dedupeTags([...current, next]));
    setTagDraft("");
  };

  if (!note) {
    return (
      <div className="panel-shell flex h-full flex-col items-center justify-center gap-5 text-center">
        <div className="flex h-18 w-18 items-center justify-center rounded-[2rem] border border-[var(--border)] bg-[var(--panel-soft)] text-[var(--accent)] shadow-[var(--shadow-glow)]">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <p className="font-display text-4xl text-[var(--text-primary)]">Nothing selected yet</p>
          <p className="max-w-md text-sm leading-7 text-[var(--text-muted)]">
            Start with a new note or pick one from the list. Everything stays local,
            searchable, and ready to be reshaped.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={editorWrapperRef} className="panel-shell flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--text-muted)]">
              Note editor
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Created {getRelativeTime(note.createdAt)} · Updated {getRelativeTime(note.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onExportMarkdown(note.id)}
              className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-xs font-semibold tracking-[0.2em] text-[var(--text-primary)] transition hover:border-[var(--accent-strong)]"
            >
              Export .md
            </button>
            <button
              type="button"
              onClick={() => onExportText(note.id)}
              className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-xs font-semibold tracking-[0.2em] text-[var(--text-primary)] transition hover:border-[var(--accent-strong)]"
            >
              Export .txt
            </button>
            <button
              type="button"
              onClick={() => onTogglePin(note.id)}
              className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-xs font-semibold tracking-[0.2em] text-[var(--text-primary)] transition hover:border-[var(--accent-strong)]"
            >
              {note.pinned ? "Unpin" : "Pin"}
            </button>
            {isTrashView || note.trashed ? (
              <>
                <button
                  type="button"
                  onClick={() => onRestoreNote(note.id)}
                  className="rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-xs font-semibold tracking-[0.2em] text-[var(--text-primary)] transition hover:border-[var(--accent-strong)]"
                >
                  <RotateCcw className="mr-2 inline-block h-3.5 w-3.5" />
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteForever(note.id)}
                  className="rounded-full border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-2 text-xs font-semibold tracking-[0.2em] text-[var(--danger)] transition hover:brightness-110"
                >
                  <Trash2 className="mr-2 inline-block h-3.5 w-3.5" />
                  Delete forever
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onTrashNote(note.id)}
                className="rounded-full border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-2 text-xs font-semibold tracking-[0.2em] text-[var(--danger)] transition hover:brightness-110"
              >
                <Trash2 className="mr-2 inline-block h-3.5 w-3.5" />
                Move to Trash
              </button>
            )}
          </div>
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled Note"
          className="w-full border-none bg-transparent font-display text-4xl leading-tight text-[var(--text-primary)] outline-none placeholder:text-[color-mix(in_srgb,var(--text-muted)_80%,transparent)]"
        />
      </div>

      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap gap-2">
          <ToolbarButton label="Bold" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Italic" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Strikethrough" active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Heading 1" active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Heading 2" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Heading 3" active={editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Ordered list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Task list" active={editor?.isActive("taskList")} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
            <CheckSquare2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Code block" active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            <span className="text-sm">&lt;/&gt;</span>
          </ToolbarButton>
          <ToolbarButton label="Quote" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Divider" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </div>

      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[1.25rem] border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3">
            <span className="text-[10px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
              Tags
            </span>
            <input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTag();
                }
              }}
              list="note-tags"
              placeholder="Add a tag"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={addTag}
              className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold tracking-[0.2em] text-white"
            >
              Add
            </button>
            <datalist id="note-tags">
              {allTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-wrap gap-2">
            {normalizedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--tag-bg)] px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[var(--accent)]"
              >
                #{tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag} tag`}
                  onClick={() => setTags((current) => current.filter((entry) => entry !== tag))}
                  className="text-[var(--text-muted)] transition hover:text-[var(--danger)]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
        {storageWarning ? (
          <p className="mt-3 text-xs text-[var(--danger)]">{storageWarning}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
