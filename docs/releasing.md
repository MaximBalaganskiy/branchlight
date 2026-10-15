# Release procedure

## Preview releases

Keep versions aligned in `app/package.json`, `app/package-lock.json`, `app/src-tauri/Cargo.toml`, `app/src-tauri/Cargo.lock`, and `app/src-tauri/tauri.conf.json`. A suffix such as `0.4.0-beta.1` creates a GitHub prerelease.

1. Run `npm --prefix app ci`, build/test/format/convention/Clippy checks, and the actual Windows desktop suite.
2. Run `npm --prefix app run notices` after lockfile changes. It uses installed npm packages and Cargo metadata for Windows/Linux. Review new license expressions and missing-license overrides under `licenses/upstream/`; keep exact source URLs. Never invent copyright notices. The generated inventory includes exact-version source links for MPL components. Linux packaging also inventories shared/static libraries, type information and schemas from Ubuntu, plus the AppImage runtime and launcher notices in `linux-sources.json`. A changed AppImage runtime revision requires reviewing those notices before the packaging check can pass.
3. Run Gitleaks against all history and `npm audit` / `cargo audit` against both lockfiles. Review informational Rust warnings as well as failing advisories. Do not suppress new findings without recording a reason.
4. Push the candidate commit and require successful **Build windows x64**, **Build linux x64**, and **Security checks**. The platform jobs build from clean checkouts and run native desktop tests. Review screenshots and failures.
5. Tag that exact tested commit with `v<version>` and push the tag. The release job waits for both platform builds and the security job. Confirm the four binaries, license, dependency notices, Linux runtime notices, and checksums appear on the release.
6. Download and verify release checksums. Keep the preview and unsigned-Windows notices visible. Update platform claims only with recorded evidence.

GitHub releases inherit repository visibility. Publishing a prerelease does not make this repository public.

## Before changing repository visibility

Review the complete Git history, commit metadata, old release attachments, screenshots, workflow artifacts, issue content, and remote URLs. Secret scanners do not identify all confidential business information. Author names and email addresses in commits become public along with the history. Do not rewrite history or delete releases without explicit agreement.

The source license is [MIT](../LICENSE). Third-party code retains the notices in [THIRD_PARTY_NOTICES.txt](../THIRD_PARTY_NOTICES.txt). The app icon is project-owned; the Rider Dark Plus palette retains its BSD-3-Clause notice. GitExtensions is a workflow inspiration, not a bundled dependency.

## GitHub settings after visibility changes

The current private repository plan does not support branch protection, and its private vulnerability reporting endpoint is unavailable. These are GitHub availability restrictions, not completed settings.

After an explicitly authorized visibility change (or a plan upgrade), enable:

- Main-branch protection: require the three checks above, require up-to-date branches, block force pushes and deletion. Use pull requests for subsequent work.
- Private vulnerability reporting under Security; until enabled, the email in SECURITY.md is the reporting channel.
- Secret scanning and push protection where available. Dependabot alerts and security updates are already enabled; the repository configuration also schedules npm, Cargo, and Actions updates.
- Keep Actions default token permissions read-only and PR approval permissions disabled. Workflow actions are pinned to full commit SHAs.

Windows signing needs a publisher certificate or signing-service account. No certificate is configured; binaries remain unsigned. Do not claim checksum files provide publisher authentication.
