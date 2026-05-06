# NoteFlow

NoteFlow is a private, zero-setup note workspace built from the PRD for this task. It runs entirely in the browser and ships as a static Next.js 16 site with rich editing, notebooks, tags, search, trash recovery, local persistence, sample data, responsive layouts, and GitHub Pages deployment.

## Stack

- Next.js 16 App Router with static export
- React 19 + TypeScript
- Tailwind CSS v4
- Tiptap rich text editor
- localStorage persistence
- GitHub Actions + GitHub Pages deployment

## Local development

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Scripts

- `pnpm dev` - start the development server
- `pnpm lint` - run ESLint
- `pnpm build` - create the static export in `out/`

## GitHub Pages

The repository includes `.github/workflows/deploy.yml`, which builds the project and publishes the `out/` directory to GitHub Pages on every push to `main`.

Production assets are served from:

```txt
/notes-turkey-001/
```

That base path is already configured in `next.config.ts`.

## Core features

- 3-panel note workflow with compact tablet/mobile navigation
- Notebook creation, renaming, deletion, and note counts
- Rich editing with headings, bold, italic, strike, lists, task lists, code blocks, blockquotes, and dividers
- Debounced autosave with local-only persistence
- Tag chips, sidebar filters, and full-text search
- Trash with restore and permanent delete
- Per-note Markdown and plain text export
- Dark/light theme toggle and system-theme first load
