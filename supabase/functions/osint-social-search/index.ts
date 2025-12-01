import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');

interface SocialProfile {
  platform: string;
  username: string;
  url: string;
  exists: boolean;
  name?: string;
  snippet?: string;
}

// Search Facebook specifically via Google Custom Search
async function searchFacebookProfiles(searchName: string, location?: string): Promise<SocialProfile[]> {
  if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
    console.log('Google API not configured for Facebook search');
    return [];
  }

  const profiles: SocialProfile[] = [];
  
  // Build Facebook-specific Google search query
  const locationPart = location ? ` ${location}` : '';
  const query = `site:facebook.com "${searchName}"${locationPart}`;
  
  console.log('Searching Facebook via Google:', query);
  
  try {
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.error) {
      console.error('Google search error:', data.error.message);
      return profiles;
    }
    
    if (data.items) {
      for (const item of data.items) {
        // Filter for actual Facebook profile URLs
        if (item.link && (
          item.link.includes('facebook.com/profile.php') ||
          item.link.includes('facebook.com/people/') ||
          (item.link.includes('facebook.com/') && !item.link.includes('/posts/') && !item.link.includes('/photos/'))
        )) {
          profiles.push({
            platform: 'Facebook',
            username: searchName,
            url: item.link,
            exists: true,
            name: item.title || '',
            snippet: item.snippet || ''
          });
          console.log('Found Facebook profile:', item.link);
        }
      }
    }
    
    console.log(`Facebook search found ${profiles.length} profiles`);
  } catch (error) {
    console.error('Facebook search error:', error);
  }
  
  return profiles;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, searchType, fullName, location } = await req.json();
    console.log('Social search for:', target, 'type:', searchType, 'fullName:', fullName);

    const results: SocialProfile[] = [];
    
    // If searching by name, use Google to find Facebook profiles
    if (searchType === 'name' || fullName) {
      const nameToSearch = fullName || target;
      const facebookProfiles = await searchFacebookProfiles(nameToSearch, location);
      results.push(...facebookProfiles);
      
      // Also search for potential relatives if name includes multiple words
      const nameParts = nameToSearch.split(' ');
      if (nameParts.length >= 2) {
        const lastName = nameParts[nameParts.length - 1];
        // Search for other people with same last name in same location
        if (location && GOOGLE_API_KEY && GOOGLE_SEARCH_ENGINE_ID) {
          const relativeQuery = `site:facebook.com "${lastName}" ${location}`;
          console.log('Searching for potential relatives:', relativeQuery);
          
          try {
            const relSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(relativeQuery)}&num=5`;
            const relResponse = await fetch(relSearchUrl);
            const relData = await relResponse.json();
            
            if (relData.items) {
              for (const item of relData.items) {
                // Avoid duplicating the main target
                const titleLower = item.title?.toLowerCase() || '';
                const targetLower = nameToSearch.toLowerCase();
                if (!titleLower.includes(targetLower) && 
                    item.link?.includes('facebook.com') &&
                    !results.some(r => r.url === item.link)) {
                  results.push({
                    platform: 'Facebook (Potential Relative)',
                    username: lastName,
                    url: item.link,
                    exists: true,
                    name: item.title || '',
                    snippet: item.snippet || ''
                  });
                  console.log('Found potential relative:', item.link);
                }
              }
            }
          } catch (error) {
            console.error('Relative search error:', error);
          }
        }
      }
    }

    // Username-based platform checks (for username searches)
    if (searchType === 'username' || !fullName) {
      const cleanUsername = target.replace(/\s+/g, '').trim();

      const platforms = [
        { name: 'Twitter', url: `https://twitter.com/${cleanUsername}` },
        { name: 'Instagram', url: `https://instagram.com/${cleanUsername}` },
        { name: 'LinkedIn', url: `https://linkedin.com/in/${cleanUsername}` },
        { name: 'GitHub', url: `https://github.com/${cleanUsername}` },
        { name: 'TikTok', url: `https://tiktok.com/@${cleanUsername}` },
        { name: 'Reddit', url: `https://reddit.com/u/${cleanUsername}` },
        { name: 'Facebook', url: `https://facebook.com/${cleanUsername}` },
      ];
      
      for (const platform of platforms) {
        try {
          // Special handling for TikTok - always include for manual verification
          if (platform.name === 'TikTok') {
            results.push({
              platform: platform.name,
              username: cleanUsername,
              url: platform.url,
              exists: true
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
