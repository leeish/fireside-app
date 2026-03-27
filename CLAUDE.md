# Fireside — Claude Code Instructions

## Git commits

**Never add `Co-Authored-By` or any Claude/AI attribution to commit messages.**

Vercel permanently blocks deployment if it detects a non-collaborator author on any commit. Once flagged, the entire Vercel project must be deleted and recreated. This has already happened once.

Before every commit, verify the message contains no `Co-Authored-By`, `Co-authored-by`, or any `noreply@anthropic.com` lines.

Commit messages should be plain text only — subject line + optional bullet body. No trailers.

## Deployment

Pushing to `main` triggers an automatic Vercel deployment. No manual deploy step needed.

## External services

Before writing any code that integrates with an external service (Resend, Inngest, Supabase, OpenAI, etc.), check their current docs first. Do not assume payload shapes, API behavior, or feature availability. Ask the user to paste relevant docs or fetch them directly if possible.
