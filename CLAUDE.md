# CLAUDE.md — Developer Guidelines & Project Information

## Overview
This repository contains automated tooling and API endpoints for querying Instagram story metadata from a Supabase PostgreSQL database, downloading story images, uploading them into a specified Google Drive folder, and updating the database records with Google Drive web view links.

## Project Structure
- `sync_insta_stories.py`: Python CLI batch sync tool.
- `supabase/functions/sync-insta-stories/index.ts`: Supabase Edge Function API endpoint (Deno / TypeScript).
- `supabase/migrations/20260917_cron_sync_insta_stories.sql`: SQL script for 7:00 AM PH Time (23:00 UTC) daily cron schedule (`pg_cron` + `pg_net`).
- `requirements.txt`: Python dependencies (`supabase`, `google-api-python-client`, `requests`, `python-dotenv`).
- `.env.example`: Environment variable template.
- `.agents/skills/dcp/SKILL.md`: Workspace `/dcp` documentation skill.
- `chat_history/`: Exported chat histories.
- `as_built.txt`: Living project inventory.

## Deploying the Supabase Edge Function & 7 AM Daily Schedule

### Step 1: Deploy Edge Function Secrets
Set your Google Service Account JSON in Supabase Secrets (via CLI or Supabase Dashboard -> Settings -> Secrets):
```bash
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

### Step 2: Deploy Edge Function
```bash
supabase functions deploy sync-insta-stories
```
*API Endpoint*: `POST https://aivitcomiywiysrfwqxt.supabase.co/functions/v1/sync-insta-stories`

### Step 3: Enable Daily 7:00 AM PH Time Schedule
Run the contents of `supabase/migrations/20260917_cron_sync_insta_stories.sql` in the **Supabase SQL Editor**. This sets up `pg_cron` to call the endpoint automatically every day at 7:00 AM Philippine Time (23:00 UTC).

## Key Gotchas
- **Instagram CDN User-Agent**: Instagram CDN edge nodes block automated HTTP clients. Always include standard browser headers (`User-Agent`, `Accept`).
- **Service Account Permissions**: The Google Drive folder (`1xm9Ghiyj5KdZBU67c5OUn5S_5kR64z4V`) must be shared with `insta-drive-uploader@claudegwscli-502400.iam.gserviceaccount.com` (Editor role).
