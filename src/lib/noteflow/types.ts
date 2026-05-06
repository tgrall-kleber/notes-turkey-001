export type Theme = "light" | "dark";

export type ViewSelection =
  | { type: "all" }
  | { type: "notebook"; notebookId: string }
  | { type: "tag"; tag: string }
  | { type: "trash" };

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  notebookId: string;
  title: string;
  contentHtml: string;
  tags: string[];
  pinned: boolean;
  trashed: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteFlowState {
  schemaVersion: 1;
  theme: Theme;
  notebooks: Notebook[];
  notes: Note[];
}
