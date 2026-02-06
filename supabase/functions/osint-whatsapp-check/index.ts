import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('WhatsApp registration check for:', target);

    if (!target) {
      return new Response(JSON.stringify({ error: 'Phone number target is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize phone number
    const phoneNormalized = target.replace(/[^0-9+]/g, '');

    // Check WhatsApp registration via wa.me redirect check
    // wa.me/{number} redirects to WhatsApp if registered
    let registered = false;
    let profileData: any = {};

    try {
      const waResponse = await fetch(`https://wa.me/${phoneNormalized.replace('+', '')}`, {
        method: 'HEAD',
        redirect: 'manual',
      });

      // A 302 redirect typically indicates the number is registered
      registered = waResponse.status === 302 || waResponse.status === 200;
      console.log(`WhatsApp wa.me check status: ${waResponse.status}, registered: ${registered}`);

      profileData = {
        registered,
        phone: phoneNormalized,
        wa_me_url: `https://wa.me/${phoneNormalized.replace('+', '')}`,
        check_method: 'wa.me_redirect',
        profile_pic_available: registered,
        last_seen_privacy: 'unknown',
      };
    } catch (fetchError) {
      console.warn('WhatsApp wa.me check failed, falling back to heuristic:', fetchError);
      // Fallback: assume unknown
      profileData = {
        registered: null,
        phone: phoneNormalized,
        check_method: 'heuristic_fallback',
        error: 'Could not verify registration',
      };
    }

    return new Response(JSON.stringify({
      platform: 'WhatsApp',
      found: registered,
      confidence: registered ? 'confirmed' : 'low',
      data: profileData,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-whatsapp-check:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
