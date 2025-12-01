import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchParams {
  firstName: string;
  lastName: string;
  city?: string;
  state?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, city, state } = await req.json() as SearchParams;
    console.log('People search request:', { firstName, lastName, city, state });

    // Get Firecrawl API key
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    // Construct TruePeopleSearch URL
    const searchName = `${firstName}-${lastName}`.toLowerCase().replace(/\s+/g, '-');
    let searchUrl = `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(firstName + ' ' + lastName)}`;
    
    if (city && state) {
      searchUrl += `&citystatezip=${encodeURIComponent(`${city}, ${state}`)}`;
    }

    console.log('Scraping URL:', searchUrl);

    // Use Firecrawl to scrape the search results
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000, // Wait for dynamic content
      }),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.error('Firecrawl API error:', errorText);
      throw new Error(`Firecrawl API error: ${firecrawlResponse.status}`);
    }

    const firecrawlData = await firecrawlResponse.json();
    console.log('Firecrawl response received');

    // Parse the markdown/html to extract structured data
    const markdown = firecrawlData.data?.markdown || '';
    const html = firecrawlData.data?.html || '';

    // Extract structured information from the scraped content
    const results = parseSearchResults(markdown, html, firstName, lastName);

    console.log(`Found ${results.length} potential matches`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        source: 'TruePeopleSearch',
        searchParams: { firstName, lastName, city, state },
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in people search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function parseSearchResults(markdown: string, html: string, firstName: string, lastName: string) {
  const results: any[] = [];
  
  // Extract phone numbers (various formats)
  const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const phones = [...new Set(markdown.match(phoneRegex) || [])];
  
  // Extract email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = [...new Set(markdown.match(emailRegex) || [])];
  
  // Extract addresses (simplified pattern)
  const addressRegex = /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir|Place|Pl)[,\s]+[\w\s]+,\s*[A-Z]{2}\s+\d{5}/gi;
  const addresses = [...new Set(markdown.match(addressRegex) || [])];
  
  // Extract ages
  const ageRegex = /\b(?:age|Age)\s*:?\s*(\d{1,3})\b/g;
  const ageMatches = [...markdown.matchAll(ageRegex)];
  const ages = [...new Set(ageMatches.map(m => m[1]))];
  
  // Extract relatives/associated names (simplified)
  const relativeRegex = /(?:Relative|Related|Associate|Family)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi;
  const relativeMatches = [...markdown.matchAll(relativeRegex)];
  const relatives = [...new Set(relativeMatches.map(m => m[1].trim()))];
  
  // Create result objects for each combination found
  if (phones.length > 0 || emails.length > 0 || addresses.length > 0) {
    const result: any = {
      name: `${firstName} ${lastName}`,
      phones: phones.slice(0, 5), // Limit to 5
      emails: emails.slice(0, 5),
      addresses: addresses.slice(0, 3),
      ages: ages.slice(0, 3),
      relatives: relatives.slice(0, 10),
      source: 'TruePeopleSearch',
    };
    
    results.push(result);
  }
  
  // If no structured data found, return a basic result indicating the search was performed
  if (results.length === 0) {
    results.push({
      name: `${firstName} ${lastName}`,
      phones: [],
      emails: [],
      addresses: [],
      ages: [],
      relatives: [],
      source: 'TruePeopleSearch',
      note: 'No public records found or data extraction needs refinement',
    });
  }
  
  return results;
}
