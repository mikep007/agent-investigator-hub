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
  
  // Check for exact phrase match
  if (textLower.includes(nameLower)) {
    return { exact: true, partial: true };
  }
  
  // Check for name parts appearing adjacent (handles "Petrie, Michael" or "Michael Petrie")
  const nameParts = nameLower.split(/\s+/).filter(p => p.length > 1);
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    // Check "First Last" order
    const forwardPattern = new RegExp(`\\b${firstName}\\b[^a-z]{0,10}\\b${lastName}\\b`, 'i');
    // Check "Last, First" order (common in bibliographies)
    const reversePattern = new RegExp(`\\b${lastName}\\b[,;]?\\s*\\b${firstName}\\b`, 'i');
    
    if (forwardPattern.test(text) || reversePattern.test(text)) {
      return { exact: true, partial: true };
    }
    
    // Check if BOTH first and last name appear but not adjacent (partial match)
    const hasFirst = new RegExp(`\\b${firstName}\\b`, 'i').test(text);
    const hasLast = new RegExp(`\\b${lastName}\\b`, 'i').test(text);
    
    if (hasFirst && hasLast) {
      // But verify they're not part of different names
      // Look for patterns like "Michael Belgrave" or "Hazel Petrie" which indicate different people
      const otherNamePattern = new RegExp(`\\b${firstName}\\b[^,;]{1,20}\\b(?!${lastName})\\w+\\b|\\b(?!${firstName})\\w+[^,;]{1,20}\\b${lastName}\\b`, 'i');
      if (otherNamePattern.test(text)) {
        // Found evidence of the names belonging to different people
        return { exact: false, partial: true };
      }
      return { exact: false, partial: true };
    }
  }
  
  return { exact: false, partial: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, searchData } = await req.json();
    console.log('Web search for:', target);
    console.log('Search context:', searchData);

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      throw new Error('Google API credentials not configured');
    }

    // Determine the actual search term - prefer fullName from searchData over combined target
    const searchName = searchData?.fullName || target;
    
    // Build a more effective search query
    // Use exact phrase for name only, not for keywords
    let googleDorkQuery = `"${searchName}"`;
    
    // Add location context if available for higher precision
    if (searchData?.address && searchData.address !== 'provided') {
      const addressParts = searchData.address.split(',').map((p: string) => p.trim());
      const city = addressParts.find((p: string) => p.length > 2 && !/^\d+/.test(p) && !/^[A-Z]{2}$/.test(p.trim()));
      const state = addressParts.find((p: string) => /^[A-Z]{2}$/.test(p.trim()) || p.toLowerCase().includes('pa') || p.toLowerCase().includes('ny'));
      
      if (city || state) {
        const locationParts = [city, state].filter(Boolean);
        if (locationParts.length > 0) {
          googleDorkQuery += ` ${locationParts.join(' ')}`;
        }
      }
    }
    
    // Add keywords as separate terms (not in exact phrase)
    if (searchData?.keywords && typeof searchData.keywords === 'string' && searchData.keywords !== 'social detection') {
      googleDorkQuery += ` ${searchData.keywords}`;
    }
    
    console.log('Google Dork query:', googleDorkQuery);
    
    // Using Google Custom Search API with enhanced query
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(googleDorkQuery)}`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();

    console.log('Google API response status:', response.status);

    if (data.error) {
      throw new Error(`Google API error: ${data.error.message}`);
    }

    const confirmedResults: any[] = [];
    const possibleResults: any[] = [];

    (data.items || []).slice(0, 10).forEach((item: any) => {
      const textToCheck = `${item.title} ${item.snippet}`;
      
      // Check name match quality
      const nameMatch = checkNameMatch(textToCheck, searchName);
      
      // Check if address/location appears in same result
      let locationPresent = false;
      if (searchData?.address) {
        const addressParts = searchData.address.toLowerCase().split(',').map((p: string) => p.trim());
        locationPresent = addressParts.some((part: string) => 
          part.length > 2 && textToCheck.toLowerCase().includes(part)
        );
      }
      
      // Calculate confidence score
      let confidenceScore = 0.5; // Base score
      
      if (nameMatch.exact) {
        confidenceScore = 0.75;
        if (locationPresent) {
          confidenceScore = 0.90; // High confidence: exact name + location
        }
      } else if (nameMatch.partial) {
        confidenceScore = 0.35; // Low confidence: words present but not adjacent
        if (locationPresent) {
          confidenceScore = 0.50;
        }
      }
      
      const result = {
        title: item.title || '',
        link: item.link || '',
        snippet: item.snippet || '',
        displayLink: item.displayLink || '',
        confidenceScore,
        isExactMatch: nameMatch.exact,
        hasLocation: locationPresent
      };
      
      // Sort into confirmed vs possible based on confidence
      if (confidenceScore >= 0.6) {
        confirmedResults.push(result);
      } else {
        possibleResults.push(result);
      }
    });

    // Sort by confidence
    confirmedResults.sort((a, b) => b.confidenceScore - a.confidenceScore);
    possibleResults.sort((a, b) => b.confidenceScore - a.confidenceScore);

    const results = {
      searchInformation: data.searchInformation || {},
      confirmedItems: confirmedResults,
      possibleItems: possibleResults,
      // Keep legacy items for backward compatibility
      items: [...confirmedResults, ...possibleResults],
      totalResults: data.searchInformation?.totalResults || '0',
      query: googleDorkQuery
    };

    console.log('Web search results: ', confirmedResults.length, 'confirmed,', possibleResults.length, 'possible');

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
