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
    console.log('Username enumeration for:', target);

    // Extract username from target (remove @ if present)
    const username = target.replace('@', '').trim();

    // Check username across multiple platforms
    const platforms = [
      { name: 'GitHub', url: `https://github.com/${username}`, api: `https://api.github.com/users/${username}` },
      { name: 'Reddit', url: `https://reddit.com/user/${username}`, check: `https://www.reddit.com/user/${username}/about.json` },
      { name: 'Twitter/X', url: `https://twitter.com/${username}`, profileUrl: `https://twitter.com/${username}` },
      { name: 'Instagram', url: `https://instagram.com/${username}`, profileUrl: `https://www.instagram.com/${username}/` },
      { name: 'TikTok', url: `https://tiktok.com/@${username}`, profileUrl: `https://www.tiktok.com/@${username}` },
      { name: 'LinkedIn', url: `https://linkedin.com/in/${username}`, profileUrl: `https://www.linkedin.com/in/${username}` },
      { name: 'Pinterest', url: `https://pinterest.com/${username}`, profileUrl: `https://www.pinterest.com/${username}/` },
      { name: 'Twitch', url: `https://twitch.tv/${username}`, api: `https://www.twitch.tv/${username}` },
      { name: 'Medium', url: `https://medium.com/@${username}`, profileUrl: `https://medium.com/@${username}` },
      { name: 'Dev.to', url: `https://dev.to/${username}`, api: `https://dev.to/api/users/by_username?url=${username}` },
    ];

    // Check each platform
    const results = await Promise.all(
      platforms.map(async (platform) => {
        try {
          const checkUrl = platform.api || platform.check || platform.url;
          const response = await fetch(checkUrl, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          const exists = response.status === 200;
          
          return {
            platform: platform.name,
            username: username,
            exists: exists,
            profileUrl: exists ? platform.url : null,
            status: response.status,
            checked: true
          };
        } catch (error) {
          console.log(`Error checking ${platform.name}:`, error);
          return {
            platform: platform.name,
            username: username,
            exists: false,
            profileUrl: null,
            status: 0,
            checked: false,
            error: 'Check failed'
          };
        }
      })
    );

    const summary = {
      username: username,
      totalPlatforms: platforms.length,
      foundOn: results.filter(r => r.exists).length,
      platforms: results,
      profileLinks: results.filter(r => r.exists).map(r => ({
        platform: r.platform,
        url: r.profileUrl
      }))
    };

    console.log('Username enumeration results:', summary.foundOn, 'profiles found');

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-username-enum:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
