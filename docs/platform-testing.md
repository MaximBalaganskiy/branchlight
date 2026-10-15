# Desktop platform validation

Branchlight is a preview. CI builds Windows x64 and Linux x64 from a clean checkout. Build success alone does not establish desktop compatibility.

## Automated desktop checks

Windows: `npm --prefix app run test:e2e` runs the packaged Tauri application through WebView2 using isolated repositories and profiles. It covers repository browsing, Git workflows, merge editing and draft recovery, structural conflicts, repository tools, staging, keyboard shortcuts, window persistence, busy/error states, and diff selection/copying.

Linux: `npm --prefix app run test:linux` drives the native WebKitGTK application through `tauri-driver` 2.1.0 and `WebKitWebDriver`. The release workflow runs it under Xvfb with `GDK_BACKEND=x11`, then under a headless Weston compositor with `GDK_BACKEND=wayland` and `DISPLAY` unset. It checks graph loading, branch search, a separate commit window, staging, Ctrl+Enter committing, Git results, and successful window closure. Screenshots are retained as short-lived CI evidence.

These Linux smoke tests are narrower than the Windows suite. They do not establish compatibility with every desktop, GPU, or compositor.

Both native Linux smoke tests passed on 16 October 2026 before the privacy rewrite. The old Actions run and its logs were deleted during that cleanup; this historical result is not retained as independently accessible CI evidence. The Windows desktop cases also passed locally after updating validation assertions and measuring splitter limits against the Headless form height. Release jobs rerun these checks for the tagged commit.

## Before claiming GNOME/KDE desktop validation

Run the downloaded AppImage and Debian package on actual GNOME and KDE sessions. Record OS, compositor/version, GPU, scale factor, package, and release SHA. Use disposable repositories.

- Verify both native Wayland and X11 launches, including a non-English filesystem path.
- Drag/resize the undecorated windows; test maximize, minimize, closing, and restoring size after restart.
- Open the native directory chooser; select and switch repositories.
- Copy selected diff/file code and paste into an external editor. Check Ctrl+A stays within the editor.
- Stage, commit, and complete a conflicting merge in the separate window. Check keyboard focus and closure.
- Check 100%, 150%, and 200% scale factors and moving between monitors.
- Exercise an authentication failure and successful credential-helper operation with a test remote.

This physical-desktop matrix remains pending. Do not describe it as passed based on CI, WSLg, or browser-only tests.
