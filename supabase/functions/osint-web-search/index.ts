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

// Build Google Dork queries for comprehensive OSINT with keywords
function buildDorkQueries(
  name: string, 
  location?: string, 
  email?: string, 
  phone?: string,
  keywords?: string
): { query: string; type: string; priority: number; description: string }[] {
  const queries: { query: string; type: string; priority: number; description: string }[] = [];
  const quotedName = `"${name}"`;
  
  // Parse location for city/state
  let city = '';
  let state = '';
  if (location && location !== 'provided') {
    const locationParts = location.split(',').map(p => p.trim()).filter(p => p.length > 2);
    city = locationParts[0] || '';
    state = locationParts.length > 1 ? locationParts[1] : '';
  }
  
  // Parse keywords into array
  const keywordList = keywords 
    ? keywords.split(',').map(k => k.trim()).filter(k => k.length > 1)
    : [];
  
  // 1. COMBINED DORK: Name + Location + Keywords (highest priority)
  if (keywordList.length > 0) {
    const keywordQuery = keywordList.map(k => `"${k}"`).join(' ');
    queries.push({
      query: `${quotedName} ${city ? `"${city}"` : ''} ${state ? `"${state}"` : ''} ${keywordQuery}`,
      type: 'keywords_combined',
      priority: 1,
      description: `Name + Location + Keywords: ${keywordList.join(', ')}`
    });
  }
  
  // 2. BROAD GENERAL SEARCH - catches everything including .gov, .org, etc.
  queries.push({
    query: quotedName,
    type: 'general',
    priority: 1,
    description: 'General name search'
  });
  
  // 3. Location-specific search (high priority if location provided)
  if (city) {
    queries.push({
      query: `${quotedName} "${city}"${state ? ` "${state}"` : ''}`,
      type: 'location_specific',
      priority: 1,
      description: `Location-specific: ${city}${state ? `, ${state}` : ''}`
    });
  }
  
  // 4. Name + Phone number search
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 10 
      ? `(${cleanPhone.slice(0,3)}) ${cleanPhone.slice(3,6)}-${cleanPhone.slice(6)}`
      : phone;
    queries.push({
      query: `${quotedName} "${formattedPhone}" | "${cleanPhone}"`,
      type: 'phone_combined',
      priority: 1,
      description: `Name + Phone: ${phone}`
    });
  }
  
  // 5. Name + Email search
  if (email) {
    queries.push({
      query: `${quotedName} "${email}"`,
      type: 'email_combined',
      priority: 1,
      description: `Name + Email: ${email}`
    });
  }
  
  // 6. Keywords only search (if keywords provided)
  if (keywordList.length > 0) {
    for (const keyword of keywordList.slice(0, 2)) {
      queries.push({
        query: `${quotedName} "${keyword}"`,
        type: 'keyword_specific',
        priority: 2,
        description: `Keyword search: ${keyword}`
      });
    }
  }
  
  // 7. Government & Official Sources
  queries.push({
    query: `${quotedName} site:gov | site:edu | site:org`,
    type: 'official_sources',
    priority: 2,
    description: 'Government, Education, Organization sites'
  });
  
  // 8. Social Media Profiles
  queries.push({
    query: `${quotedName} site:linkedin.com | site:facebook.com | site:twitter.com | site:instagram.com`,
    type: 'social_media',
    priority: 3,
    description: 'Social media profiles'
  });
  
  // 9. Profile Pages
  queries.push({
    query: `${quotedName} inurl:profile | inurl:about | inurl:user`,
    type: 'profiles',
    priority: 4,
    description: 'Profile and about pages'
  });
  
  // 10. People Finder Sites
  queries.push({
    query: `${quotedName} site:whitepages.com | site:spokeo.com | site:beenverified.com | site:truepeoplesearch.com`,
    type: 'people_finders',
    priority: 5,
    description: 'People finder websites'
  });
  
  // 11. Documents (resumes, reports, PDFs)
  queries.push({
    query: `${quotedName} filetype:pdf | filetype:doc | filetype:docx`,
    type: 'documents',
    priority: 4,
    description: 'Documents (PDF, DOC)'
  });
  
  // 12. News & Articles
  if (city || keywordList.length > 0) {
    queries.push({
      query: `${quotedName} ${city ? `"${city}"` : ''} site:news.google.com | site:newspapers.com | inurl:news`,
      type: 'news',
      priority: 3,
      description: 'News articles and mentions'
    });
  }
  
  // 13. Court/Legal Records
  if (city || state) {
    queries.push({
      query: `${quotedName} ${state ? `"${state}"` : `"${city}"`} site:gov court | case | arrest | warrant`,
      type: 'legal_records',
      priority: 4,
      description: 'Court and legal records'
    });
  }
  
  // 14. Business/Professional
  queries.push({
    query: `${quotedName} ${city ? `"${city}"` : ''} site:bbb.org | site:yelp.com | site:glassdoor.com | LLC | Inc | owner`,
    type: 'business',
    priority: 4,
    description: 'Business and professional associations'
  });
  
  // 15. Contact info patterns
  queries.push({
    query: `${quotedName} intext:"phone" | intext:"contact" | intext:"email"`,
    type: 'contact_info',
    priority: 5,
    description: 'Contact information mentions'
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
    console.log('Search data:', JSON.stringify(searchData));

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      throw new Error('Google API credentials not configured');
    }

    const searchName = searchData?.fullName || target;
    const location = searchData?.address;
    const email = searchData?.email;
    const phone = searchData?.phone;
    const keywords = searchData?.keywords;
    
    console.log('Building dork queries with keywords:', keywords);
    
    // Build targeted dork queries including keywords
    const dorkQueries = buildDorkQueries(searchName, location, email, phone, keywords);
    
    // Execute top priority queries (up to 6 for comprehensive coverage)
    // Sort by priority and take top queries, prioritizing keyword queries
    const sortedQueries = dorkQueries.sort((a, b) => a.priority - b.priority).slice(0, 6);
    
    console.log('Executing dork queries:', sortedQueries.map(q => ({ type: q.type, desc: q.description })));
    
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
