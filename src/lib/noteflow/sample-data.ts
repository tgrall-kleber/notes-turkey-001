import type { Note, NoteFlowState, Theme } from "@/lib/noteflow/types";

const now = new Date("2026-03-04T09:00:00.000Z");

function stamp(minutesOffset: number) {
  return new Date(now.getTime() + minutesOffset * 60_000).toISOString();
}

const sampleNotebookId = "nb-studio";

const sampleNotes: Note[] = [
  {
    id: "note-kickoff",
    notebookId: sampleNotebookId,
    title: "Project kickoff ritual",
    contentHtml: `
      <h2>Weekly pulse</h2>
      <p>NoteFlow is designed for fast capture, thoughtful structure, and <strong>zero-friction organization</strong>.</p>
      <blockquote>
        <p>Open the app, start writing, keep everything on your device.</p>
      </blockquote>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="true">
          <label><input type="checkbox" checked="checked"><span></span></label>
          <div><p>Collect meeting actions</p></div>
        </li>
        <li data-type="taskItem" data-checked="false">
          <label><input type="checkbox"><span></span></label>
          <div><p>Draft the next sprint outline</p></div>
        </li>
        <li data-type="taskItem" data-checked="false">
          <label><input type="checkbox"><span></span></label>
          <div><p>Tag notes for follow-up</p></div>
        </li>
      </ul>
      <hr />
      <p>Use notebooks for topics, tags for cross-cutting threads, and pin the notes you revisit most.</p>
    `,
    tags: ["work", "planning"],
    pinned: true,
    trashed: false,
    deletedAt: null,
    createdAt: stamp(0),
    updatedAt: stamp(16),
  },
  {
    id: "note-ideas",
    notebookId: sampleNotebookId,
    title: "Ideas worth protecting",
    contentHtml: `
      <h2>Three small bets</h2>
      <ol>
        <li><strong>Office hours</strong> with a weekly prompt.</li>
        <li><em>Decision notes</em> after every stakeholder meeting.</li>
        <li>A compact launch checklist that lives in every project notebook.</li>
      </ol>
      <pre><code>Launch = clarity + momentum + ruthless follow-through</code></pre>
      <p>Search is instant, notes are local, and exports are always one click away.</p>
    `,
    tags: ["ideas", "systems"],
    pinned: false,
    trashed: false,
    deletedAt: null,
    createdAt: stamp(22),
    updatedAt: stamp(38),
  },
  {
    id: "note-reflection",
    notebookId: sampleNotebookId,
    title: "What a calm workspace feels like",
    contentHtml: `
      <h3>Signals of a good note system</h3>
      <ul>
        <li>Fast enough that you never postpone writing.</li>
        <li>Structured enough that you can rediscover anything later.</li>
        <li>Quiet enough that the interface gets out of the way.</li>
      </ul>
      <p><s>Over-designed dashboards</s> are less useful than a disciplined editor, good filters, and thoughtful defaults.</p>
    `,
    tags: ["journal", "clarity"],
    pinned: false,
    trashed: false,
    deletedAt: null,
    createdAt: stamp(44),
    updatedAt: stamp(61),
  },
];

export function createSampleState(theme: Theme): NoteFlowState {
  return {
    schemaVersion: 1,
    theme,
    notebooks: [
      {
        id: sampleNotebookId,
        name: "Studio Notebook",
        createdAt: stamp(-5),
        updatedAt: stamp(61),
      },
    ],
    notes: sampleNotes,
  };
}
