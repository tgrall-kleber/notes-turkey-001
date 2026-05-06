"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  MoonStar,
  NotebookTabs,
  Plus,
  Search,
  StickyNote,
  SunMedium,
  Tag,
  Trash2,
} from "lucide-react";
import clsx from "clsx";

import { NoteFlowEditor } from "@/components/note-flow-editor";
import type { Note, NoteFlowState, Notebook, ViewSelection } from "@/lib/noteflow/types";
import {
  STORAGE_LIMIT_BYTES,
  STORAGE_WARNING_BYTES,
  REPO_NAME,
  applyTheme,
  bytesOf,
  createId,
  dedupeTags,
  downloadFile,
  exportMarkdown,
  formatBytes,
  getNotePreview,
  htmlToPlainText,
  loadState,
  noteMatchesQuery,
  normalizeTag,
  persistState,
  sortNotes,
} from "@/lib/noteflow/utils";

type CompactPanel = "sidebar" | "list" | "editor";

interface HighlightProps {
  text: string;
  query: string;
}

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  action: () => void;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [delay, value]);

  return debounced;
}

function HighlightedText({ text, query }: HighlightProps) {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const matcher = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const segments = text.split(matcher);
  const normalizedQuery = query.toLowerCase();

  return (
    <>
      {segments.map((segment, index) =>
        segment.toLowerCase() === normalizedQuery ? (
          <mark key={`${segment}-${index}`} className="rounded bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-0.5 text-inherit">
            {segment}
          </mark>
        ) : (
          <span key={`${segment}-${index}`}>{segment}</span>
        ),
      )}
    </>
  );
}

function viewLabel(view: ViewSelection, notebooks: Notebook[]) {
  if (view.type === "all") return "All Notes";
  if (view.type === "trash") return "Trash";
  if (view.type === "tag") return `#${view.tag}`;
  return notebooks.find((notebook) => notebook.id === view.notebookId)?.name ?? "Notebook";
}

function EmptyPanel({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-shell flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-18 w-18 items-center justify-center rounded-[2rem] border border-[var(--border)] bg-[var(--panel-soft)] text-[var(--accent)] shadow-[var(--shadow-glow)]">
        {icon}
      </div>
      <div className="space-y-2">
        <p className="font-display text-4xl text-[var(--text-primary)]">{title}</p>
        <p className="max-w-md text-sm leading-7 text-[var(--text-muted)]">{body}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold tracking-[0.22em] text-white shadow-[var(--shadow-glow)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function NoteFlowApp() {
  const [state, setState] = useState<NoteFlowState | null>(null);
  const [view, setView] = useState<ViewSelection>({ type: "all" });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [pendingTitleFocusId, setPendingTitleFocusId] = useState<string | null>(null);
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [compactPanel, setCompactPanel] = useState<CompactPanel>("list");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebouncedValue(searchInput, 120);

  useEffect(() => {
    // Hydrate from localStorage after mount to avoid server/client mismatch for client-only data.
    const loaded = loadState();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loaded);
    applyTheme(loaded.theme);
  }, []);

  const persistenceStatus = useMemo(() => {
    if (!state) {
      return { usageBytes: 0, storageMessage: null as string | null };
    }

    try {
      const payload = JSON.stringify(state);
      const payloadBytes = bytesOf(payload);
      if (payloadBytes >= STORAGE_LIMIT_BYTES) {
        return {
          usageBytes: payloadBytes,
          storageMessage: "Local browser storage is full. Export important notes and delete older content.",
        };
      }

      if (payloadBytes >= STORAGE_WARNING_BYTES) {
        return {
          usageBytes: payloadBytes,
          storageMessage: `Storage is getting tight (${formatBytes(payloadBytes)} used). Consider exporting older notes.`,
        };
      }

      return { usageBytes: payloadBytes, storageMessage: null as string | null };
    } catch {
      return {
        usageBytes: 0,
        storageMessage: "Saving failed because browser storage is unavailable. Export your notes before leaving this page.",
      };
    }
  }, [state]);

  useEffect(() => {
    if (!state) {
      return;
    }

    try {
      persistState(state);
    } catch {
      // The derived storage warning handles the user-facing message.
    }
  }, [state]);

  const allTags = useMemo(() => {
    if (!state) return [];
    return dedupeTags(
      state.notes.filter((note) => !note.trashed).flatMap((note) => note.tags),
    );
  }, [state]);

  const filteredNotes = useMemo(() => {
    if (!state) return [];

    const baseNotes = state.notes.filter((note) => {
      if (view.type === "trash") {
        return note.trashed;
      }

      if (note.trashed) return false;
      if (view.type === "notebook") return note.notebookId === view.notebookId;
      if (view.type === "tag") return note.tags.includes(view.tag);
      return true;
    });

    return sortNotes(baseNotes.filter((note) => noteMatchesQuery(note, debouncedSearch)));
  }, [debouncedSearch, state, view]);

  const selectedNote = useMemo(
    () => filteredNotes.find((note) => note.id === selectedNoteId) ?? filteredNotes[0] ?? null,
    [filteredNotes, selectedNoteId],
  );

  const notebookCounts = useMemo(() => {
    if (!state) return new Map<string, number>();

    return state.notes.reduce((accumulator, note) => {
      if (note.trashed) return accumulator;
      accumulator.set(note.notebookId, (accumulator.get(note.notebookId) ?? 0) + 1);
      return accumulator;
    }, new Map<string, number>());
  }, [state]);

  const tagCounts = useMemo(() => {
    if (!state) return new Map<string, number>();

    return state.notes.reduce((accumulator, note) => {
      if (note.trashed) return accumulator;
      for (const tag of note.tags) {
        accumulator.set(tag, (accumulator.get(tag) ?? 0) + 1);
      }
      return accumulator;
    }, new Map<string, number>());
  }, [state]);

  const trashCount = useMemo(
    () => state?.notes.filter((note) => note.trashed).length ?? 0,
    [state],
  );

  const updateState = useCallback((updater: (current: NoteFlowState) => NoteFlowState) => {
    setState((current) => (current ? updater(current) : current));
  }, []);

  const createNotebook = useCallback(() => {
    const notebookId = createId("notebook");
    const timestamp = new Date().toISOString();
    updateState((current) => ({
      ...current,
      notebooks: [
        {
          id: notebookId,
          name: "Untitled Notebook",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        ...current.notebooks,
      ],
    }));
    setView({ type: "notebook", notebookId });
    setEditingNotebookId(notebookId);
    setCompactPanel("list");
  }, [updateState]);

  const createNote = useCallback(() => {
    if (!state) return;

    let notebookId = state.notebooks[0]?.id;
    if (view.type === "notebook") {
      notebookId = view.notebookId;
    } else if (selectedNote && !selectedNote.trashed) {
      notebookId = selectedNote.notebookId;
    }

    if (!notebookId) {
      const newNotebookId = createId("notebook");
      const timestamp = new Date().toISOString();
      const noteId = createId("note");

      updateState((current) => ({
        ...current,
        notebooks: [
          {
            id: newNotebookId,
            name: "Untitled Notebook",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          ...current.notebooks,
        ],
        notes: [
          {
            id: noteId,
            notebookId: newNotebookId,
            title: "Untitled Note",
            contentHtml: "<p></p>",
            tags: [],
            pinned: false,
            trashed: false,
            deletedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          ...current.notes,
        ],
      }));
      setView({ type: "notebook", notebookId: newNotebookId });
      setEditingNotebookId(newNotebookId);
      setSelectedNoteId(noteId);
      setPendingTitleFocusId(noteId);
      setCompactPanel("editor");
      return;
    }

    const timestamp = new Date().toISOString();
    const noteId = createId("note");
    updateState((current) => ({
      ...current,
      notes: [
        {
          id: noteId,
          notebookId,
          title: "Untitled Note",
          contentHtml: "<p></p>",
          tags: [],
          pinned: false,
          trashed: false,
          deletedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        ...current.notes,
      ],
    }));
    setSelectedNoteId(noteId);
    setPendingTitleFocusId(noteId);
    setCompactPanel("editor");
  }, [selectedNote, state, updateState, view]);

  const renameNotebook = (notebookId: string, name: string) => {
    updateState((current) => ({
      ...current,
      notebooks: current.notebooks.map((notebook) =>
        notebook.id === notebookId
          ? { ...notebook, name: name.trim() || "Untitled Notebook", updatedAt: new Date().toISOString() }
          : notebook,
      ),
    }));
  };

  const promptNotebookDeletion = (notebookId: string) => {
    const notebook = state?.notebooks.find((entry) => entry.id === notebookId);
    if (!notebook) return;

    setConfirmState({
      title: `Delete "${notebook.name}"?`,
      description: "The notebook will be removed and its notes will move to Trash.",
      confirmLabel: "Delete notebook",
      tone: "danger",
      action: () => {
        const timestamp = new Date().toISOString();
        updateState((current) => ({
          ...current,
          notebooks: current.notebooks.filter((entry) => entry.id !== notebookId),
          notes: current.notes.map((note) =>
            note.notebookId === notebookId
              ? { ...note, trashed: true, deletedAt: timestamp, updatedAt: timestamp }
              : note,
          ),
        }));
        if (view.type === "notebook" && view.notebookId === notebookId) {
          setView({ type: "all" });
        }
        setConfirmState(null);
      },
    });
  };

  const updateNote = (noteId: string, patch: Partial<Pick<Note, "title" | "contentHtml" | "tags">>) => {
    updateState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              ...patch,
              tags: patch.tags ? dedupeTags(patch.tags) : note.tags,
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    }));
  };

  const togglePin = (noteId: string) => {
    updateState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === noteId
          ? { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() }
          : note,
      ),
    }));
  };

  const moveNoteToTrash = useCallback((noteId: string) => {
    setConfirmState({
      title: "Move note to Trash?",
      description: "You can restore it later from the Trash view.",
      confirmLabel: "Move to Trash",
      tone: "danger",
      action: () => {
        const timestamp = new Date().toISOString();
        updateState((current) => ({
          ...current,
          notes: current.notes.map((note) =>
            note.id === noteId
              ? { ...note, trashed: true, deletedAt: timestamp, updatedAt: timestamp }
              : note,
          ),
        }));
        setConfirmState(null);
      },
    });
  }, [updateState]);

  const restoreNote = (noteId: string) => {
    updateState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === noteId
          ? { ...note, trashed: false, deletedAt: null, updatedAt: new Date().toISOString() }
          : note,
      ),
    }));
    setView({ type: "all" });
  };

  const deleteNoteForever = (noteId: string) => {
    setConfirmState({
      title: "Delete note forever?",
      description: "This permanently removes the note from your device.",
      confirmLabel: "Delete forever",
      tone: "danger",
      action: () => {
        updateState((current) => ({
          ...current,
          notes: current.notes.filter((note) => note.id !== noteId),
        }));
        setConfirmState(null);
      },
    });
  };

  const toggleTheme = () => {
    updateState((current) => {
      const nextTheme = current.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      return { ...current, theme: nextTheme };
    });
  };

  const exportAsMarkdown = (noteId: string) => {
    const note = state?.notes.find((entry) => entry.id === noteId);
    if (!note) return;
    downloadFile(`${normalizeTag(note.title || "note") || "note"}.md`, exportMarkdown(note), "text/markdown;charset=utf-8");
  };

  const exportAsText = (noteId: string) => {
    const note = state?.notes.find((entry) => entry.id === noteId);
    if (!note) return;
    downloadFile(`${normalizeTag(note.title || "note") || "note"}.txt`, htmlToPlainText(note.contentHtml), "text/plain;charset=utf-8");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!state) return;

      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }

      if (event.ctrlKey && event.key.toLowerCase() === "n" && !event.shiftKey) {
        event.preventDefault();
        createNote();
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        createNotebook();
      }

      if (event.key === "Escape") {
        if (searchInput) {
          setSearchInput("");
          searchRef.current?.blur();
        }
        setConfirmState(null);
      }

      if (!isEditable && event.key === "Delete" && selectedNote && !selectedNote.trashed) {
        event.preventDefault();
        moveNoteToTrash(selectedNote.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createNote, createNotebook, moveNoteToTrash, searchInput, selectedNote, state, view]);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="glass-card flex items-center gap-4 px-6 py-5">
          <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--accent)]" />
          <p className="text-sm tracking-[0.25em] text-[var(--text-muted)]">Loading NoteFlow...</p>
        </div>
      </div>
    );
  }

  const renderSidebar = (mobile = false) => (
    <aside className="panel-shell flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--text-muted)]">Library</p>
            <h2 className="mt-2 font-display text-4xl text-[var(--text-primary)]">Quiet structure.</h2>
          </div>
          {mobile ? (
            <button
              type="button"
              onClick={() => setCompactPanel("list")}
              className="rounded-full border border-[var(--border)] p-2 text-[var(--text-muted)]"
              aria-label="Open notes list"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={createNote}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold tracking-[0.18em] text-white shadow-[var(--shadow-glow)]"
          >
            <Plus className="h-4 w-4" />
            New Note
          </button>
          <button
            type="button"
            onClick={createNotebook}
            className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-3 text-sm font-semibold tracking-[0.18em] text-[var(--text-primary)]"
          >
            <NotebookTabs className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setView({ type: "all" });
              setCompactPanel("list");
            }}
            className={clsx(
              "sidebar-item",
              view.type === "all" && "sidebar-item-active",
            )}
          >
            <span className="inline-flex items-center gap-3">
              <BookMarked className="h-4 w-4" />
              All Notes
            </span>
            <span className="count-pill">{state.notes.filter((note) => !note.trashed).length}</span>
          </button>
          {state.notebooks.map((notebook) => (
            <div
              key={notebook.id}
              className={clsx(
                "sidebar-item group",
                view.type === "notebook" && view.notebookId === notebook.id && "sidebar-item-active",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setView({ type: "notebook", notebookId: notebook.id });
                  setCompactPanel("list");
                }}
                onDoubleClick={() => setEditingNotebookId(notebook.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <StickyNote className="h-4 w-4 flex-none" />
                {editingNotebookId === notebook.id ? (
                  <input
                    autoFocus
                    defaultValue={notebook.name}
                    onBlur={(event) => {
                      renameNotebook(notebook.id, event.target.value);
                      setEditingNotebookId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        renameNotebook(notebook.id, event.currentTarget.value);
                        setEditingNotebookId(null);
                      }
                      if (event.key === "Escape") {
                        setEditingNotebookId(null);
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm outline-none"
                  />
                ) : (
                  <span className="truncate">{notebook.name}</span>
                )}
              </button>
              <span className="count-pill">{notebookCounts.get(notebook.id) ?? 0}</span>
              <button
                type="button"
                onClick={() => promptNotebookDeletion(notebook.id)}
                className="opacity-0 transition group-hover:opacity-100"
                aria-label={`Delete ${notebook.name}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--text-muted)] hover:text-[var(--danger)]" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--text-muted)]">Tags</p>
            <Tag className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="space-y-2">
            {allTags.length ? (
              allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setView({ type: "tag", tag });
                    setCompactPanel("list");
                  }}
                  className={clsx(
                    "sidebar-item",
                    view.type === "tag" && view.tag === tag && "sidebar-item-active",
                  )}
                >
                  <span>#{tag}</span>
                  <span className="count-pill">{tagCounts.get(tag) ?? 0}</span>
                </button>
              ))
            ) : (
              <p className="rounded-[1.5rem] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--text-muted)]">
                Tags appear here after you label your first note.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] p-4">
        <button
          type="button"
          onClick={() => {
            setView({ type: "trash" });
            setCompactPanel("list");
          }}
          className={clsx(
            "sidebar-item",
            view.type === "trash" && "sidebar-item-active",
          )}
        >
          <span className="inline-flex items-center gap-3">
            <Trash2 className="h-4 w-4" />
            Trash
          </span>
          <span className="count-pill">{trashCount}</span>
        </button>
      </div>
    </aside>
  );

  const renderNotesList = (mobile = false) => (
    <section className="panel-shell flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--text-muted)]">Browsing</p>
            <h2 className="mt-2 font-display text-4xl text-[var(--text-primary)]">
              {viewLabel(view, state.notebooks)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {mobile ? (
              <button
                type="button"
                onClick={() => setCompactPanel("sidebar")}
                className="rounded-full border border-[var(--border)] p-2 text-[var(--text-muted)] md:hidden"
                aria-label="Back to sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={createNote}
              className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold tracking-[0.18em] text-white shadow-[var(--shadow-glow)]"
            >
              + Note
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {filteredNotes.length} result{filteredNotes.length === 1 ? "" : "s"}
          {debouncedSearch ? ` for “${debouncedSearch}”` : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {filteredNotes.length ? (
          <div className="space-y-3">
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => {
                  setSelectedNoteId(note.id);
                  setCompactPanel("editor");
                }}
                className={clsx(
                  "note-card w-full text-left",
                  selectedNote?.id === note.id && "note-card-active",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-primary)]">
                      <HighlightedText text={note.title} query={debouncedSearch} />
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      {note.pinned ? "Pinned · " : ""}
                      {note.trashed ? "In Trash · " : ""}
                      {note.tags.slice(0, 2).map((tag) => `#${tag}`).join(" · ")}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--panel-soft)] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    {new Date(note.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-7 text-[var(--text-muted)]">
                  <HighlightedText text={getNotePreview(note)} query={debouncedSearch} />
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyPanel
            icon={view.type === "trash" ? <ArchiveRestore className="h-8 w-8" /> : <StickyNote className="h-8 w-8" />}
            title={view.type === "trash" ? "Trash is clear" : "Nothing matches yet"}
            body={
              view.type === "trash"
                ? "Deleted notes land here until you restore or remove them permanently."
                : debouncedSearch
                  ? "Try another search, switch filters, or create a fresh note."
                  : "Create the first note in this view and the list will come alive instantly."
            }
            actionLabel={view.type === "trash" ? undefined : "Create note"}
            onAction={view.type === "trash" ? undefined : createNote}
          />
        )}
      </div>
    </section>
  );

  const renderEditor = (mobile = false) => (
    <section className="flex h-full min-h-0 flex-col">
      {mobile ? (
        <div className="mb-3 flex items-center justify-between xl:hidden">
          <button
            type="button"
            onClick={() => setCompactPanel("list")}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2 text-sm text-[var(--text-primary)]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to notes
          </button>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Local only</p>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <NoteFlowEditor
          key={selectedNote?.id ?? "empty"}
          note={selectedNote}
          allTags={allTags}
          autoFocusTitle={pendingTitleFocusId === selectedNote?.id}
          storageWarning={persistenceStatus.storageMessage}
          isTrashView={view.type === "trash"}
          onClearAutoFocus={() => setPendingTitleFocusId(null)}
          onUpdate={updateNote}
          onTogglePin={togglePin}
          onTrashNote={moveNoteToTrash}
          onRestoreNote={restoreNote}
          onDeleteForever={deleteNoteForever}
          onExportMarkdown={exportAsMarkdown}
          onExportText={exportAsText}
        />
      </div>
    </section>
  );

  return (
    <div className="relative min-h-screen overflow-hidden px-3 py-3 sm:px-5 sm:py-5">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1700px] flex-col gap-4 sm:min-h-[calc(100vh-2.5rem)]">
        <header className="glass-card flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--text-muted)]">NoteFlow / v1</p>
            <div className="mt-2 flex items-center gap-4">
              <h1 className="font-display text-5xl leading-none text-[var(--text-primary)]">Editorial note space.</h1>
              <span className="hidden rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-1 text-xs tracking-[0.16em] text-[var(--text-muted)] sm:inline-flex">
                {formatBytes(persistenceStatus.usageBytes)} local
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:min-w-[420px] sm:max-w-[520px] sm:flex-1 sm:items-end">
            <div className="flex w-full items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  ref={searchRef}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search every title and note body..."
                  className="h-13 w-full rounded-full border border-[var(--border)] bg-[var(--panel-soft)] pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-strong)]"
                />
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-13 w-13 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-soft)] text-[var(--text-primary)] transition hover:-translate-y-px hover:border-[var(--accent-strong)]"
                aria-label="Toggle color theme"
              >
                {state.theme === "dark" ? <SunMedium className="h-5 w-5" /> : <MoonStar className="h-5 w-5" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              <span>Ctrl+N note</span>
              <span>·</span>
              <span>Ctrl+Shift+N notebook</span>
              <span>·</span>
              <span>Ctrl+F search</span>
              <span>·</span>
              <span>{REPO_NAME}</span>
            </div>
          </div>
        </header>

        <div className="hidden min-h-0 flex-1 xl:grid xl:grid-cols-[280px_340px_minmax(0,1fr)] xl:gap-4">
          {renderSidebar()}
          {renderNotesList()}
          {renderEditor()}
        </div>

        <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-4 xl:hidden">
          {renderSidebar()}
          {compactPanel === "editor" ? renderEditor(true) : renderNotesList()}
        </div>

        <div className="flex min-h-0 flex-1 md:hidden xl:hidden">
          {compactPanel === "sidebar" && renderSidebar(true)}
          {compactPanel === "list" && renderNotesList(true)}
          {compactPanel === "editor" && renderEditor(true)}
        </div>
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,12,24,0.62)] px-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md px-6 py-6">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--text-muted)]">Confirm action</p>
            <h2 className="mt-3 font-display text-4xl text-[var(--text-primary)]">{confirmState.title}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{confirmState.description}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmState.action}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  confirmState.tone === "danger" ? "bg-[var(--danger)]" : "bg-[var(--accent)]",
                )}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
