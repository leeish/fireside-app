# Fireside — Claude Code Instructions

## Git commits

**Never add `Co-Authored-By` or any Claude/AI attribution to commit messages.**

Vercel permanently blocks deployment if it detects a non-collaborator author on any commit. Once flagged, the entire Vercel project must be deleted and recreated. This has already happened once.

Before every commit, verify the message contains no `Co-Authored-By`, `Co-authored-by`, or any `noreply@anthropic.com` lines.

Commit messages should be plain text only — subject line + optional bullet body. No trailers.

## Deployment

Pushing to `main` triggers an automatic Vercel deployment. No manual deploy step needed.
