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

    const platforms = [
      { name: 'Twitter', url: `https://twitter.com/${target}` },
      { name: 'Instagram', url: `https://instagram.com/${target}` },
      { name: 'LinkedIn', url: `https://linkedin.com/in/${target}` },
      { name: 'GitHub', url: `https://github.com/${target}` },
      { name: 'TikTok', url: `https://tiktok.com/@${target}` },
      { name: 'Reddit', url: `https://reddit.com/u/${target}` },
    ];

    const results: SocialProfile[] = [];
    
    for (const platform of platforms) {
      try {
        const response = await fetch(platform.url, { 
          method: 'HEAD',
          redirect: 'follow'
        });
        
        results.push({
          platform: platform.name,
          username: target,
          url: platform.url,
          exists: response.status === 200
        });
        
        console.log(`${platform.name}: ${response.status === 200 ? 'Found' : 'Not found'}`);
      } catch (error) {
        console.error(`Error checking ${platform.name}:`, error);
        results.push({
          platform: platform.name,
          username: target,
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