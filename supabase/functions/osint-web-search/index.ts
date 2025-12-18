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

// Build Google Dork queries for comprehensive OSINT with keywords combined with all data points
function buildDorkQueries(
  name: string,
  location?: string,
  email?: string,
  phone?: string,
  keywords?: string,
  seedQuery?: string,
  username?: string,
  relatives?: string[],
): { query: string; type: string; priority: number; description: string }[] {
  const queries: { query: string; type: string; priority: number; description: string }[] = [];

  const stripOuterQuotes = (value: string) => value.replace(/^"+|"+$/g, '').trim();

  // Handle multiple names separated by / or &
  const names = stripOuterQuotes(name)
    .split(/[\/&]/)
    .map((n) => n.trim())
    .filter((n) => n.length > 1);
  const primaryName = names[0] || stripOuterQuotes(name);
  const quotedPrimary = `"${primaryName}"`;

  // Parse name parts for individual keyword combinations
  const nameParts = primaryName.split(/\s+/).filter(p => p.length > 1);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  // If we got a richer "seed" query from the orchestrator, run it first
  const normalizedSeed = seedQuery?.trim();
  if (normalizedSeed && normalizedSeed.length > 1 && stripOuterQuotes(normalizedSeed) !== primaryName) {
    queries.push({
      query: normalizedSeed,
      type: 'seed',
      priority: 1,
      description: 'Seed query (from investigation context)',
    });
  }

  // Parse location for city/state
  let city = '';
  let state = '';
  if (location && location !== 'provided') {
    const locationParts = location.split(',').map((p) => p.trim()).filter((p) => p.length > 2);
    city = locationParts[0] || '';
    state = locationParts.length > 1 ? locationParts[1] : '';
  }

  // Parse keywords into array
  const keywordList = keywords
    ? keywords.split(',').map((k) => k.trim()).filter((k) => k.length > 1)
    : [];

  // Add secondary names as keywords
  if (names.length > 1) {
    for (let i = 1; i < names.length; i++) {
      keywordList.push(names[i]);
    }
  }

  // Clean phone number
  const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
  const hasValidPhone = cleanPhone.length >= 10;

  // Clean email
  const cleanEmail = email && email !== 'provided' ? stripOuterQuotes(email) : '';

  // Clean username
  const cleanUsername = username ? stripOuterQuotes(username).replace(/^@/, '') : '';

  // ========== PRIMARY SEARCHES ==========

  // 1. Full name searches
  queries.push({
    query: quotedPrimary,
    type: 'general_exact',
    priority: 1,
    description: 'General name search (exact phrase)',
  });

  // 2. Name + City
  if (city) {
    queries.push({
      query: `${quotedPrimary} ${city}`,
      type: 'location_city',
      priority: 1,
      description: `Name + City: ${city}`,
    });
  }

  // ========== KEYWORD + NAME COMBINATIONS ==========
  for (const keyword of keywordList.slice(0, 3)) {
    // Keyword + full name
    queries.push({
      query: `${quotedPrimary} "${keyword}"`,
      type: 'keyword_name',
      priority: 2,
      description: `Keyword "${keyword}" + Full Name`,
    });

    // Keyword + first name only (catches partial matches)
    if (firstName) {
      queries.push({
        query: `"${firstName}" "${keyword}"`,
        type: 'keyword_firstname',
        priority: 3,
        description: `Keyword "${keyword}" + First Name`,
      });
    }

    // Keyword + last name only
    if (lastName) {
      queries.push({
        query: `"${lastName}" "${keyword}"`,
        type: 'keyword_lastname',
        priority: 3,
        description: `Keyword "${keyword}" + Last Name`,
      });
    }
  }

  // ========== KEYWORD + PHONE COMBINATIONS ==========
  if (hasValidPhone) {
    // Phone direct search
    queries.push({
      query: `"${cleanPhone}"`,
      type: 'phone_direct',
      priority: 1,
      description: `Phone search: ${phone}`,
    });

    // Phone + keywords
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `"${cleanPhone}" "${keyword}"`,
        type: 'keyword_phone',
        priority: 2,
        description: `Keyword "${keyword}" + Phone`,
      });
    }

    // Phone + name
    queries.push({
      query: `"${cleanPhone}" ${quotedPrimary}`,
      type: 'phone_name',
      priority: 2,
      description: 'Phone + Name combination',
    });
  }

  // ========== KEYWORD + EMAIL COMBINATIONS ==========
  if (cleanEmail) {
    // Email direct search
    queries.push({
      query: `"${cleanEmail}"`,
      type: 'email_direct',
      priority: 1,
      description: `Email search: ${email}`,
    });

    // Email + keywords
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `"${cleanEmail}" "${keyword}"`,
        type: 'keyword_email',
        priority: 2,
        description: `Keyword "${keyword}" + Email`,
      });
    }

    // Email + name
    queries.push({
      query: `"${cleanEmail}" ${quotedPrimary}`,
      type: 'email_name',
      priority: 2,
      description: 'Email + Name combination',
    });
  }

  // ========== KEYWORD + USERNAME COMBINATIONS ==========
  if (cleanUsername) {
    // Username direct search
    queries.push({
      query: `"${cleanUsername}"`,
      type: 'username_direct',
      priority: 2,
      description: `Username search: ${cleanUsername}`,
    });

    // Username + keywords
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `"${cleanUsername}" "${keyword}"`,
        type: 'keyword_username',
        priority: 2,
        description: `Keyword "${keyword}" + Username`,
      });
    }

    // Username + name
    queries.push({
      query: `"${cleanUsername}" ${quotedPrimary}`,
      type: 'username_name',
      priority: 2,
      description: 'Username + Name combination',
    });
  }

  // ========== KEYWORD + RELATIVES/ASSOCIATES COMBINATIONS ==========
  if (relatives && relatives.length > 0) {
    for (const relative of relatives.slice(0, 3)) {
      const cleanRelative = stripOuterQuotes(relative);
      if (cleanRelative.length > 2) {
        // Relative + primary name
        queries.push({
          query: `"${cleanRelative}" ${quotedPrimary}`,
          type: 'relative_name',
          priority: 2,
          description: `Relative/Associate "${cleanRelative}" + Name`,
        });

        // Relative + keywords
        for (const keyword of keywordList.slice(0, 2)) {
          queries.push({
            query: `"${cleanRelative}" "${keyword}"`,
            type: 'keyword_relative',
            priority: 3,
            description: `Keyword "${keyword}" + Relative "${cleanRelative}"`,
          });
        }
      }
    }
  }

  // ========== LOCATION COMBINATIONS ==========
  if (state) {
    queries.push({
      query: `${quotedPrimary} ${state}`,
      type: 'location_state',
      priority: 2,
      description: `Name + State: ${state}`,
    });
  }

  if (city && state) {
    queries.push({
      query: `${quotedPrimary} "${city}" "${state}"`,
      type: 'location_full',
      priority: 2,
      description: `Name + Full location: ${city}, ${state}`,
    });
  }

  // ========== SITE-SPECIFIC SEARCHES ==========
  queries.push({
    query: `${quotedPrimary} site:linkedin.com`,
    type: 'linkedin',
    priority: 3,
    description: 'LinkedIn profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:facebook.com`,
    type: 'facebook',
    priority: 3,
    description: 'Facebook profiles',
  });

  queries.push({
    query: `${quotedPrimary} site:gov`,
    type: 'gov_sites',
    priority: 3,
    description: 'Government sites',
  });

  queries.push({
    query: `${quotedPrimary} filetype:pdf`,
    type: 'documents',
    priority: 4,
    description: 'PDF documents',
  });

  queries.push({
    query: `${quotedPrimary} site:whitepages.com OR site:spokeo.com OR site:truepeoplesearch.com`,
    type: 'people_finders',
    priority: 3,
    description: 'People finder sites',
  });

  return queries;
}

async function executeSearch(query: string, apiKey: string, searchEngineId: string): Promise<any> {
  const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=10`;
  
  console.log(`Executing search: "${query}"`);
  
  const response = await fetch(searchUrl);
  const data = await response.json();
  
  if (data.error) {
    console.error(`Search error for query "${query}":`, data.error.message);
    return null;
  }
  
  console.log(`Query "${query.slice(0, 50)}..." returned ${data.items?.length || 0} results`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, searchData } = await req.json();
    console.log('=== Web Search Started ===');
    console.log('Target:', target);
    console.log('Search data:', JSON.stringify(searchData));

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      console.error('Missing API credentials');
      throw new Error('Google API credentials not configured');
    }

    const stripOuterQuotes = (value: string) => String(value || '').replace(/^"+|"+$/g, '').trim();

    const seedQuery = typeof target === 'string' ? target.trim() : '';
    const searchName = stripOuterQuotes(searchData?.fullName || seedQuery);
    const location = searchData?.address;
    const email = searchData?.email;
    const phone = searchData?.phone;
    const keywords = searchData?.keywords;
    
    const username = searchData?.username;
    const relatives = searchData?.relatives || searchData?.associates || [];
    
    console.log('Parsed inputs - Name:', searchName, 'Location:', location, 'Keywords:', keywords, 'Username:', username, 'Relatives:', relatives?.length || 0);
    
    // Build targeted dork queries with keywords combined with all data points
    const dorkQueries = buildDorkQueries(searchName, location, email, phone, keywords, seedQuery, username, relatives);

    // Execute MORE queries for comprehensive coverage (up to 10 for keyword combinations)
    const sortedQueries = dorkQueries.sort((a, b) => a.priority - b.priority).slice(0, 10);
    
    console.log('Will execute', sortedQueries.length, 'queries:');
    sortedQueries.forEach((q, i) => console.log(`  ${i+1}. [${q.type}] ${q.query.slice(0, 60)}...`));
    
    const searchPromises = sortedQueries.map(q => 
      executeSearch(q.query, GOOGLE_API_KEY!, GOOGLE_SEARCH_ENGINE_ID!)
        .then(result => ({ 
          ...result, 
          queryType: q.type, 
          queryUsed: q.query,
          queryDescription: q.description 
        }))
    );
    
    const searchResults = await Promise.all(searchPromises);
    
    // Check if ALL searches failed due to API being blocked
    const allFailed = searchResults.every(r => r === null);
    const firstError = searchResults.find(r => r?.error);
    
    if (allFailed || firstError?.error) {
      const errorMessage = firstError?.error?.message || 'Google Custom Search API is blocked or not enabled. Please enable it in Google Cloud Console.';
      console.error('All searches failed. API Error:', errorMessage);
      
      // Return error in response so UI can show helpful message
      return new Response(JSON.stringify({ 
        error: errorMessage,
        searchInformation: { totalResults: "0", queriesExecuted: sortedQueries.map(q => q.type) },
        confirmedItems: [],
        possibleItems: [],
        items: [],
        queriesUsed: sortedQueries.map(q => ({ type: q.type, query: q.query, description: q.description })),
        searchContext: {
          fullName: searchName,
          hasAddress: !!location,
          hasEmail: !!email,
          hasPhone: !!phone,
          hasKeywords: !!keywords
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('All searches complete. Processing results...');
    
    // Deduplicate results by URL
    const seenUrls = new Set<string>();
    const confirmedResults: any[] = [];
    const possibleResults: any[] = [];
    
    // Parse keywords for matching
    const keywordList = keywords 
      ? keywords.split(',').map((k: string) => k.trim().toLowerCase()).filter((k: string) => k.length > 1)
      : [];
    
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
        
        // Check keyword matches
        const keywordMatches: string[] = [];
        for (const keyword of keywordList) {
          if (textToCheck.toLowerCase().includes(keyword)) {
            keywordMatches.push(keyword);
          }
        }
        
        // Check phone presence
        let phonePresent = false;
        if (phone) {
          const cleanPhone = phone.replace(/\D/g, '');
          phonePresent = textToCheck.includes(cleanPhone) || 
                         textToCheck.includes(phone) ||
                         (cleanPhone.length >= 7 && textToCheck.includes(cleanPhone.slice(-7)));
        }
        
        // Check email presence
        let emailPresent = false;
        if (email) {
          emailPresent = textToCheck.toLowerCase().includes(email.toLowerCase());
        }
        
        // Calculate confidence based on match quality and source type
        let confidenceScore = 0.4;
        
        // Boost for exact name match
        if (nameMatch.exact) {
          confidenceScore = 0.65;
        } else if (nameMatch.partial) {
          confidenceScore = 0.35;
        }
        
        // Boost for location co-occurrence (+15%)
        if (locationPresent) {
          confidenceScore += 0.15;
        }
        
        // Boost for keyword matches (+10% per keyword, max +20%)
        if (keywordMatches.length > 0) {
          confidenceScore += Math.min(0.20, keywordMatches.length * 0.10);
        }
        
        // Boost for phone match (+15%)
        if (phonePresent) {
          confidenceScore += 0.15;
        }
        
        // Boost for email match (+15%)
        if (emailPresent) {
          confidenceScore += 0.15;
        }
        
        // Boost for high-value source types
        if (result.queryType === 'keywords_combined') {
          confidenceScore += 0.10;
        } else if (result.queryType === 'social_media') {
          confidenceScore += 0.08;
        } else if (result.queryType === 'official_sources') {
          confidenceScore += 0.08;
        } else if (result.queryType === 'people_finders') {
          confidenceScore += 0.05;
        }
        
        // Cap at 0.98
        confidenceScore = Math.min(0.98, confidenceScore);
        
        const processedItem = {
          title: item.title || '',
          link: item.link || '',
          snippet: item.snippet || '',
          displayLink: item.displayLink || '',
          confidenceScore,
          isExactMatch: nameMatch.exact,
          hasLocation: locationPresent,
          hasKeywords: keywordMatches.length > 0,
          keywordMatches,
          hasPhone: phonePresent,
          hasEmail: emailPresent,
          sourceType: result.queryType,
          queryDescription: result.queryDescription
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
        queriesExecuted: sortedQueries.map(q => q.type),
        keywordsSearched: keywordList
      },
      confirmedItems: confirmedResults,
      possibleItems: possibleResults,
      items: [...confirmedResults, ...possibleResults],
      queriesUsed: sortedQueries.map(q => ({ 
        type: q.type, 
        query: q.query,
        description: q.description 
      }))
    };
    
    console.log('Web search complete:', confirmedResults.length, 'confirmed,', possibleResults.length, 'possible');
    console.log('Keywords matched in results:', keywordList.length > 0 ? 'yes' : 'none provided');

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
