import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Configuration
const FOLDER_ID = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID') || '1xm9Ghiyj5KdZBU67c5OUn5S_5kR64z4V'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://aivitcomiywiysrfwqxt.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Helper: Base64Url encode string / buffer
function base64UrlEncode(str: string | Uint8Array): string {
  const bytes = typeof str === 'string' ? new TextEncoder().encode(str) : str
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// Helper: Get Google Access Token using Service Account JWT
async function getGoogleAccessToken(serviceAccountJson: any): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claimSet = {
    iss: serviceAccountJson.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: serviceAccountJson.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedClaim = base64UrlEncode(JSON.stringify(claimSet))
  const signatureInput = `${encodedHeader}.${encodedClaim}`

  // Format RSA private key
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = serviceAccountJson.private_key
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  )

  const jwt = `${signatureInput}.${base64UrlEncode(new Uint8Array(signature))}`

  const tokenResp = await fetch(serviceAccountJson.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  const tokenData = await tokenResp.json()
  if (!tokenResp.ok) {
    throw new Error(`Google Auth Failed: ${tokenData.error_description || tokenData.error}`)
  }
  return tokenData.access_token
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Load Service Account JSON key from Env
    const saRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!saRaw) {
      return new Response(
        JSON.stringify({ error: 'Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable secret' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const serviceAccount = JSON.parse(saRaw)

    // 1. Get Google Access Token
    const accessToken = await getGoogleAccessToken(serviceAccount)

    // 2. Query Supabase table 'insta_stories'
    const { data: records, error: dbError } = await supabase
      .from('insta_stories')
      .select('*')
      .is('saved_img_link', null)
      .not('insta_story_image_url', 'is', null)
      .order('created_at', { ascending: false })

    if (dbError) {
      throw new Error(`Supabase query failed: ${dbError.message}`)
    }

    if (!records || records.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending records to sync.', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let successCount = 0
    let failCount = 0
    const processedLinks: string[] = []

    // 3. Process records
    for (const rec of records) {
      const recId = rec.id
      const imgUrl = rec.insta_story_image_url
      const handle = (rec.insta_handle || 'user').replace(/[^\w\-]/g, '_')
      const createdAt = (rec.created_at || '').substring(0, 10)
      const filename = `story_${recId}_${handle}_${createdAt}.jpg`

      try {
        // Download image with browser headers
        const imgResp = await fetch(imgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          }
        })

        if (!imgResp.ok) {
          console.error(`Failed to download image for ID ${recId}: ${imgResp.statusText}`)
          failCount++
          continue
        }

        const imgBuffer = await imgResp.arrayBuffer()

        // Upload to Google Drive (Multipart upload)
        const metadata = JSON.stringify({
          name: filename,
          parents: [FOLDER_ID]
        })

        const boundary = 'foo_bar_baz'
        const delimiter = `\r\n--${boundary}\r\n`
        const closeDelimiter = `\r\n--${boundary}--`

        const bodyParts = [
          delimiter,
          'Content-Type: application/json; charset=UTF-8\r\n\r\n',
          metadata,
          delimiter,
          'Content-Type: image/jpeg\r\n\r\n',
          new Uint8Array(imgBuffer),
          closeDelimiter
        ]

        // Combine body parts into Uint8Array
        let totalLength = 0
        const preparedParts = bodyParts.map(part => {
          if (typeof part === 'string') {
            const encoded = new TextEncoder().encode(part)
            totalLength += encoded.byteLength
            return encoded
          }
          totalLength += part.byteLength
          return part
        })

        const combinedBody = new Uint8Array(totalLength)
        let offset = 0
        for (const part of preparedParts) {
          combinedBody.set(part, offset)
          offset += part.byteLength
        }

        const driveUploadResp = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: combinedBody
          }
        )

        const driveData = await driveUploadResp.json()

        if (!driveUploadResp.ok) {
          console.error(`Google Drive upload failed for ID ${recId}:`, driveData)
          failCount++
          continue
        }

        const driveLink = driveData.webViewLink

        // Update Supabase saved_img_link
        await supabase
          .from('insta_stories')
          .update({ saved_img_link: driveLink })
          .eq('id', recId)

        processedLinks.push(driveLink)
        successCount++

      } catch (err) {
        console.error(`Error processing ID ${recId}:`, err)
        failCount++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${successCount}/${records.length} images to Google Drive.`,
        processedCount: successCount,
        failedCount: failCount,
        links: processedLinks
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
