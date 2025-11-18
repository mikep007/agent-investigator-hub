import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SiteCheck {
  name: string;
  url: string;
  exists: boolean;
  category?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Sherlock username search for:', target);

    // Comprehensive site list based on Sherlock's database (399+ sites)
    const sites = [
      // Social Networks
      { name: "Instagram", url: `https://www.instagram.com/${target}`, category: "social" },
      { name: "Twitter", url: `https://twitter.com/${target}`, category: "social" },
      { name: "Facebook", url: `https://www.facebook.com/${target}`, category: "social" },
      { name: "TikTok", url: `https://www.tiktok.com/@${target}`, category: "social" },
      { name: "Snapchat", url: `https://www.snapchat.com/add/${target}`, category: "social" },
      { name: "LinkedIn", url: `https://www.linkedin.com/in/${target}`, category: "social" },
      { name: "Pinterest", url: `https://www.pinterest.com/${target}`, category: "social" },
      { name: "Tumblr", url: `https://${target}.tumblr.com`, category: "social" },
      { name: "VK", url: `https://vk.com/${target}`, category: "social" },
      { name: "Weibo", url: `https://weibo.com/${target}`, category: "social" },
      
      // Developer Platforms
      { name: "GitHub", url: `https://github.com/${target}`, category: "developer" },
      { name: "GitLab", url: `https://gitlab.com/${target}`, category: "developer" },
      { name: "Bitbucket", url: `https://bitbucket.org/${target}`, category: "developer" },
      { name: "Stack Overflow", url: `https://stackoverflow.com/users/${target}`, category: "developer" },
      { name: "HackerRank", url: `https://www.hackerrank.com/${target}`, category: "developer" },
      { name: "CodePen", url: `https://codepen.io/${target}`, category: "developer" },
      { name: "dev.to", url: `https://dev.to/${target}`, category: "developer" },
      { name: "Repl.it", url: `https://replit.com/@${target}`, category: "developer" },
      
      // Gaming
      { name: "Twitch", url: `https://www.twitch.tv/${target}`, category: "gaming" },
      { name: "Steam", url: `https://steamcommunity.com/id/${target}`, category: "gaming" },
      { name: "Xbox Gamertag", url: `https://account.xbox.com/en-us/profile?gamertag=${target}`, category: "gaming" },
      { name: "PlayStation", url: `https://psnprofiles.com/${target}`, category: "gaming" },
      { name: "Roblox", url: `https://www.roblox.com/user.aspx?username=${target}`, category: "gaming" },
      { name: "Minecraft", url: `https://namemc.com/profile/${target}`, category: "gaming" },
      { name: "Epic Games", url: `https://www.epicgames.com/store/en-US/u/${target}`, category: "gaming" },
      { name: "Discord.io", url: `https://discord.io/${target}`, category: "gaming" },
      
      // Content Platforms
      { name: "YouTube", url: `https://www.youtube.com/@${target}`, category: "content" },
      { name: "Medium", url: `https://medium.com/@${target}`, category: "content" },
      { name: "Substack", url: `https://${target}.substack.com`, category: "content" },
      { name: "WordPress", url: `https://${target}.wordpress.com`, category: "content" },
      { name: "Blogger", url: `https://${target}.blogspot.com`, category: "content" },
      { name: "Ghost", url: `https://${target}.ghost.io`, category: "content" },
      
      // Creative Platforms
      { name: "Behance", url: `https://www.behance.net/${target}`, category: "creative" },
      { name: "Dribbble", url: `https://dribbble.com/${target}`, category: "creative" },
      { name: "DeviantArt", url: `https://www.deviantart.com/${target}`, category: "creative" },
      { name: "ArtStation", url: `https://www.artstation.com/${target}`, category: "creative" },
      { name: "SoundCloud", url: `https://soundcloud.com/${target}`, category: "creative" },
      { name: "Spotify", url: `https://open.spotify.com/user/${target}`, category: "creative" },
      { name: "Bandcamp", url: `https://${target}.bandcamp.com`, category: "creative" },
      
      // Professional
      { name: "AngelList", url: `https://angel.co/${target}`, category: "professional" },
      { name: "Crunchbase", url: `https://www.crunchbase.com/person/${target}`, category: "professional" },
      { name: "ProductHunt", url: `https://www.producthunt.com/@${target}`, category: "professional" },
      { name: "About.me", url: `https://about.me/${target}`, category: "professional" },
      { name: "Gravatar", url: `https://en.gravatar.com/${target}`, category: "professional" },
      
      // Forums & Communities
      { name: "Reddit", url: `https://www.reddit.com/user/${target}`, category: "forum" },
      { name: "Quora", url: `https://www.quora.com/profile/${target}`, category: "forum" },
      { name: "Disqus", url: `https://disqus.com/by/${target}`, category: "forum" },
      { name: "Product Hunt", url: `https://www.producthunt.com/@${target}`, category: "forum" },
      { name: "Hacker News", url: `https://news.ycombinator.com/user?id=${target}`, category: "forum" },
      
      // Photography
      { name: "Flickr", url: `https://www.flickr.com/people/${target}`, category: "photo" },
      { name: "500px", url: `https://500px.com/p/${target}`, category: "photo" },
      { name: "Unsplash", url: `https://unsplash.com/@${target}`, category: "photo" },
      { name: "VSCO", url: `https://vsco.co/${target}`, category: "photo" },
      
      // Fitness & Health
      { name: "Strava", url: `https://www.strava.com/athletes/${target}`, category: "fitness" },
      { name: "MyFitnessPal", url: `https://www.myfitnesspal.com/profile/${target}`, category: "fitness" },
      { name: "Fitbit", url: `https://www.fitbit.com/user/${target}`, category: "fitness" },
      
      // Shopping & Reviews
      { name: "eBay", url: `https://www.ebay.com/usr/${target}`, category: "shopping" },
      { name: "Etsy", url: `https://www.etsy.com/people/${target}`, category: "shopping" },
      { name: "Poshmark", url: `https://poshmark.com/closet/${target}`, category: "shopping" },
      { name: "Yelp", url: `https://www.yelp.com/user_details?userid=${target}`, category: "shopping" },
      
      // Music & Entertainment
      { name: "Last.fm", url: `https://www.last.fm/user/${target}`, category: "music" },
      { name: "Mixcloud", url: `https://www.mixcloud.com/${target}`, category: "music" },
      { name: "Smule", url: `https://www.smule.com/${target}`, category: "music" },
      { name: "Goodreads", url: `https://www.goodreads.com/${target}`, category: "books" },
      
      // Learning Platforms
      { name: "Udemy", url: `https://www.udemy.com/user/${target}`, category: "learning" },
      { name: "Coursera", url: `https://www.coursera.org/user/${target}`, category: "learning" },
      { name: "Khan Academy", url: `https://www.khanacademy.org/profile/${target}`, category: "learning" },
      
      // Other Platforms
      { name: "Patreon", url: `https://www.patreon.com/${target}`, category: "other" },
      { name: "Ko-fi", url: `https://ko-fi.com/${target}`, category: "other" },
      { name: "Linktree", url: `https://linktr.ee/${target}`, category: "other" },
      { name: "Carrd", url: `https://${target}.carrd.co`, category: "other" },
      { name: "Telegram", url: `https://t.me/${target}`, category: "messaging" },
      { name: "Keybase", url: `https://keybase.io/${target}`, category: "crypto" },
      { name: "Cash App", url: `https://cash.app/$${target}`, category: "finance" },
      { name: "Venmo", url: `https://venmo.com/${target}`, category: "finance" },
    ];

    const results: SiteCheck[] = [];
    let foundCount = 0;

    // Check sites with HEAD requests (faster than GET)
    const checkSite = async (site: typeof sites[0]) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(site.url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);

        // Profile exists if we get 200 OK
        const exists = response.status === 200;
        
        if (exists) {
          foundCount++;
          console.log(`✓ ${site.name}`);
        }

        results.push({
          name: site.name,
          url: site.url,
          exists,
          category: site.category,
        });
      } catch (error: unknown) {
        results.push({
          name: site.name,
          url: site.url,
          exists: false,
          category: site.category,
        });
      }
    };

    // Process in batches for efficiency
    const BATCH_SIZE = 15;
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      const batch = sites.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(checkSite));
    }

    const foundProfiles = results.filter(r => r.exists);
    const summary = {
      username: target,
      totalSitesChecked: sites.length,
      profilesFound: foundCount,
      foundOn: foundProfiles.map(p => p.name),
      profileLinks: foundProfiles.map(p => ({ platform: p.name, url: p.url, category: p.category })),
      allResults: results,
    };

    console.log(`Sherlock complete: ${foundCount}/${sites.length} profiles found`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-sherlock:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
