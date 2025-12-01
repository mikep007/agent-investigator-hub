import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import FirecrawlApp from "https://esm.sh/@mendable/firecrawl-js@4.7.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CourtSearchParams {
  firstName: string;
  lastName: string;
  state?: string;
  county?: string;
  dateOfBirth?: string;
}

// Method A: Google Search for PA court records
async function searchGoogleCourtRecords(params: CourtSearchParams): Promise<any[]> {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
  const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');
  
  if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
    console.log('Google API not configured for court search');
    return [];
  }

  const results: any[] = [];
  const fullName = `${params.firstName} ${params.lastName}`;
  
  // Court record search queries
  const queries = [
    // PA UJS Portal searches
    `"${fullName}" site:ujsportal.pacourts.us`,
    `"${params.lastName}" "${params.firstName}" Pennsylvania court records`,
    `"${fullName}" PA docket criminal civil`,
    // General court record searches
    `"${fullName}" court case records ${params.state || 'Pennsylvania'}`,
    `"${fullName}" criminal records ${params.state || 'PA'}`,
    `"${fullName}" civil case ${params.county || ''} county`.trim(),
    // Court aggregator sites
    `"${fullName}" site:courtrecords.org`,
    `"${fullName}" site:judyrecords.com`,
    `"${fullName}" site:unicourt.com`,
  ];

  for (const query of queries.slice(0, 4)) { // Limit to 4 queries
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=5`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Google search error for query "${query}":`, response.status);
        continue;
      }
      
      const data = await response.json();
      
      if (data.items) {
        for (const item of data.items) {
          // Determine record type from content
          const content = (item.title + ' ' + item.snippet).toLowerCase();
          let recordType = 'unknown';
          if (content.includes('criminal') || content.includes('felony') || content.includes('misdemeanor')) {
            recordType = 'criminal';
          } else if (content.includes('civil') || content.includes('lawsuit') || content.includes('plaintiff') || content.includes('defendant')) {
            recordType = 'civil';
          } else if (content.includes('traffic') || content.includes('citation')) {
            recordType = 'traffic';
          } else if (content.includes('family') || content.includes('divorce') || content.includes('custody')) {
            recordType = 'family';
          }

          results.push({
            source: 'google_search',
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            displayLink: item.displayLink,
            recordType,
            searchQuery: query,
            confidence: item.link.includes('ujsportal.pacourts.us') || 
                       item.link.includes('courtrecords.org') ||
                       item.link.includes('unicourt.com') ? 0.8 : 0.5,
          });
        }
      }
    } catch (error) {
      console.error(`Error searching Google for court records:`, error);
    }
  }

  return results;
}

// Method B: Third-party court records API (using Firecrawl to scrape aggregators)
async function searchCourtAggregators(params: CourtSearchParams): Promise<any[]> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!FIRECRAWL_API_KEY) {
    console.log('Firecrawl API not configured for court aggregator search');
    return [];
  }

  const results: any[] = [];
  const fullName = `${params.firstName} ${params.lastName}`;
  const state = params.state || 'PA';

  // Court record aggregator URLs to scrape
  const aggregatorUrls = [
    `https://www.judyrecords.com/record/${encodeURIComponent(params.firstName.toLowerCase())}-${encodeURIComponent(params.lastName.toLowerCase())}`,
    `https://www.courtrecords.org/people/${encodeURIComponent(params.firstName.toLowerCase())}-${encodeURIComponent(params.lastName.toLowerCase())}/`,
  ];

  const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

  for (const url of aggregatorUrls) {
    try {
      console.log(`Scraping court aggregator: ${url}`);
      
      const response = await firecrawl.scrape(url, {
        formats: ['markdown', 'links'],
        onlyMainContent: true,
        waitFor: 3000,
      });

      if (response && response.markdown) {
        // Parse the markdown for court record information
        const markdown = response.markdown;
        const lines = markdown.split('\n').filter((l: string) => l.trim());
        
        // Look for case information
        let currentCase: any = null;
        
        for (const line of lines) {
          const lineLower = line.toLowerCase();
          
          // Check if this line contains case information
          if (lineLower.includes('case') || lineLower.includes('docket') || 
              lineLower.includes('criminal') || lineLower.includes('civil') ||
              lineLower.includes('filed') || lineLower.includes('court')) {
            
            // Try to extract case number
            const caseMatch = line.match(/(?:case|docket)\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9-]+)/i);
            const dateMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
            
            let recordType = 'unknown';
            if (lineLower.includes('criminal')) recordType = 'criminal';
            else if (lineLower.includes('civil')) recordType = 'civil';
            else if (lineLower.includes('traffic')) recordType = 'traffic';
            else if (lineLower.includes('family')) recordType = 'family';

            results.push({
              source: new URL(url).hostname,
              title: line.slice(0, 100),
              link: url,
              caseNumber: caseMatch ? caseMatch[1] : null,
              filedDate: dateMatch ? dateMatch[1] : null,
              recordType,
              rawContent: line,
              confidence: 0.6,
            });
          }
        }

        // Also add any case-related links found
        if (response.links) {
          for (const link of response.links) {
            if (link.includes('case') || link.includes('docket')) {
              results.push({
                source: new URL(url).hostname,
                title: 'Related Case Link',
                link: link,
                recordType: 'unknown',
                confidence: 0.5,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
    }
  }

  return results;
}

// Method C: Advanced Firecrawl scraping of PA UJS Portal
async function scrapeUJSPortal(params: CourtSearchParams): Promise<any[]> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!FIRECRAWL_API_KEY) {
    console.log('Firecrawl API not configured for UJS Portal scraping');
    return [];
  }

  const results: any[] = [];
  const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

  // Try to scrape PA UJS Portal - note this may be blocked
  const ujsSearchUrl = `https://ujsportal.pacourts.us/CaseSearch`;
  
  try {
    console.log('Attempting to scrape PA UJS Portal...');
    
    const response = await firecrawl.scrape(ujsSearchUrl, {
      formats: ['markdown', 'html', 'links'],
      onlyMainContent: false,
      waitFor: 5000, // Wait for JS to load
    });

    if (response) {
      // Check if we got actual search results or just the form
      const markdown = response.markdown || '';
      const html = response.html || '';
      
      if (markdown.includes('case') || markdown.includes('docket')) {
        results.push({
          source: 'ujsportal.pacourts.us',
          title: 'PA UJS Portal',
          link: ujsSearchUrl,
          content: markdown.slice(0, 500),
          recordType: 'portal_access',
          note: 'Portal accessed - manual search may be required',
          confidence: 0.3,
        });
      }

      // Look for any case links
      if (response.links) {
        const caseLinks = response.links.filter((l: string) => 
          l.includes('CaseDetail') || l.includes('docket')
        );
        
        for (const link of caseLinks.slice(0, 10)) {
          results.push({
            source: 'ujsportal.pacourts.us',
            title: 'Case Detail Link',
            link: link,
            recordType: 'case_link',
            confidence: 0.4,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error scraping UJS Portal:', error);
    // Add note about manual search requirement
    results.push({
      source: 'ujsportal.pacourts.us',
      title: 'PA UJS Portal - Manual Search Required',
      link: `https://ujsportal.pacourts.us/CaseSearch`,
      note: `Automated access blocked. Search manually for: ${params.firstName} ${params.lastName}`,
      recordType: 'manual_required',
      searchParams: {
        lastName: params.lastName,
        firstName: params.firstName,
        county: params.county,
      },
      confidence: 0.2,
    });
  }

  // Also try other state court portals if state is provided
  const statePortals: Record<string, string> = {
    'PA': 'https://ujsportal.pacourts.us/CaseSearch',
    'NY': 'https://iapps.courts.state.ny.us/webcivil/FCASMain',
    'CA': 'https://www.courts.ca.gov/find-my-court.htm',
    'FL': 'https://www.flcourts.gov/Courts-Circuits',
    'TX': 'https://www.txcourts.gov/case-searches/',
  };

  const state = params.state?.toUpperCase() || 'PA';
  if (statePortals[state] && state !== 'PA') {
    results.push({
      source: `${state} Court System`,
      title: `${state} Court Records Portal`,
      link: statePortals[state],
      note: `Visit this portal to search for ${params.firstName} ${params.lastName}`,
      recordType: 'portal_link',
      confidence: 0.2,
    });
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const params: CourtSearchParams = await req.json();
    console.log('Starting court records search:', params);

    if (!params.firstName || !params.lastName) {
      throw new Error('First name and last name are required for court record searches');
    }

    // Run all three methods in parallel
    const [googleResults, aggregatorResults, portalResults] = await Promise.all([
      searchGoogleCourtRecords(params),
      searchCourtAggregators(params),
      scrapeUJSPortal(params),
    ]);

    // Combine and deduplicate results
    const allResults = [...googleResults, ...aggregatorResults, ...portalResults];
    
    // Deduplicate by link
    const seenLinks = new Set<string>();
    const uniqueResults = allResults.filter(r => {
      if (seenLinks.has(r.link)) return false;
      seenLinks.add(r.link);
      return true;
    });

    // Sort by confidence
    uniqueResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // Categorize results
    const criminal = uniqueResults.filter(r => r.recordType === 'criminal');
    const civil = uniqueResults.filter(r => r.recordType === 'civil');
    const traffic = uniqueResults.filter(r => r.recordType === 'traffic');
    const family = uniqueResults.filter(r => r.recordType === 'family');
    const other = uniqueResults.filter(r => 
      !['criminal', 'civil', 'traffic', 'family'].includes(r.recordType)
    );

    console.log(`Found ${uniqueResults.length} court record results`);

    return new Response(
      JSON.stringify({
        success: true,
        totalResults: uniqueResults.length,
        criminal,
        civil,
        traffic,
        family,
        other,
        allResults: uniqueResults,
        searchParams: params,
        sources: {
          google: googleResults.length,
          aggregators: aggregatorResults.length,
          portals: portalResults.length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in court records search:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
