import TurndownService from "turndown";
import { formatDistanceToNowStrict } from "date-fns";

import type { Note, NoteFlowState, Theme } from "@/lib/noteflow/types";
import { createSampleState } from "@/lib/noteflow/sample-data";

export const STORAGE_KEY = "noteflow.v1";
export const REPO_NAME = "notes-turkey-001";
export const STORAGE_WARNING_BYTES = 4 * 1024 * 1024;
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

const markdownExporter = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

markdownExporter.addRule("task-item", {
  filter: (node) =>
    node.nodeName === "LI" &&
    node instanceof HTMLElement &&
    node.dataset.type === "taskItem",
  replacement: (_content, node) => {
    if (!(node instanceof HTMLElement)) {
      return "";
    }

    const checked = node.dataset.checked === "true";
    const label = node.querySelector("div")?.textContent?.trim() ?? node.textContent?.trim() ?? "";
    return `- [${checked ? "x" : " "}] ${label}\n`;
  },
});

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function resolveInitialTheme() {
  if (typeof window === "undefined") {
    return "dark" as Theme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function loadState() {
  const fallbackTheme = resolveInitialTheme();

  if (typeof window === "undefined") {
    return createSampleState(fallbackTheme);
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return createSampleState(fallbackTheme);
  }

  try {
    const parsed = JSON.parse(stored) as NoteFlowState;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.notebooks) || !Array.isArray(parsed.notes)) {
      return createSampleState(fallbackTheme);
    }

    return parsed;
  } catch {
    return createSampleState(fallbackTheme);
  }
}

export function persistState(state: NoteFlowState) {
  const payload = JSON.stringify(state);
  window.localStorage.setItem(STORAGE_KEY, payload);
  return payload;
}

export function bytesOf(value: string) {
  return new Blob([value]).size;
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(2)} MB`;
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|h1|h2|h3|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function getNotePreview(note: Note) {
  const text = htmlToPlainText(note.contentHtml);
  if (!text) {
    return "No content yet.";
  }

  return text.length > 100 ? `${text.slice(0, 100).trim()}...` : text;
}

export function getRelativeTime(timestamp: string) {
  return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true });
}

export function normalizeTag(tag: string) {
  return tag.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase();
}

export function dedupeTags(tags: string[]) {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean))).sort();
}

export function noteMatchesQuery(note: Note, query: string) {
  if (!query) return true;
  const haystack = `${note.title} ${htmlToPlainText(note.contentHtml)}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function sortNotes(notes: Note[]) {
  return [...notes].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function exportMarkdown(note: Note) {
  return markdownExporter.turndown(note.contentHtml || "<p></p>");
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
