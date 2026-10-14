# Branchlight

A local desktop Git client built with **Aurelia 2**, **aurelia-headless**, its shipped Tailwind theme, and **Tauri 2**. Inspired by GitExtensions' commit graph and separate staging window.

## Run

Open `app/release/windows/Branchlight.exe` after packaging, or run from source:

```powershell
npm --prefix app ci
npm start
```

Development requires Node 24+, Rust, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). On Windows, install the Visual Studio C++ build tools and Windows SDK. Install Git on PATH (or set `BRANCHLIGHT_GIT` to its executable). The desktop app uses your installed Git, identity, SSH configuration, and credential helpers. Remote authentication must already be configured. This preview does not provide a login wizard.

The Windows executable embeds the bundled, minified UI and uses the shared WebView2 runtime. The NSIS installer downloads WebView2 if it is missing. Neither Node nor Git is bundled. Linux uses WebKitGTK; build Linux packages on Linux with `npm --prefix app run pack:linux`. Linux packaging and native Git integration tests are validated in GitHub Actions; interactive Linux desktop behavior has not yet been validated.

Measured Windows x64 release (14 October 2026): **3.64 MiB** executable, **1.44 MiB** installer. Loading 300 commits and the initial diff from the headless repository took approximately **1.5 seconds** on this development machine, using both fresh and existing WebView2 profiles. These artifact sizes exclude the shared WebView2 runtime and installed Git.

## Included

- Commit graph with branch lanes, merge connections, refs, author, date, and SHA.
- Local branches, remote branches, tags, commit search, and paginated history (up to 100,000 commits). Selecting an unloaded branch tip automatically expands history and scrolls to it.
- Headless reference tree groups slash-separated branch and tag names into folders, with remotes grouped by name. Arrow keys navigate the tree; search reveals matching paths and clearing it restores collapsed folders.
- Changed files, syntax-highlighted unified diffs using Lowlight/highlight.js, full commit messages, and a Git command log.
- Files tab with the complete selected commit's file tree and highlighted historical contents, including unchanged files. Binary files and submodule pointers show an explanatory preview; text previews are limited to 2 MiB and 12,000 lines.
- Filename filtering and search within historical file contents, with a search icon inside each input.
- Context menus on commits and references for browsing, copying, creating branches, checking out, and merging.
- A separate native desktop window for staging, unstaging, reviewing, and committing whole files.
- Stage or unstage selected lines and complete hunks in modified UTF-8 text files. The working file stays intact; stale diffs are rejected. Added/deleted/renamed files, mode changes, binary files, links, and submodules still use whole-file staging.
- Flat/tree staging lists, changed-file filtering, and an action to ignore an untracked file. Ignore rules escape pattern characters; the resulting `.gitignore` edit remains unstaged for review.
- Commit drafts saved per repository; changes synchronize between open windows.
- Commit-message dropdown with recent messages, the repository's configured `commit.template`, and named templates saved in the app.
- Amend the last commit, including message-only corrections, with a review prompt. Undo a normal last commit with a soft reset, retaining index and working files; root and merge commits are excluded. Both operations reject a changed HEAD and warn about rewriting published history.
- Stash tracked changes and optionally untracked files, inspect saved diffs, apply/pop with the saved index state, and confirm deletion. Apply/pop require a clean working tree; failed application retains the stash.
- Merge into the current branch, review before committing, and abort a merge. The conflict dialog shows the common ancestor and both sides, accepts an edited result, or stages a whole side. Text editing is limited to UTF-8 files up to 1 MiB; externally resolved text can also be marked resolved.
- Worktree list with create-on-new-branch, open, and remove actions. Removal preserves the branch and refuses dirty, current, main, or locked worktrees.
- Create and switch local branches, add/edit/remove remotes, fetch, fast-forward pull, and push to the configured upstream. Push opens a publishing dialog when no upstream exists; choose the remote and destination branch. Remote removal confirms the name and removes its local tracking references without deleting the server repository.
- Compact repository-name menu in the top bar switches between recent repositories and opens new ones. Full paths distinguish identical folder names.
- Resizable panes, light/dark themes, Normal/Compact density, recent repositories, and keyboard shortcuts. Normal density is the default; appearance choices are saved and synchronized between windows.
- Main and commit windows remember their size, position, and maximized state separately across launches. Commit windows share their layout across repositories; unavailable monitors fall back to OS placement.

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Open repository |
| Ctrl+K | Open commit window |
| F5 | Refresh |
| Enter in commit search | Select next match |
| Ctrl+Enter in commit window | Commit staged files |

Branch switching currently requires a clean working tree. Clicking a branch name selects its tip; the arrow beside a different local branch checks it out. Merge commit changes are compared with the first parent.

## Preview scope

This is an initial usable version, not full GitExtensions parity. Clone/init UI, rebase/cherry-pick/revert controls, interactive rebase, general reset, branch rename/delete, and advanced remote configuration are not implemented. Conflict resolution is a whole-file text editor and side selection, without a visual hunk-by-hunk merge editor. Partial staging is unavailable for truncated previews. Use the terminal or another client for unsupported operations. Untracked text previews are limited to 1 MB; rendered diffs are limited to 12,000 lines. Repository changes are refreshed on focus, after an app operation, and every eight seconds while focused.

## Development

### Automated binaries and releases

The **Build desktop binaries** GitHub Actions workflow builds Windows x64 and Linux x64 on every push to `main`, pull request, or manual run. Each build runs formatting, source checks, renderer tests, Git integration tests, and Clippy before packaging. Download the two platform artifacts from the workflow run; they are retained for 14 days.

Push a version tag such as `v0.1.0` to publish a GitHub Release after both platforms pass. The tag must match the versions in `app/package.json`, `app/src-tauri/tauri.conf.json`, and `app/src-tauri/Cargo.toml`. Tags containing a suffix such as `-beta.1` create prereleases. Releases contain:

- `Branchlight.exe`: Windows executable.
- `Branchlight_<version>_x64-setup.exe`: Windows NSIS installer.
- Linux `.AppImage` and `.deb` packages.
- `SHA256SUMS.txt`: checksums for all four downloads.

Release assets remain available independently of Actions artifact retention and inherit the repository's private visibility. Windows binaries are unsigned. Git must be installed separately; Windows uses the shared WebView2 runtime. On Linux, mark the downloaded AppImage executable with `chmod +x *.AppImage`. Linux packages are built on Ubuntu 22.04 for compatibility with systems providing WebKitGTK 4.1.

### Local commands

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
