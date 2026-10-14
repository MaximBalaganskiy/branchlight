# Branchlight

A local desktop Git client built with **Aurelia 2**, **aurelia-headless**, its shipped Tailwind theme, and **Tauri 2**. Inspired by GitExtensions' commit graph and separate staging window.

## Run

Open `app/release/windows/Branchlight.exe` after packaging, or run from source:

```powershell
npm --prefix app ci
npm start
```

Development requires Node 24+, Rust, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). On Windows, install the Visual Studio C++ build tools and Windows SDK. Install Git on PATH (or set `BRANCHLIGHT_GIT` to its executable). The desktop app uses your installed Git, identity, SSH configuration, and credential helpers. Remote authentication must already be configured. This preview does not provide a login wizard.

The Windows executable embeds the bundled, minified UI and uses the shared WebView2 runtime. The NSIS installer downloads WebView2 if it is missing. Neither Node nor Git is bundled. Linux uses WebKitGTK; build Linux packages on Linux with `npm --prefix app run pack:linux`. Linux packaging and desktop behavior have not yet been validated.

Measured Windows x64 release (14 October 2026): **3.46 MiB** executable, **1.38 MiB** installer. Loading 300 commits and the initial diff from the headless repository took approximately **1.5 seconds** on this development machine, using both fresh and existing WebView2 profiles. These artifact sizes exclude the shared WebView2 runtime and installed Git.

## Included

- Commit graph with branch lanes, merge connections, refs, author, date, and SHA.
- Local branches, remote branches, tags, commit search, and paginated history (up to 100,000 commits). Selecting an unloaded branch tip automatically expands history and scrolls to it.
- Headless reference tree groups slash-separated branch and tag names into folders, with remotes grouped by name. Arrow keys navigate the tree; search reveals matching paths and clearing it restores collapsed folders.
- Changed files, syntax-highlighted unified diffs using Lowlight/highlight.js, full commit messages, and a Git command log.
- A separate native desktop window for staging, unstaging, reviewing, and committing whole files.
- Commit drafts saved per repository; changes synchronize between open windows.
- Create and switch local branches, add remotes and edit their URLs, fetch, fast-forward pull, and push to an existing upstream.
- Resizable panes, light/dark themes, Normal/Compact density, recent repositories, and keyboard shortcuts. Normal density is the default; appearance choices are saved and synchronized between windows.

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Open repository |
| Ctrl+K | Open commit window |
| F5 | Refresh |
| Enter in commit search | Select next match |
| Ctrl+Enter in commit window | Commit staged files |

Branch switching currently requires a clean working tree. Clicking a branch name selects its tip; the arrow beside a different local branch checks it out. Merge commit changes are compared with the first parent.

## Preview scope

This is an initial usable version, not full GitExtensions parity. Hunk/line staging, clone/init UI, stash management, merge/rebase/cherry-pick controls, conflict resolution, amend, interactive rebase, history rewriting, and advanced remote configuration are not implemented. Use the terminal or another client for these operations. Untracked text previews are limited to 1 MB; rendered diffs are limited to 12,000 lines. Repository changes are refreshed on focus, after an app operation, and every eight seconds while focused.

## Development

```powershell
npm run build       # TypeScript checks and production renderer
npm test            # Rust Git integration, graph, and highlighting tests
npm run pack        # Native release executable with embedded frontend
npm run test:e2e    # Real Windows WebView2 staging/commit workflow
npm --prefix app run pack:installer # Windows NSIS installer
npm --prefix app run pack:linux     # Linux .deb and AppImage (run on Linux)
npm --prefix app run test:packaged  # Check the packaged desktop workflow
npm --prefix app run check:conventions
npm --prefix app run check:native
npm --prefix app run format:check
```

Tests create disposable repositories under `.test-repos/` or the OS temporary directory; they do not modify your working repositories. Desktop smoke-test screenshots are written to `app/test-results/`. `npm --prefix app run dev` runs only the renderer in a browser; filesystem and Git operations require the desktop app. The Windows smoke test enables WebView2 debugging only for its isolated test process and profile.

The renderer invokes a fixed set of Rust commands. Rust owns each window's repository path and launches Git with argument arrays, literal pathspecs, and no shell interpolation. There is no generic shell or filesystem API exposed to the UI. Git hooks and signing behave as configured in the repository. Same-repository windows receive change events after Git operations.

Source layout: `app/src/views/` contains folder-based views; `elements/` contains reusable components; `services/` contains workspace, graph, diff, and Tauri bridge logic; `interfaces/` has one contract per file. `app/src-tauri/src/` contains the native shell, commands, Git service, and individual model files. Native integration tests are in `app/src-tauri/tests/`; renderer and desktop tests are in `app/test/`.

Build caches (`app/src-tauri/target/`), `node_modules`, and optional workspace toolchains (`.toolchains/`) are development files, not distribution contents. `scripts/native.cjs` uses the workspace Rust/compiler fallback when present and otherwise uses the installed toolchain. Packaging copies the executable into `app/release/windows/` or `app/release/linux/` and installer packages directly into `app/release/`. Only these collected artifacts need distributing.

Headless supplies buttons, inputs, tabs, splitters, dialogs, and service-created toast notifications. The app imports `@aurelia-ui-toolkits/headless-tailwind` and uses its Normal and Compact density tokens, with inset field labels enabled globally. Templates use inline Tailwind layout utilities; reusable app selectors use nested CSS. `AGENTS.md` and the formatter record these conventions.
