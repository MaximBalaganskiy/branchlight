# Security policy

Security fixes target the latest preview release. Older previews are not maintained separately.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** page when private vulnerability reporting is available. If that option is unavailable, ask for a private reporting channel without including vulnerability details in the public request.

Include the version, operating system, reproduction steps using a disposable repository, expected impact, and a minimal example where possible. Remove credentials and private repository contents. Do not open a public issue for an undisclosed vulnerability. There is no guaranteed response time or paid bounty program.

## Trust boundaries

Branchlight runs your installed Git with your account's permissions. Git hooks, filters, credential helpers, SSH commands, signing tools, and submodule transport policies follow your Git configuration. Only operate on repositories and configurations you trust.

Repository history, paths, commit-message templates, and conflict drafts can contain private information. Recent repository paths and window state are stored in the app data directory; editor preferences and drafts are stored in its webview profile. The command log and screenshots may expose paths, remote URLs, and source code. Review them before sharing a report.

The UI has a fixed native command interface, restrictive navigation and content security policies, and no generic shell API. These measures do not sandbox Git or turn untrusted repositories into safe ones.

Release checksums detect mismatched downloads; they are not publisher signatures. Windows preview binaries are currently unsigned.
