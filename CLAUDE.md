# CLAUDE.md — Developer Guidelines & Project Information

## Overview
This repository contains automated tooling for querying Instagram story metadata from a Supabase PostgreSQL database, downloading story images, uploading them into a specified Google Drive folder, and updating the database records with the Google Drive web view links.

## Project Structure
- `sync_insta_stories.py`: Main Python batch script.
- `requirements.txt`: Python package dependencies (`supabase`, `google-api-python-client`, `requests`, `python-dotenv`).
- `.env.example`: Template for environment variable configuration.
- `.agents/skills/dcp/SKILL.md`: Workspace `/dcp` documentation skill.
- `chat_history/`: Historical exported chat sessions.
- `as_built.txt`: Living factual inventory of project components.

## Setup & Running
1. Install dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
2. Configure `.env` with Supabase and Google Drive details:
   ```env
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_SERVICE_KEY=<service-role-key>
   GOOGLE_DRIVE_FOLDER_ID=<folder-id>
   GOOGLE_SERVICE_ACCOUNT_FILE=service_account.json
   ```
3. Ensure the target Google Drive folder is shared with your Google Cloud Service Account client email (giving it **Editor** permissions).
4. Run the sync script:
   ```bash
   python sync_insta_stories.py
   ```

## Key Gotchas & Best Practices
- **Instagram CDN User-Agent**: Instagram CDN edge nodes (`*.fbcdn.net`, `*.cdninstagram.com`) block default automated HTTP user agents. Always include standard browser headers (`User-Agent`, `Accept`, `Accept-Language`) when downloading images.
- **Service Account Permissions**: Google Drive API requires service account access to be granted by sharing the target folder directly with the service account email.
- **Idempotency**: The script queries `insta_stories` where `saved_img_link IS NULL` and `insta_story_image_url IS NOT NULL`. Successfully synced records are populated with their Google Drive URL to prevent re-uploading on subsequent runs.
