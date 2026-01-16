import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64 decode helper
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

// ArrayBuffer to URL-safe base64
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Handle Static Maps URL generation
    if (body.lat !== undefined && body.lng !== undefined) {
      const { lat, lng, width = 200, height = 120, zoom = 15 } = body;
      const apiKey = Deno.env.get('GOOGLE_API_KEY');
      
      if (!apiKey) {
        console.error('GOOGLE_API_KEY not configured');
        return new Response(
          JSON.stringify({ error: 'Service unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&scale=2&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
      
      console.log('Static map URL generated');
      return new Response(
        JSON.stringify({ signedUrl: staticMapUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Handle URL signing (existing functionality)
    const { url } = body;
    
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL or lat/lng is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const signingSecret = Deno.env.get('GOOGLE_URL_SIGNING_SECRET');
    
    if (!signingSecret) {
      console.log('No signing secret configured, returning original URL');
      return new Response(
        JSON.stringify({ signedUrl: url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode the private key from URL-safe base64 to standard base64
    const decodedKey = signingSecret.replace(/-/g, '+').replace(/_/g, '/');
    const keyBuffer = base64ToArrayBuffer(decodedKey);
    
    // Parse URL to get path and query
    const urlObj = new URL(url);
    const urlToSign = urlObj.pathname + urlObj.search;
    
    // Create HMAC-SHA1 signature using Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(urlToSign)
    );
    
    // Convert to URL-safe base64
    const signatureBase64 = arrayBufferToBase64Url(signature);
    
    const signedUrl = `${url}&signature=${signatureBase64}`;
    
    console.log('URL signed successfully');
    
    return new Response(
      JSON.stringify({ signedUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
