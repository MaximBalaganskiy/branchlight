# Publication review — 16 October 2026

## Scope and evidence

The initial scan covered all 38 commits reachable from local branches/tags, including removed Electron sources. Gitleaks 8.30.1, verified against the upstream SHA-256 checksum, reported zero findings with `git . --log-opts='--all --full-history' --redact`. Reports are kept locally under the ignored test-results directory. This is a pattern-based scan, not a guarantee that every secret or confidential detail has been identified.

Current tracked files consist of application source, tests, build configuration, documentation, lockfiles, and project icons. Dependency caches, private test repositories, webview profiles, and development screenshots are ignored. Public documentation screenshots must come from disposable synthetic fixtures, not real repositories.

History was rewritten to use the Branchlight contributors project identity and remove personal contact details and private development references. Published dependency copyright notices are preserved. The GitHub account name and repository URL still identify the owner. The original GitHub repository was deleted and recreated privately on 16 October 2026. Only the cleaned main branch and five rewritten release tags were pushed; old releases, pull requests, Actions runs, and caches were not restored. The previously accessible old tip is no longer retrievable through the new repository's commit API. This does not guarantee erasure from GitHub's internal backups or existing clones. The ignored local recovery backup retains the previous history.

## Dependency review

The source uses MIT. The Rider Visual Studio Code Dark Plus 2.9.0 palette uses BSD-3-Clause. Exact upstream notice sources are recorded under `licenses/upstream/`. Renderer and Windows/Linux Rust dependencies are inventoried in THIRD_PARTY_NOTICES.txt, with exact source archive links and full license texts. Git and WebView2 are installed separately. Linux AppImage shared-library notices are collected from the packaging host.

The npm audit reported zero advisories. Cargo audit 0.22.2 reported zero vulnerability entries and two informational warnings: **RUSTSEC-2024-0370**, the unmaintained transitive build dependency `proc-macro-error` 1.0.4; and **RUSTSEC-2024-0429**, unsound `glib::VariantStrIter` methods in `glib` 0.18.5. **GitHub classified the GLib advisory as medium severity in the original repository; recreating the repository does not fix the dependency.** The latter enters through Tauri's Linux GTK stack; Branchlight does not directly use this iterator. This does not prove the entire transitive stack is unaffected. The fixed GLib API is 0.20+, which is not a drop-in replacement for GTK 0.18. Track an upstream-compatible fix; warnings are retained in CI rather than hidden with ignores.

## Remaining external checks

Actual GNOME/KDE, GPU/scaling, cross-application clipboard, and native chooser validation remain pending; see [platform testing](platform-testing.md). GitHub branch protection and private vulnerability reporting require a supported plan/visibility. Windows signing requires publisher credentials. Repository visibility is deliberately unchanged.
