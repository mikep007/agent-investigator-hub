import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Method A: Google Search for court records
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
    `"${fullName}" site:ujsportal.pacourts.us`,
    `"${params.lastName}" "${params.firstName}" Pennsylvania court records`,
    `"${fullName}" PA docket criminal civil`,
    `"${fullName}" court case records ${params.state || 'Pennsylvania'}`,
    `"${fullName}" site:courtrecords.org`,
    `"${fullName}" site:judyrecords.com`,
  ];

  for (const query of queries.slice(0, 4)) {
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
          const content = (item.title + ' ' + item.snippet).toLowerCase();
          let recordType = 'unknown';
          if (content.includes('criminal') || content.includes('felony') || content.includes('misdemeanor')) {
            recordType = 'criminal';
          } else if (content.includes('civil') || content.includes('lawsuit') || content.includes('plaintiff')) {
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

// Method B: Generate manual verification links for court portals
function generateCourtPortalLinks(params: CourtSearchParams): any[] {
  const results: any[] = [];
  const fullName = `${params.firstName} ${params.lastName}`;
  const state = params.state?.toUpperCase() || 'PA';

  // State court portal links
  const statePortals: Record<string, { name: string; url: string; searchUrl?: string }> = {
    'PA': { 
      name: 'PA Unified Judicial System Portal', 
      url: 'https://ujsportal.pacourts.us/CaseSearch',
      searchUrl: `https://ujsportal.pacourts.us/CaseSearch`
    },
    'NY': { 
      name: 'NY WebCivil Supreme', 
      url: 'https://iapps.courts.state.ny.us/webcivil/FCASMain' 
    },
    'CA': { 
      name: 'California Courts', 
      url: 'https://www.courts.ca.gov/find-my-court.htm' 
    },
    'FL': { 
      name: 'Florida Courts', 
      url: 'https://www.flcourts.gov/Courts-Circuits' 
    },
    'TX': { 
      name: 'Texas Courts', 
      url: 'https://www.txcourts.gov/case-searches/' 
    },
    'NJ': { 
      name: 'NJ Courts', 
      url: 'https://portal.njcourts.gov/webe5/PublicAccess/index.html' 
    },
    'OH': { 
      name: 'Ohio Courts', 
      url: 'https://www.supremecourt.ohio.gov/clerk/SearchCases.aspx' 
    },
  };

  // Add state-specific portal
  const portal = statePortals[state] || statePortals['PA'];
  results.push({
    source: portal.name,
    title: `${portal.name} - Manual Search Required`,
    link: portal.url,
    note: `Search manually for: ${fullName}`,
    recordType: 'portal_link',
    searchParams: {
      lastName: params.lastName,
      firstName: params.firstName,
      county: params.county,
    },
    confidence: 0.3,
    manualVerification: true,
  });

  // Add general court record aggregators
  const aggregators = [
    {
      name: 'JudyRecords',
      url: `https://www.judyrecords.com/record/${encodeURIComponent(params.firstName.toLowerCase())}-${encodeURIComponent(params.lastName.toLowerCase())}`,
    },
    {
      name: 'CourtRecords.org',
      url: `https://www.courtrecords.org/people/${encodeURIComponent(params.firstName.toLowerCase())}-${encodeURIComponent(params.lastName.toLowerCase())}/`,
    },
    {
      name: 'UniCourt',
      url: `https://unicourt.com/search?q=${encodeURIComponent(fullName)}`,
    },
  ];

  for (const agg of aggregators) {
    results.push({
      source: agg.name,
      title: `${agg.name} - Court Records Search`,
      link: agg.url,
      note: `Search for court records: ${fullName}`,
      recordType: 'aggregator_link',
      confidence: 0.4,
      manualVerification: true,
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

    // Run Google search and generate portal links
    const [googleResults, portalLinks] = await Promise.all([
      searchGoogleCourtRecords(params),
      Promise.resolve(generateCourtPortalLinks(params)),
    ]);

    // Combine results
    const allResults = [...googleResults, ...portalLinks];
    
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
          portals: portalLinks.length,
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
