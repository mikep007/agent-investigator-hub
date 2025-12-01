import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');

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

    // Build Google Dork query with advanced operators
    let googleDorkQuery = `"${target}"`;
    
    // Add location context if available for higher precision
    if (searchData?.address) {
      const addressParts = searchData.address.split(',').map((p: string) => p.trim());
      const city = addressParts[addressParts.length - 2] || '';
      const state = addressParts[addressParts.length - 1] || '';
      
      if (city && state) {
        googleDorkQuery += ` ("${city}" OR "${state}")`;
      } else if (searchData.address) {
        googleDorkQuery += ` "${searchData.address}"`;
      }
    }
    
    console.log('Google Dork query:', googleDorkQuery);
    
    // Using Google Custom Search API with enhanced query
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(googleDorkQuery)}`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();

    console.log('Google API response:', data);

    if (data.error) {
      throw new Error(`Google API error: ${data.error.message}`);
    }

    const results = {
      searchInformation: data.searchInformation || {},
      items: (data.items || []).slice(0, 10).map((item: any) => {
        // Calculate enhanced confidence score based on co-occurrence
        let confidenceBoost = 0;
        const textToCheck = `${item.title} ${item.snippet}`.toLowerCase();
        
        // Check if name appears in result
        const namePresent = target.toLowerCase().split(' ').every((word: string) => 
          textToCheck.includes(word.toLowerCase())
        );
        
        // Check if address/location appears in same result
        let locationPresent = false;
        if (searchData?.address) {
          const addressParts = searchData.address.toLowerCase().split(',').map((p: string) => p.trim());
          locationPresent = addressParts.some((part: string) => 
            part.length > 2 && textToCheck.includes(part)
          );
        }
        
        // Boost confidence when name + location co-occur
        if (namePresent && locationPresent) {
          confidenceBoost = 0.3; // 30% boost for co-occurrence
        } else if (namePresent) {
          confidenceBoost = 0.1; // 10% boost for name match only
        }
        
        return {
          title: item.title || '',
          link: item.link || '',
          snippet: item.snippet || '',
          displayLink: item.displayLink || '',
          confidenceBoost // Pass boost to be used in comprehensive investigation
        };
      }),
      totalResults: data.searchInformation?.totalResults || '0'
    };

    console.log('Web search results found:', results.items.length, 'results');

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