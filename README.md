# Branchlight

A local desktop Git client built with **Aurelia 2**, **aurelia-headless**, its shipped Tailwind theme, and Electron. Inspired by GitExtensions' commit graph and separate staging window.

## Run

Open `app/release/win-unpacked/Branchlight.exe` after packaging, or run from source:

```powershell
npm --prefix app ci
npm start
```

Node 24 or later is recommended for development. Install Git on PATH (or set `BRANCHLIGHT_GIT` to its executable). The desktop app uses your installed Git, identity, SSH configuration, and credential helpers. Remote authentication must already be configured. This preview does not provide a login wizard.

The default package is an executable folder, avoiding a portable wrapper's extraction on each launch. The renderer is bundled and minified, and build-only dependencies are excluded. Electron still includes Chromium and Node; this is not a small native-webview distribution. Linux packaging has not been validated.

## Included

- Commit graph with branch lanes, merge connections, refs, author, date, and SHA.
- Local branches, remote branches, tags, commit search, and paginated history (up to 5,000 commits).
- Changed files, syntax-highlighted unified diffs using Lowlight/highlight.js, full commit messages, and a Git command log.
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
npm run pack        # Direct Windows executable folder
npm --prefix app run test:packaged  # Check the packaged desktop workflow
npm --prefix app run check:conventions
npm --prefix app run format:check
```

Tests create disposable repositories under `.test-repos/`; they do not modify your working repositories. Electron smoke-test screenshots are written to `app/test-results/`. `npm --prefix app run dev` runs only the renderer in a browser; filesystem and Git operations require the desktop app.

The renderer has no Node access. A sandboxed preload exposes a fixed IPC API, and the main process owns repository paths and Git execution. Git is launched using Node's `execFile`, with argument arrays, literal pathspecs, and no shell interpolation. Git hooks and signing behave as configured in the repository.

Source layout: `app/src/views/` contains folder-based views; `elements/` contains reusable components; `services/` contains workspace, graph, and diff logic; `interfaces/` has one contract per file. `app/electron/` contains the shell, preload bridge, and Git service; `app/test/` contains tests.

Headless supplies buttons, inputs, tabs, splitters, dialogs, and service-created toast notifications. The app imports `@aurelia-ui-toolkits/headless-tailwind` and changes compact desktop density through its tokens. Templates use inline Tailwind layout utilities; reusable app selectors use nested CSS. `AGENTS.md` and the formatter record these conventions.
