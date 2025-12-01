import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SocialProfile {
  platform: string;
  name: string;
  url: string;
  imageUrl?: string;
  snippet?: string;
}

interface IdCrawlResult {
  profiles: SocialProfile[];
  images: string[];
  totalFound: number;
  location?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fullName, location, keywords } = await req.json();
    console.log('IDCrawl search for:', fullName, 'location:', location, 'keywords:', keywords);

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    // Build IDCrawl URL - replace spaces with hyphens for URL
    const nameSlug = fullName.toLowerCase().replace(/\s+/g, '-');
    let idcrawlUrl = `https://www.idcrawl.com/${nameSlug}`;
    
    // Add state filter if location contains state abbreviation
    if (location) {
      const stateMatch = location.match(/\b([A-Z]{2})\b/i) || location.match(/,\s*(\w+)\s*$/);
      if (stateMatch) {
        const state = stateMatch[1].toLowerCase();
        // IDCrawl uses full state names in URLs
        const stateMap: Record<string, string> = {
          'pa': 'pennsylvania', 'ny': 'new-york', 'nj': 'new-jersey', 
          'ca': 'california', 'tx': 'texas', 'fl': 'florida',
          'il': 'illinois', 'oh': 'ohio', 'ga': 'georgia', 'nc': 'north-carolina',
          'mi': 'michigan', 'va': 'virginia', 'wa': 'washington', 'az': 'arizona',
          'ma': 'massachusetts', 'tn': 'tennessee', 'in': 'indiana', 'mo': 'missouri',
          'md': 'maryland', 'wi': 'wisconsin', 'co': 'colorado', 'mn': 'minnesota',
          'sc': 'south-carolina', 'al': 'alabama', 'la': 'louisiana', 'ky': 'kentucky',
          'or': 'oregon', 'ok': 'oklahoma', 'ct': 'connecticut', 'ut': 'utah',
          'ia': 'iowa', 'nv': 'nevada', 'ar': 'arkansas', 'ms': 'mississippi',
          'ks': 'kansas', 'nm': 'new-mexico', 'ne': 'nebraska', 'wv': 'west-virginia',
          'id': 'idaho', 'hi': 'hawaii', 'nh': 'new-hampshire', 'me': 'maine',
          'mt': 'montana', 'ri': 'rhode-island', 'de': 'delaware', 'sd': 'south-dakota',
          'nd': 'north-dakota', 'ak': 'alaska', 'vt': 'vermont', 'wy': 'wyoming',
          'dc': 'district-of-columbia'
        };
        const fullState = stateMap[state] || state;
        idcrawlUrl = `https://www.idcrawl.com/search?name=${encodeURIComponent(fullName)}&state=${fullState}`;
      }
    }
    
    console.log('Scraping IDCrawl URL:', idcrawlUrl);

    // Scrape IDCrawl using Firecrawl
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: idcrawlUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 5000, // Wait longer for dynamic content
      }),
    });

    if (!response.ok) {
      console.error('Firecrawl error:', response.status, response.statusText);
      throw new Error(`Firecrawl request failed: ${response.status}`);
    }

    const data = await response.json();
    const markdown = data.data?.markdown || '';
    const html = data.data?.html || '';
    
    console.log('IDCrawl markdown length:', markdown.length);

    // Parse the results
    const result = parseIdCrawlResults(markdown, html, fullName, location, keywords);
    
    console.log(`IDCrawl found ${result.profiles.length} profiles, ${result.images.length} images`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in osint-idcrawl:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage, profiles: [], images: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseIdCrawlResults(markdown: string, html: string, fullName: string, location?: string, keywords?: string): IdCrawlResult {
  const profiles: SocialProfile[] = [];
  const images: string[] = [];
  let totalFound = 0;

  // Extract total found count
  const foundMatch = markdown.match(/Found\s+(\d+)\s+people/i);
  if (foundMatch) {
    totalFound = parseInt(foundMatch[1], 10);
  }

  // Extract Facebook profiles (various patterns)
  const facebookPatterns = [
    /\[([^\]]*)\]\((https?:\/\/(?:www\.)?facebook\.com\/[^\s\)]+)\)/gi,
    /(https?:\/\/(?:www\.)?facebook\.com\/(?:profile\.php\?id=\d+|people\/[^\/]+\/\d+|[a-zA-Z0-9._-]+))/gi,
  ];
  
  for (const pattern of facebookPatterns) {
    const matches = markdown.matchAll(pattern);
    for (const match of matches) {
      const url = match[2] || match[1] || match[0];
      const name = match[1] || extractNameFromUrl(url, 'Facebook');
      if (url && !profiles.some(p => p.url === url)) {
        profiles.push({
          platform: 'Facebook',
          name: name,
          url: url.replace(/\)$/, ''), // Clean trailing parenthesis
        });
      }
    }
  }

  // Extract LinkedIn profiles
  const linkedinPattern = /\[([^\]]*)\]\((https?:\/\/(?:www\.)?linkedin\.com\/[^\s\)]+)\)/gi;
  for (const match of markdown.matchAll(linkedinPattern)) {
    if (!profiles.some(p => p.url === match[2])) {
      profiles.push({
        platform: 'LinkedIn',
        name: match[1] || fullName,
        url: match[2],
      });
    }
  }

  // Extract TikTok profiles
  const tiktokPattern = /(https?:\/\/(?:www\.)?tiktok\.com\/@?[a-zA-Z0-9._-]+)/gi;
  for (const match of markdown.matchAll(tiktokPattern)) {
    if (!profiles.some(p => p.url === match[1])) {
      profiles.push({
        platform: 'TikTok',
        name: extractNameFromUrl(match[1], 'TikTok'),
        url: match[1],
      });
    }
  }

  // Extract Instagram profiles
  const instagramPattern = /(https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+)/gi;
  for (const match of markdown.matchAll(instagramPattern)) {
    if (!profiles.some(p => p.url === match[1])) {
      profiles.push({
        platform: 'Instagram',
        name: extractNameFromUrl(match[1], 'Instagram'),
        url: match[1],
      });
    }
  }

  // Extract Twitter/X profiles
  const twitterPattern = /(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9._-]+)/gi;
  for (const match of markdown.matchAll(twitterPattern)) {
    if (!profiles.some(p => p.url === match[1])) {
      profiles.push({
        platform: 'Twitter',
        name: extractNameFromUrl(match[1], 'Twitter'),
        url: match[1],
      });
    }
  }

  // Extract Pinterest profiles
  const pinterestPattern = /\[([^\]]*)\]\((https?:\/\/(?:www\.)?pinterest\.com\/[^\s\)]+)\)/gi;
  for (const match of markdown.matchAll(pinterestPattern)) {
    if (!profiles.some(p => p.url === match[2])) {
      profiles.push({
        platform: 'Pinterest',
        name: match[1] || fullName,
        url: match[2],
      });
    }
  }

  // Extract profile images
  const imagePattern = /!\[[^\]]*\]\((https?:\/\/[^\s\)]+(?:\.jpg|\.jpeg|\.png|\.gif|\.webp)[^\s\)]*)\)/gi;
  for (const match of markdown.matchAll(imagePattern)) {
    if (!images.includes(match[1]) && images.length < 20) {
      images.push(match[1]);
    }
  }

  // Also extract image URLs from standard img tags
  const imgSrcPattern = /src=["'](https?:\/\/[^"']+(?:profile|photo|image|avatar)[^"']*\.(?:jpg|jpeg|png|gif|webp)[^"']*)["']/gi;
  for (const match of html.matchAll(imgSrcPattern)) {
    if (!images.includes(match[1]) && images.length < 20) {
      images.push(match[1]);
    }
  }

  // Extract lookaside.fbsbx.com images (Facebook profile pics)
  const fbImagePattern = /(https?:\/\/lookaside\.fbsbx\.com\/[^\s\)"']+)/gi;
  for (const match of markdown.matchAll(fbImagePattern)) {
    if (!images.includes(match[1]) && images.length < 20) {
      images.push(match[1]);
    }
  }

  // If keywords provided, boost profiles that mention them
  if (keywords) {
    const keywordList = keywords.toLowerCase().split(/[,\s]+/).filter(k => k.length > 2);
    profiles.forEach(profile => {
      const text = `${profile.name} ${profile.snippet || ''}`.toLowerCase();
      const keywordMatch = keywordList.some(k => text.includes(k));
      if (keywordMatch) {
        profile.snippet = (profile.snippet || '') + ' [Keyword match]';
      }
    });
  }

  // Filter by location if provided
  if (location) {
    const locationLower = location.toLowerCase();
    const locationParts = locationLower.split(/[,\s]+/).filter(p => p.length > 2);
    
    // Mark profiles that match location
    profiles.forEach(profile => {
      const text = `${profile.name} ${profile.snippet || ''}`.toLowerCase();
      const locationMatch = locationParts.some(p => text.includes(p));
      if (locationMatch) {
        profile.snippet = (profile.snippet || '') + ' [Location match]';
      }
    });
  }

  return {
    profiles,
    images,
    totalFound,
    location,
  };
}

function extractNameFromUrl(url: string, platform: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    switch (platform) {
      case 'Facebook':
        if (pathname.includes('/people/')) {
          const parts = pathname.split('/');
          const nameIndex = parts.indexOf('people') + 1;
          if (nameIndex < parts.length) {
            return decodeURIComponent(parts[nameIndex].replace(/-/g, ' '));
          }
        }
        return pathname.split('/').filter(p => p).pop()?.replace(/-/g, ' ') || 'Facebook Profile';
      case 'TikTok':
        return '@' + (pathname.replace(/^\/+@?/, '').split('/')[0] || 'user');
      case 'Instagram':
      case 'Twitter':
        return '@' + (pathname.replace(/^\/+/, '').split('/')[0] || 'user');
      default:
        return platform + ' Profile';
    }
  } catch {
    return platform + ' Profile';
  }
}
