import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SocialProfile {
  platform: string;
  username: string;
  url: string;
  exists: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Social search for:', target);

    // Strip spaces and special characters from username for URL construction
    const cleanUsername = target.replace(/\s+/g, '').trim();

    const platforms = [
      { name: 'Twitter', url: `https://twitter.com/${cleanUsername}` },
      { name: 'Instagram', url: `https://instagram.com/${cleanUsername}` },
      { name: 'LinkedIn', url: `https://linkedin.com/in/${cleanUsername}` },
      { name: 'GitHub', url: `https://github.com/${cleanUsername}` },
      { name: 'TikTok', url: `https://tiktok.com/@${cleanUsername}` },
      { name: 'Reddit', url: `https://reddit.com/u/${cleanUsername}` },
    ];

    const results: SocialProfile[] = [];
    
    for (const platform of platforms) {
      try {
        // Special handling for TikTok - always include for manual verification
        if (platform.name === 'TikTok') {
          results.push({
            platform: platform.name,
            username: cleanUsername,
            url: platform.url,
            exists: true // Always show TikTok for manual verification
          });
          console.log(`TikTok: Included for manual verification`);
          continue;
        }

        const response = await fetch(platform.url, { 
          method: 'HEAD',
          redirect: 'follow'
        });
        
        results.push({
          platform: platform.name,
          username: cleanUsername,
          url: platform.url,
          exists: response.status === 200
        });
        
        console.log(`${platform.name}: ${response.status === 200 ? 'Found' : 'Not found'}`);
      } catch (error) {
        console.error(`Error checking ${platform.name}:`, error);
        results.push({
          platform: platform.name,
          username: cleanUsername,
          url: platform.url,
          exists: false
        });
      }
    }

    return new Response(JSON.stringify({ profiles: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-social-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});