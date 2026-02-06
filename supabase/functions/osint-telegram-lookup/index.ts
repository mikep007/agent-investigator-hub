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
    const { target, identifierType } = await req.json();
    console.log('Telegram lookup for:', target, 'type:', identifierType || 'username');

    if (!target) {
      return new Response(JSON.stringify({ error: 'Target identifier is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let found = false;
    let profileData: any = {};
    const type = identifierType || 'username';

    if (type === 'username') {
      // Check Telegram public profile via t.me/{username}
      const username = target.replace('@', '');
      try {
        const tgResponse = await fetch(`https://t.me/${username}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        const html = await tgResponse.text();

        // Parse profile data from the HTML meta tags
        const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/) ;
        const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/) ;
        const imageMatch = html.match(/<meta property="og:image" content="([^"]*)"/) ;

        // Check if it's a valid profile (not "Telegram: Contact @username" placeholder)
        const isPlaceholder = html.includes('tgme_page_icon') && !html.includes('tgme_page_photo');
        found = tgResponse.ok && !isPlaceholder && !!titleMatch;

        profileData = {
          username,
          display_name: titleMatch ? titleMatch[1] : null,
          bio: descMatch ? descMatch[1] : null,
          profile_pic_url: imageMatch ? imageMatch[1] : null,
          public_profile: found,
          profile_url: `https://t.me/${username}`,
          check_method: 't.me_scrape',
        };

        console.log(`Telegram t.me check: found=${found}, name=${titleMatch?.[1]}`);
      } catch (fetchError) {
        console.warn('Telegram t.me check failed:', fetchError);
        profileData = {
          username,
          check_method: 't.me_scrape_failed',
          error: 'Could not verify profile',
        };
      }
    } else if (type === 'phone') {
      // Phone-based Telegram check is limited without API access
      const phoneNormalized = target.replace(/[^0-9+]/g, '');
      profileData = {
        phone: phoneNormalized,
        check_method: 'phone_heuristic',
        note: 'Phone-based Telegram lookup requires Bot API or TDLib access',
        registered: null,
      };
    }

    return new Response(JSON.stringify({
      platform: 'Telegram',
      found,
      confidence: found ? 'confirmed' : 'low',
      data: profileData,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-telegram-lookup:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
