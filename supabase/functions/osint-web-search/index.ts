import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');

// Check if full name appears as an exact phrase or adjacent words
function checkNameMatch(text: string, fullName: string): { exact: boolean; partial: boolean } {
  const textLower = text.toLowerCase();
  const nameLower = fullName.toLowerCase().trim();
  
  if (textLower.includes(nameLower)) {
    return { exact: true, partial: true };
  }
  
  const nameParts = nameLower.split(/\s+/).filter(p => p.length > 1);
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    const forwardPattern = new RegExp(`\\b${firstName}\\b[^a-z]{0,10}\\b${lastName}\\b`, 'i');
    const reversePattern = new RegExp(`\\b${lastName}\\b[,;]?\\s*\\b${firstName}\\b`, 'i');
    
    if (forwardPattern.test(text) || reversePattern.test(text)) {
      return { exact: true, partial: true };
    }
    
    const hasFirst = new RegExp(`\\b${firstName}\\b`, 'i').test(text);
    const hasLast = new RegExp(`\\b${lastName}\\b`, 'i').test(text);
    
    if (hasFirst && hasLast) {
      return { exact: false, partial: true };
    }
  }
  
  return { exact: false, partial: false };
}

// Build Google Dork queries for comprehensive OSINT
function buildDorkQueries(name: string, location?: string, email?: string): { query: string; type: string; priority: number }[] {
  const queries: { query: string; type: string; priority: number }[] = [];
  const quotedName = `"${name}"`;
  
  // 1. BROAD GENERAL SEARCH - catches everything including .gov, .org, etc.
  queries.push({
    query: quotedName,
    type: 'general',
    priority: 1
  });
  
  // 2. Location-specific search (high priority if location provided)
  if (location && location !== 'provided') {
    const locationParts = location.split(',').map(p => p.trim()).filter(p => p.length > 2);
    const city = locationParts[0];
    const state = locationParts.length > 1 ? locationParts[1] : '';
    if (city) {
      queries.push({
        query: `${quotedName} "${city}"${state ? ` "${state}"` : ''}`,
        type: 'location_specific',
        priority: 1
      });
    }
  }
  
  // 3. Government & Official Sources
  queries.push({
    query: `${quotedName} site:gov | site:edu | site:org`,
    type: 'official_sources',
    priority: 2
  });
  
  // 4. Social Media Profiles
  queries.push({
    query: `${quotedName} site:linkedin.com | site:facebook.com | site:twitter.com | site:instagram.com`,
    type: 'social_media',
    priority: 3
  });
  
  // 5. Profile Pages
  queries.push({
    query: `${quotedName} inurl:profile | inurl:about | inurl:user`,
    type: 'profiles',
    priority: 4
  });
  
  // 6. People Finder Sites
  queries.push({
    query: `${quotedName} site:whitepages.com | site:spokeo.com | site:beenverified.com | site:truepeoplesearch.com`,
    type: 'people_finders',
    priority: 5
  });
  
  // 7. Documents (resumes, reports, PDFs)
  queries.push({
    query: `${quotedName} filetype:pdf | filetype:doc | filetype:docx`,
    type: 'documents',
    priority: 4
  });
  
  // 8. Email-related search
  if (email) {
    queries.push({
      query: `"${email}" | ${quotedName} email`,
      type: 'email_mentions',
      priority: 3
    });
  }
  
  // 9. Contact info patterns
  queries.push({
    query: `${quotedName} intext:"phone" | intext:"contact" | intext:"email"`,
    type: 'contact_info',
    priority: 5
  });
  
  return queries;
}

async function executeSearch(query: string, apiKey: string, searchEngineId: string): Promise<any> {
  const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=5`;
  
  const response = await fetch(searchUrl);
  const data = await response.json();
  
  if (data.error) {
    console.error(`Search error for query "${query}":`, data.error.message);
    return null;
  }
  
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, searchData } = await req.json();
    console.log('Web search for:', target);

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      throw new Error('Google API credentials not configured');
    }

    const searchName = searchData?.fullName || target;
    const location = searchData?.address;
    const email = searchData?.email;
    
    // Build targeted dork queries
    const dorkQueries = buildDorkQueries(searchName, location, email);
    
    // Execute top priority queries (increased to 5 for better coverage)
    // Sort by priority and take top 5 different types
    const sortedQueries = dorkQueries.sort((a, b) => a.priority - b.priority).slice(0, 5);
    
    console.log('Executing dork queries:', sortedQueries.map(q => q.type));
    
    const searchPromises = sortedQueries.map(q => 
      executeSearch(q.query, GOOGLE_API_KEY!, GOOGLE_SEARCH_ENGINE_ID!)
        .then(result => ({ ...result, queryType: q.type, queryUsed: q.query }))
    );
    
    const searchResults = await Promise.all(searchPromises);
    
    // Deduplicate results by URL
    const seenUrls = new Set<string>();
    const confirmedResults: any[] = [];
    const possibleResults: any[] = [];
    
    for (const result of searchResults) {
      if (!result || !result.items) continue;
      
      for (const item of result.items) {
        if (seenUrls.has(item.link)) continue;
        seenUrls.add(item.link);
        
        const textToCheck = `${item.title} ${item.snippet}`;
        const nameMatch = checkNameMatch(textToCheck, searchName);
        
        // Check location presence
        let locationPresent = false;
        if (location && location !== 'provided') {
          const locationParts = location.toLowerCase().split(',').map((p: string) => p.trim());
          locationPresent = locationParts.some((part: string) => 
            part.length > 2 && textToCheck.toLowerCase().includes(part)
          );
        }
        
        // Calculate confidence based on match quality and source type
        let confidenceScore = 0.5;
        
        // Boost for exact name match
        if (nameMatch.exact) {
          confidenceScore = 0.75;
        } else if (nameMatch.partial) {
          confidenceScore = 0.35;
        }
        
        // Boost for location co-occurrence
        if (locationPresent) {
          confidenceScore += 0.15;
        }
        
        // Boost for high-value source types
        if (result.queryType === 'social_media') {
          confidenceScore += 0.10;
        } else if (result.queryType === 'people_finders') {
          confidenceScore += 0.05;
        }
        
        // Cap at 0.95
        confidenceScore = Math.min(0.95, confidenceScore);
        
        const processedItem = {
          title: item.title || '',
          link: item.link || '',
          snippet: item.snippet || '',
          displayLink: item.displayLink || '',
          confidenceScore,
          isExactMatch: nameMatch.exact,
          hasLocation: locationPresent,
          sourceType: result.queryType
        };
        
        if (confidenceScore >= 0.6) {
          confirmedResults.push(processedItem);
        } else {
          possibleResults.push(processedItem);
        }
      }
    }
    
    // Sort by confidence
    confirmedResults.sort((a, b) => b.confidenceScore - a.confidenceScore);
    possibleResults.sort((a, b) => b.confidenceScore - a.confidenceScore);
    
    const results = {
      searchInformation: {
        totalResults: String(confirmedResults.length + possibleResults.length),
        queriesExecuted: sortedQueries.map(q => q.type)
      },
      confirmedItems: confirmedResults,
      possibleItems: possibleResults,
      items: [...confirmedResults, ...possibleResults],
      queriesUsed: sortedQueries.map(q => ({ type: q.type, query: q.query }))
    };
    
    console.log('Web search complete:', confirmedResults.length, 'confirmed,', possibleResults.length, 'possible');

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-web-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
