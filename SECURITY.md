# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting:
**Security → Report a vulnerability** on <https://github.com/itxahmaddev/viex/security/advisories/new>.

Include what you found, how to reproduce it, and the version (`vX.Y.Z`). You will get a response as soon as the maintainers can.

## Scope notes

- VIEX is view-only by design. A way to send input to a Host would be a serious bug — please report it.
- The **live indicator** on the Host must remain visible during every session in every permission mode. A way to hide or bypass it is a security issue.
- Relay authentication (password, tokens, rate limiting) and the signaling protocol are in scope.
- Keep secrets (`VIEX_PASSWORD`, TURN credentials, signing keys) out of git and out of issue reports.
- The Android APK in releases is signed with a **public community keystore** unless the repository defines its own signing secrets; do not treat the signature as proof of origin.
