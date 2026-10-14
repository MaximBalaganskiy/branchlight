# Branchlight

A local desktop Git client built with **Aurelia 2**, **aurelia-headless**, Electron, and Dugite. Inspired by GitExtensions' commit graph and separate staging window; implemented from scratch.

## Run

Open `app/release/Branchlight 0.1.0.exe` for the portable Windows build, or run from source:

```powershell
npm --prefix app ci
npm start
```

Node 24 or later is recommended for development. The desktop app bundles Git through Dugite. No account is required. Existing Git identity, SSH configuration, and credential helpers are used; remote authentication must already be configured. This preview does not provide a login wizard.

## Included

- Commit graph with branch lanes, merge connections, refs, author, date, and SHA.
- Local branches, remote branches, tags, commit search, and paginated history (up to 5,000 commits).
- Changed files, unified diffs, full commit messages, and a Git command log.
- A separate native desktop window for staging, unstaging, reviewing, and committing whole files.
- Commit drafts saved per repository; changes synchronize between open windows.
- Create and switch local branches, fetch, fast-forward pull, and push to an existing upstream.
- Resizable panes, light/dark themes, recent repositories, and keyboard shortcuts.

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Open repository |
| Ctrl+K | Open commit window |
| F5 | Refresh |
| Enter in commit search | Select next match |
| Ctrl+Enter in commit window | Commit staged files |

Branch switching currently requires a clean working tree. Clicking a branch name selects its tip; the arrow beside a different local branch checks it out. Merge commit changes are compared with the first parent.

## Preview scope

This is an initial usable version, not full GitExtensions parity. Hunk/line staging, clone/init UI, stash management, merge/rebase/cherry-pick controls, conflict resolution, amend, interactive rebase, history rewriting, and remote configuration are not implemented. Use the terminal or another client for these operations. Untracked text previews are limited to 1 MB; rendered diffs are limited to 12,000 lines. Repository changes are refreshed on focus, after an app operation, and every eight seconds while focused.

## Development

```powershell
npm run build       # TypeScript checks and production renderer
npm test            # Git integration and graph tests
npm run test:e2e    # Real Electron staging/commit workflow
npm run pack        # Portable Windows executable
```

Tests create disposable repositories under `.test-repos/`; they do not modify your working repositories. Electron smoke-test screenshots are written to `app/test-results/`. `npm --prefix app run dev` runs only the renderer in a browser; filesystem and Git operations require the desktop app.

The renderer has no Node access. A sandboxed preload exposes a fixed IPC API, and the main process owns repository paths and Git execution. Arguments are passed as arrays through Dugite, with literal pathspecs and no shell interpolation. Git hooks and signing behave as configured in the repository.

Source layout: `app/src/` contains the Aurelia UI and graph layout; `app/electron/` contains the Electron shell, preload bridge, and Git service; `app/test/` contains the tests.
