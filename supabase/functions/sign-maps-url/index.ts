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
    const { url } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error signing URL:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
