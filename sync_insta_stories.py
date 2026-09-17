import os
import io
import re
import time
import requests
from dotenv import load_dotenv
from supabase import create_client, Client
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://aivitcomiywiysrfwqxt.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "1xm9Ghiyj5KdZBU67c5OUn5S_5kR64z4V")
SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account_json_key_claudegwscli-502400-3a7969b176ed.json")

SCOPES = ['https://www.googleapis.com/auth/drive']

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

def get_drive_service():
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        raise FileNotFoundError(f"Service account key file not found: {SERVICE_ACCOUNT_FILE}")
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build('drive', 'v3', credentials=creds)

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def generate_filename(record):
    rec_id = record.get('id')
    handle = record.get('insta_handle') or 'user'
    created_at = (record.get('created_at') or '')[:10]
    
    # Sanitize handle
    clean_handle = re.sub(r'[^\w\-]', '_', handle)
    filename = f"story_{rec_id}_{clean_handle}_{created_at}.jpg"
    return filename

def download_image(url, retries=3):
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp.content
            print(f"  [Attempt {attempt}/{retries}] Download failed with status {resp.status_code}", flush=True)
        except Exception as e:
            print(f"  [Attempt {attempt}/{retries}] Exception downloading: {e}", flush=True)
        time.sleep(1)
    return None

def main():
    print("=" * 60, flush=True)
    print("Supabase to Google Drive Image Sync", flush=True)
    print("=" * 60, flush=True)

    # 1. Initialize Clients
    supabase = get_supabase_client()
    drive_service = get_drive_service()

    # Verify Folder Access
    try:
        drive_service.files().get(fileId=FOLDER_ID, fields="id, name", supportsAllDrives=True).execute()
        print(f"Verified Google Drive folder access (ID: {FOLDER_ID})", flush=True)
    except Exception as e:
        print("\nERROR: Cannot access Google Drive folder!", flush=True)
        print("Please ensure you have shared the Google Drive folder with the Service Account email:", flush=True)
        print("  -> insta-drive-uploader@claudegwscli-502400.iam.gserviceaccount.com", flush=True)
        print("Folder Link: https://drive.google.com/drive/folders/1xm9Ghiyj5KdZBU67c5OUn5S_5kR64z4V\n", flush=True)
        return

    # 2. Fetch records from Supabase
    print("\nQuerying Supabase table 'insta_stories'...", flush=True)
    res = supabase.table("insta_stories") \
        .select("*") \
        .is_("saved_img_link", "null") \
        .not_.is_("insta_story_image_url", "null") \
        .order("created_at", desc=True) \
        .execute()

    records = res.data
    total = len(records)
    print(f"Found {total} records where saved_img_link is NULL and insta_story_image_url is NOT NULL.\n", flush=True)

    if total == 0:
        print("No pending records to process.", flush=True)
        return

    success_count = 0
    fail_count = 0

    for idx, rec in enumerate(records, 1):
        rec_id = rec.get('id')
        img_url = rec.get('insta_story_image_url')
        filename = generate_filename(rec)

        print(f"[{idx}/{total}] Processing Record ID #{rec_id} ({rec.get('insta_handle') or 'No handle'})...", flush=True)

        try:
            img_bytes = download_image(img_url)
            if not img_bytes:
                print(f"  FAILED to download image for Record #{rec_id}", flush=True)
                fail_count += 1
                continue
            
            # Prepare Drive upload
            file_metadata = {
                'name': filename,
                'parents': [FOLDER_ID]
            }
            media = MediaIoBaseUpload(io.BytesIO(img_bytes), mimetype='image/jpeg', resumable=True)

            # Upload to Google Drive
            drive_file = drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, webViewLink',
                supportsAllDrives=True
            ).execute()

            drive_link = drive_file.get('webViewLink')
            print(f"  Uploaded to Drive: {drive_link}", flush=True)

            # Update Supabase record
            supabase.table("insta_stories") \
                .update({"saved_img_link": drive_link}) \
                .eq("id", rec_id) \
                .execute()

            print(f"  Updated Supabase saved_img_link successfully.", flush=True)
            success_count += 1

        except Exception as err:
            print(f"  ERROR processing record #{rec_id}: {err}", flush=True)
            fail_count += 1

        # Small delay between uploads
        time.sleep(0.2)

    print("\n" + "=" * 60, flush=True)
    print(f"Sync Complete! Successfully processed {success_count}/{total} images. (Failed: {fail_count})", flush=True)
    print("=" * 60, flush=True)

if __name__ == "__main__":
    main()
