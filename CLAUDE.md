# Fireside — Claude Code Instructions

## Git commits

**Never add `Co-Authored-By` or any Claude/AI attribution to commit messages.**

Vercel permanently blocks deployment if it detects a non-collaborator author on any commit. Once flagged, the entire Vercel project must be deleted and recreated. This has already happened once.

Before every commit, verify the message contains no `Co-Authored-By`, `Co-authored-by`, or any `noreply@anthropic.com` lines.

Commit messages should be plain text only — subject line + optional bullet body. No trailers.

## Deployment

Pushing to `main` triggers an automatic Vercel deployment. No manual deploy step needed.

After every push, wait 60 seconds then check the deployment status via the GitHub deployments API (`gh api repos/leeish/fireside-app/deployments`) and fetch the latest deployment's statuses to confirm it reached `success`. If it failed, read the build logs immediately and fix the issue before doing anything else.

## External services

Before writing any code that integrates with an external service (Resend, Inngest, Supabase, OpenAI, etc.), check their current docs first. Do not assume payload shapes, API behavior, or feature availability. Ask the user to paste relevant docs or fetch them directly if possible.

If an integration with a third-party tool or library fails after one attempt, stop and check the docs before trying again. Do not guess at a second fix.
