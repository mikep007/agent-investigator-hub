import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  normalizeUrl,
  type SearchData,
  type GeneratedQuery,
  type SearchBatch,
  parseLocationFromAddress,
  detectStateCode,
} from '../_shared/osint-utils.ts';

// ========== AGENT MODULES ==========
// Each agent handles a specific parameter type and returns search promises + type labels

function buildWebSearches(
  client: any,
  searchData: SearchData,
  keywords: string[],
  generatedQueries: GeneratedQuery[],
): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];

  if (generatedQueries.length > 0) {
    const topQueries = generatedQueries
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);
    console.log(`[WebAgent] Executing top ${topQueries.length} prioritized queries`);
    for (const gq of topQueries) {
      promises.push(
        client.functions.invoke('osint-web-search', {
          body: { target: gq.query, searchData, priority: gq.priority, templateSource: gq.template },
        }),
      );
      types.push(`web_generated_p${gq.priority}`);
    }
  } else if (searchData.fullName || keywords.length > 0) {
    const webSearchQuery = searchData.fullName
      ? keywords.length > 0
        ? `${searchData.fullName} ${keywords.join(' ')}`
        : searchData.fullName
      : keywords.join(' ');
    promises.push(
      client.functions.invoke('osint-web-search', { body: { target: webSearchQuery, searchData } }),
    );
    types.push('web');
  }

  return { promises, types };
}

function buildNameSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  if (!searchData.fullName) return { promises, types };

  const nameParts = searchData.fullName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || nameParts[0];
  const { city, state } = parseLocationFromAddress(searchData.address);

  // People search (TruePeopleSearch & FastPeopleSearch)
  promises.push(
    client.functions.invoke('osint-people-search', {
      body: { firstName, lastName, city, state, phone: searchData.phone, email: searchData.email, address: searchData.address, validateData: true },
    }),
  );
  types.push('people_search');

  // Browser scraper for protected sites
  const fmtFirst = firstName.toLowerCase();
  const fmtLast = lastName.toLowerCase().replace(/\s+/g, '-');
  const locSuffix = city && state ? `/${city.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}` : '';

  promises.push(
    client.functions.invoke('osint-browser-scraper', {
      body: { url: `https://www.whitepages.com/name/${fmtFirst}-${fmtLast}${locSuffix}`, searchType: 'person' },
    }),
  );
  types.push('browser_whitepages_person');

  if (city && state) {
    promises.push(
      client.functions.invoke('osint-browser-scraper', {
        body: { url: `https://www.spokeo.com/${fmtFirst}-${fmtLast}/${state.toLowerCase()}/${city.toLowerCase().replace(/\s+/g, '-')}`, searchType: 'person' },
      }),
    );
    types.push('browser_spokeo_person');
  }

  // Social search (Facebook via Google)
  const locationForSocial = city && state ? `${city}, ${state}` : (searchData.address || '');
  promises.push(
    client.functions.invoke('osint-social-search', {
      body: { target: searchData.fullName, searchType: 'name', fullName: searchData.fullName, location: locationForSocial },
    }),
  );
  types.push('social_name');

  // IDCrawl aggregator
  promises.push(
    client.functions.invoke('osint-idcrawl', {
      body: { fullName: searchData.fullName, location: locationForSocial, keywords: searchData.keywords },
    }),
  );
  types.push('idcrawl');

  console.log(`[NameAgent] Queued ${promises.length} searches for "${searchData.fullName}"`);
  return { promises, types };
}

function buildEmailSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  if (!searchData.email) return { promises, types };

  const email = searchData.email;

  // Selector Enrichment (80+ platforms)
  promises.push(client.functions.invoke('osint-selector-enrichment', { body: { selector: email } }));
  types.push('selector_enrichment_email');

  // Email Intelligence
  promises.push(client.functions.invoke('osint-email-intelligence', { body: { target: email } }));
  types.push('email_intelligence');

  // Holehe (120+ platforms)
  promises.push(client.functions.invoke('osint-holehe', { body: { target: email } }));
  types.push('holehe');

  // Basic email validation
  promises.push(client.functions.invoke('osint-email-lookup', { body: { target: email } }));
  types.push('email');

  // Social search for email mentions
  promises.push(client.functions.invoke('osint-social-search', { body: { target: email } }));
  types.push('social');

  // OSINT Industries API
  promises.push(client.functions.invoke('osint-industries', { body: { target: email } }));
  types.push('osint_industries');

  // LeakCheck for email breaches
  promises.push(client.functions.invoke('osint-leakcheck', { body: { target: email, type: 'email' } }));
  types.push('leakcheck');

  // Extract username from email local-part
  const emailLocalPart = email.split('@')[0];
  if (emailLocalPart && emailLocalPart.length > 0) {
    console.log(`[EmailAgent] Extracted username from email: ${emailLocalPart}`);

    promises.push(client.functions.invoke('osint-sherlock', { body: { target: emailLocalPart } }));
    types.push('sherlock_from_email');

    promises.push(client.functions.invoke('osint-web-search', { body: { target: `"${email}"` } }));
    types.push('web_email_exact');

    promises.push(client.functions.invoke('osint-toutatis', { body: { target: emailLocalPart } }));
    types.push('toutatis_from_email');

    promises.push(client.functions.invoke('osint-instaloader', { body: { target: emailLocalPart, includePosts: false } }));
    types.push('instaloader_from_email');
  }

  console.log(`[EmailAgent] Queued ${promises.length} searches for email`);
  return { promises, types };
}

function buildUsernameSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  if (!searchData.username) return { promises, types };

  const username = searchData.username;

  promises.push(client.functions.invoke('osint-sherlock', { body: { target: username } }));
  types.push('sherlock');

  promises.push(client.functions.invoke('osint-social-search', { body: { target: username } }));
  types.push('social');

  promises.push(client.functions.invoke('osint-leakcheck', { body: { target: username, type: 'username' } }));
  types.push('leakcheck_username');

  promises.push(client.functions.invoke('osint-toutatis', { body: { target: username } }));
  types.push('toutatis');

  promises.push(client.functions.invoke('osint-instaloader', { body: { target: username, includePosts: true, postsLimit: 12 } }));
  types.push('instaloader');

  console.log(`[UsernameAgent] Queued ${promises.length} searches for "${username}"`);
  return { promises, types };
}

function buildPhoneSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  if (!searchData.phone) return { promises, types };

  const phone = searchData.phone;

  // Selector Enrichment for phone (messaging apps)
  promises.push(client.functions.invoke('osint-selector-enrichment', { body: { selector: phone } }));
  types.push('selector_enrichment_phone');

  promises.push(client.functions.invoke('osint-phone-lookup', { body: { target: phone } }));
  types.push('phone');

  promises.push(client.functions.invoke('osint-web-search', { body: { target: `"${phone}"`, searchData } }));
  types.push('web_phone_search');

  // People search for phone with name context
  const phoneSearchBody: any = { phone };
  if (searchData.fullName) {
    const nameParts = searchData.fullName.trim().split(/\s+/);
    phoneSearchBody.firstName = nameParts[0];
    phoneSearchBody.lastName = nameParts.slice(1).join(' ') || nameParts[0];
    phoneSearchBody.email = searchData.email;
    phoneSearchBody.address = searchData.address;
    phoneSearchBody.validateData = true;
  }
  promises.push(client.functions.invoke('osint-people-search', { body: phoneSearchBody }));
  types.push('people_search_phone');

  promises.push(client.functions.invoke('osint-leakcheck', { body: { target: phone, type: 'phone' } }));
  types.push('leakcheck_phone');

  console.log(`[PhoneAgent] Queued ${promises.length} searches for phone`);
  return { promises, types };
}

function buildAddressSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  if (!searchData.address) return { promises, types };

  const address = searchData.address;

  // Basic geocoding and Street View
  promises.push(client.functions.invoke('osint-address-search', { body: { target: address } }));
  types.push('address');

  // Property records
  promises.push(
    client.functions.invoke('osint-property-records', {
      body: { address, ownerName: searchData.fullName },
    }),
  );
  types.push('property_records');

  // Browser scrapers for protected sites
  const addressParts = address.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})/i);
  if (addressParts) {
    const streetAddress = addressParts[1].trim();
    const city = addressParts[2].trim();
    const state = addressParts[3].trim().toUpperCase();
    const fmtStreet = streetAddress.replace(/\s+/g, '-');
    const fmtCity = city.replace(/\s+/g, '-');

    promises.push(client.functions.invoke('osint-browser-scraper', { body: { url: `https://www.whitepages.com/address/${fmtStreet}/${fmtCity}-${state}`, searchType: 'address' } }));
    types.push('browser_whitepages_address');

    promises.push(client.functions.invoke('osint-browser-scraper', { body: { url: `https://www.truepeoplesearch.com/results?streetaddress=${encodeURIComponent(streetAddress)}&citystatezip=${encodeURIComponent(city)}%20${state}`, searchType: 'address' } }));
    types.push('browser_truepeoplesearch_address');

    promises.push(client.functions.invoke('osint-browser-scraper', { body: { url: `https://www.fastpeoplesearch.com/address/${fmtStreet}_${fmtCity}-${state}`, searchType: 'address' } }));
    types.push('browser_fastpeoplesearch_address');

    console.log(`[AddressAgent] Browser scrapers queued for Whitepages, TruePeopleSearch, FastPeopleSearch`);
  }

  // Web searches for owner/property info
  promises.push(client.functions.invoke('osint-web-search', { body: { target: `"${address}" owner property records`, searchData } }));
  types.push('address_owner_search');

  promises.push(client.functions.invoke('osint-web-search', { body: { target: `"${address}" residents people`, searchData } }));
  types.push('address_residents_search');

  // State-specific business registry searches
  const stateCode = detectStateCode(address);
  if (stateCode) {
    const fullContext = { fullName: searchData.fullName, phone: searchData.phone, email: searchData.email };
    if (stateCode === 'FL') {
      console.log('[AddressAgent] Florida address detected - running Sunbiz search');
      promises.push(client.functions.invoke('osint-sunbiz-search', { body: { address, officerName: searchData.fullName, fullContext } }));
      types.push('sunbiz');
    } else if (['CA', 'NY', 'TX', 'NV', 'DE', 'GA', 'AZ'].includes(stateCode)) {
      console.log(`[AddressAgent] ${stateCode} address detected - running state business search`);
      promises.push(client.functions.invoke('osint-state-business-search', { body: { state: stateCode, address, officerName: searchData.fullName, fullContext } }));
      types.push(`state_business_${stateCode.toLowerCase()}`);
    }
  }

  console.log(`[AddressAgent] Queued ${promises.length} searches for address`);
  return { promises, types };
}

function buildBusinessSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  // Only run if we have a name but NO address (address agent handles state-specific searches)
  if (!searchData.fullName || searchData.address) return { promises, types };

  const fullContext = { fullName: searchData.fullName, phone: searchData.phone, email: searchData.email };

  // Sunbiz officer search
  promises.push(client.functions.invoke('osint-sunbiz-search', { body: { officerName: searchData.fullName, fullContext } }));
  types.push('sunbiz_officer');

  // Multi-state business registry searches
  const states = ['CA', 'NY', 'TX', 'NV', 'DE', 'GA'];
  for (const state of states) {
    promises.push(client.functions.invoke('osint-state-business-search', { body: { state, officerName: searchData.fullName, fullContext } }));
    types.push(`state_business_${state.toLowerCase()}_officer`);
  }

  console.log(`[BusinessAgent] Queued ${promises.length} officer/business searches`);
  return { promises, types };
}

function buildRecordSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  if (!searchData.fullName) return { promises, types };

  const nameParts = searchData.fullName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || nameParts[0];
  const { city, state: addrState } = parseLocationFromAddress(searchData.address);

  // Determine state for searches
  let state = addrState || 'PA'; // Default to PA
  if (searchData.address) {
    const detected = detectStateCode(searchData.address);
    if (detected) state = detected;
  }

  // Extract county
  let county: string | undefined;
  if (searchData.address) {
    const countyMatch = searchData.address.match(/([A-Za-z]+)\s+County/i);
    if (countyMatch) county = countyMatch[1];
  }

  // Court records
  promises.push(client.functions.invoke('osint-court-records', { body: { firstName, lastName, state, county } }));
  types.push('court_records');

  // Voter lookups
  const voterLookupStates = [
    { state: 'PA', fn: 'osint-pa-voter-lookup' },
    { state: 'NY', fn: 'osint-ny-voter-lookup' },
    { state: 'FL', fn: 'osint-fl-voter-lookup' },
    { state: 'OH', fn: 'osint-oh-voter-lookup' },
    { state: 'TX', fn: 'osint-tx-voter-lookup' },
    { state: 'CA', fn: 'osint-ca-voter-lookup' },
    { state: 'GA', fn: 'osint-ga-voter-lookup' },
    { state: 'NC', fn: 'osint-nc-voter-lookup' },
  ];

  if (searchData.address) {
    // Run voter lookup for detected state only
    const match = voterLookupStates.find(v => v.state === state);
    if (match) {
      console.log(`[RecordsAgent] ${match.state} address detected - running voter lookup`);
      promises.push(client.functions.invoke(match.fn, { body: { firstName, lastName, county } }));
      types.push(`${match.state}_voter`);
    }
  } else {
    // No address: run all state voter lookups
    console.log('[RecordsAgent] Running multi-state voter lookups (no address)');
    for (const { state: st, fn } of voterLookupStates) {
      promises.push(client.functions.invoke(fn, { body: { firstName, lastName } }));
      types.push(`${st}_voter`);
    }
  }

  console.log(`[RecordsAgent] Queued ${promises.length} record searches`);
  return { promises, types };
}

function buildRelativeSearches(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];
  if (!searchData.knownRelatives) return { promises, types };

  const relatives = searchData.knownRelatives.split(',').map(r => r.trim()).filter(r => r.length >= 2);
  const { city, state } = parseLocationFromAddress(searchData.address);

  console.log(`[RelativeAgent] Searching for ${relatives.length} known relatives:`, relatives);

  for (const relativeName of relatives) {
    // Web search for connections
    if (searchData.fullName) {
      promises.push(
        client.functions.invoke('osint-web-search', {
          body: {
            target: `"${searchData.fullName}" "${relativeName}"`,
            searchData: { ...searchData, keywords: `${searchData.keywords || ''} ${relativeName}`.trim() },
          },
        }),
      );
      types.push(`connection_${relativeName.replace(/\s+/g, '_').toLowerCase()}`);
    }

    // People search for the relative
    const rParts = relativeName.trim().split(/\s+/);
    const rFirst = rParts[0];
    const rLast = rParts.slice(1).join(' ') || rParts[0];

    promises.push(
      client.functions.invoke('osint-people-search', {
        body: { firstName: rFirst, lastName: rLast, city, state, validateData: false, connectionSearch: true, primaryTarget: searchData.fullName },
      }),
    );
    types.push(`relative_search_${relativeName.replace(/\s+/g, '_').toLowerCase()}`);

    // IDCrawl for each relative
    promises.push(
      client.functions.invoke('osint-idcrawl', {
        body: { fullName: relativeName, location: city && state ? `${city}, ${state}` : '', keywords: searchData.fullName },
      }),
    );
    types.push(`idcrawl_${relativeName.replace(/\s+/g, '_').toLowerCase()}`);
  }

  console.log(`[RelativeAgent] Queued ${promises.length} relative searches`);
  return { promises, types };
}

function buildPowerAutomateSearch(client: any, searchData: SearchData): SearchBatch {
  const promises: Promise<any>[] = [];
  const types: string[] = [];

  console.log('[PowerAutomateAgent] Running Global Findings search');
  promises.push(
    client.functions.invoke('osint-power-automate', {
      body: {
        fullName: searchData.fullName,
        address: searchData.address,
        email: searchData.email,
        phone: searchData.phone,
        username: searchData.username,
      },
    }),
  );
  types.push('power_automate');

  return { promises, types };
}

// ========== ORCHESTRATOR ==========

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const searchData: SearchData = await req.json();
    console.log('=== Comprehensive Investigation Started ===');
    console.log('Search data:', JSON.stringify(searchData));

    // Validate input
    const hasAtLeastOneParam = searchData.fullName || searchData.email || searchData.phone || searchData.username || searchData.address;
    if (!hasAtLeastOneParam) throw new Error('At least one search parameter is required');

    const target = searchData.fullName || searchData.email || searchData.phone || searchData.username || searchData.address || 'Unknown';

    // Create investigation record
    const { data: investigation, error: invError } = await supabaseClient
      .from('investigations')
      .insert({ user_id: user.id, target, status: 'active' })
      .select()
      .single();
    if (invError) throw invError;
    console.log('Investigation created:', investigation.id);

    // Parse keywords
    const keywords = searchData.keywords
      ? searchData.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
      : [];
    const generatedQueries: GeneratedQuery[] = searchData._generatedQueries || [];

    // ===== DISPATCH TO AGENT MODULES =====
    const batches: SearchBatch[] = [
      buildWebSearches(supabaseClient, searchData, keywords, generatedQueries),
      buildNameSearches(supabaseClient, searchData),
      buildEmailSearches(supabaseClient, searchData),
      buildUsernameSearches(supabaseClient, searchData),
      buildPhoneSearches(supabaseClient, searchData),
      buildAddressSearches(supabaseClient, searchData),
      buildBusinessSearches(supabaseClient, searchData),
      buildRecordSearches(supabaseClient, searchData),
      buildRelativeSearches(supabaseClient, searchData),
      hasAtLeastOneParam ? buildPowerAutomateSearch(supabaseClient, searchData) : { promises: [], types: [] },
    ];

    // Merge all batches
    const searchPromises: Promise<any>[] = [];
    const searchTypes: string[] = [];
    for (const batch of batches) {
      searchPromises.push(...batch.promises);
      searchTypes.push(...batch.types);
    }

    console.log(`Running ${searchPromises.length} OSINT searches across ${batches.filter(b => b.promises.length > 0).length} agents...`);
    const results = await Promise.allSettled(searchPromises);

    // ===== RESULT PROCESSING =====
    const searchDebug: Array<{ type: string; status: string; error?: string; hasData?: boolean }> = [];

    // Web search aggregation
    const allWebConfirmedItems: any[] = [];
    const allWebPossibleItems: any[] = [];
    const allWebDiscoveredRelatives: Set<string> = new Set();
    const seenWebUrls = new Set<string>();
    const webQueryStats: any[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const agentType = searchTypes[i];
      const isWebSearch = agentType === 'web' || agentType.startsWith('web_') || agentType.includes('_web');

      if (result.status === 'fulfilled') {
        const { data, error } = result.value as { data: any; error: any };

        if (error) {
          console.error(`Error from ${agentType}:`, error);
          searchDebug.push({ type: agentType, status: 'error', error: typeof error === 'string' ? error : (error.message || JSON.stringify(error)) });
          continue;
        }

        if (!data) {
          searchDebug.push({ type: agentType, status: 'no_data', hasData: false });
          continue;
        }

        // Aggregate web search results for cross-call deduplication
        if (isWebSearch) {
          searchDebug.push({ type: agentType, status: 'ok', hasData: true });
          if (data.confirmedItems && Array.isArray(data.confirmedItems)) {
            for (const item of data.confirmedItems) {
              const nUrl = normalizeUrl(item.link || '');
              if (!seenWebUrls.has(nUrl)) { seenWebUrls.add(nUrl); allWebConfirmedItems.push({ ...item, sourceQuery: agentType }); }
            }
          }
          if (data.possibleItems && Array.isArray(data.possibleItems)) {
            for (const item of data.possibleItems) {
              const nUrl = normalizeUrl(item.link || '');
              if (!seenWebUrls.has(nUrl)) { seenWebUrls.add(nUrl); allWebPossibleItems.push({ ...item, sourceQuery: agentType }); }
            }
          }
          if (data.discoveredRelatives && Array.isArray(data.discoveredRelatives)) {
            data.discoveredRelatives.forEach((rel: string) => allWebDiscoveredRelatives.add(rel));
          }
          if (data.queriesUsed && Array.isArray(data.queriesUsed)) {
            webQueryStats.push(...data.queriesUsed);
          }
          continue;
        }

        // Non-web findings: enrich with context and store
        searchDebug.push({ type: agentType, status: 'ok', hasData: true });

        const enrichedData = {
          ...data,
          searchContext: {
            fullName: searchData.fullName || null,
            hasEmail: !!searchData.email,
            hasPhone: !!searchData.phone,
            hasUsername: !!searchData.username,
            hasAddress: !!searchData.address,
            hasKeywords: keywords.length > 0,
            keywords,
            totalDataPoints: [searchData.fullName, searchData.email, searchData.phone, searchData.username, searchData.address, searchData.keywords].filter(Boolean).length,
          },
        };

        // Calculate confidence score
        let confidenceScore = 50;
        const dataPoints = enrichedData.searchContext.totalDataPoints;
        if (dataPoints >= 5) confidenceScore += 35;
        else if (dataPoints >= 4) confidenceScore += 25;
        else if (dataPoints >= 3) confidenceScore += 15;
        else if (dataPoints >= 2) confidenceScore += 10;

        // Google Dork co-occurrence boost
        if (data.items && Array.isArray(data.items)) {
          const maxBoost = Math.max(...data.items.map((item: any) => item.confidenceBoost || 0));
          if (maxBoost > 0) {
            confidenceScore += maxBoost * 100;
            console.log(`Google Dork co-occurrence boost: +${maxBoost * 100}%`);
          }
        }

        // Keyword matching boost
        if (keywords.length > 0) {
          const findingDataStr = JSON.stringify(data).toLowerCase();
          const keywordMatches = keywords.filter(kw => findingDataStr.includes(kw)).length;
          if (keywordMatches > 0) {
            const keywordBoost = Math.min(keywordMatches * 5, 15);
            confidenceScore += keywordBoost;
          }
        }

        // Store finding
        const { error: insertError } = await supabaseClient.from('findings').insert({
          investigation_id: investigation.id,
          agent_type: agentType.charAt(0).toUpperCase() + agentType.slice(1),
          source: `OSINT-${agentType}`,
          data: enrichedData,
          confidence_score: Math.min(confidenceScore, 100),
          verification_status: 'needs_review',
        });

        if (insertError) console.error(`Error inserting ${agentType} findings:`, insertError);
        else console.log(`Stored ${agentType} findings with confidence: ${confidenceScore}%`);
      } else {
        console.error(`OSINT search ${agentType} failed:`, result.reason);
        const errorMessage = typeof result.reason === 'string' ? result.reason : (result.reason?.message || JSON.stringify(result.reason));
        searchDebug.push({ type: agentType, status: 'failed', error: errorMessage });

        if (agentType === 'web' || agentType.includes('web_')) {
          await supabaseClient.from('findings').insert({
            investigation_id: investigation.id,
            agent_type: 'Web',
            source: `OSINT-${agentType}`,
            data: { error: errorMessage, items: [], confirmedItems: [], possibleItems: [] },
            confidence_score: null,
            verification_status: 'needs_review',
          });
        }
      }
    }

    // Store merged web search results
    if (allWebConfirmedItems.length > 0 || allWebPossibleItems.length > 0) {
      allWebConfirmedItems.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      allWebPossibleItems.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

      const mergedWebData = {
        searchInformation: { totalResults: String(allWebConfirmedItems.length + allWebPossibleItems.length), deduplicatedFrom: seenWebUrls.size },
        confirmedItems: allWebConfirmedItems,
        possibleItems: allWebPossibleItems,
        items: [...allWebConfirmedItems, ...allWebPossibleItems],
        discoveredRelatives: allWebDiscoveredRelatives.size > 0 ? Array.from(allWebDiscoveredRelatives) : undefined,
        queriesUsed: webQueryStats,
        searchContext: {
          fullName: searchData.fullName || null,
          hasEmail: !!searchData.email,
          hasPhone: !!searchData.phone,
          hasUsername: !!searchData.username,
          hasAddress: !!searchData.address,
          hasKeywords: keywords.length > 0,
          keywords,
        },
      };

      const { error: webInsertError } = await supabaseClient.from('findings').insert({
        investigation_id: investigation.id,
        agent_type: 'Web',
        source: 'OSINT-web-merged',
        data: mergedWebData,
        confidence_score: allWebConfirmedItems.length > 0 ? 75 : 50,
        verification_status: 'needs_review',
      });

      if (webInsertError) console.error('Error inserting merged web findings:', webInsertError);
      else console.log(`Stored merged web findings: ${allWebConfirmedItems.length} confirmed, ${allWebPossibleItems.length} possible (deduplicated from ${seenWebUrls.size} URLs)`);
    }

    // Diagnostic record
    if (searchDebug.length > 0) {
      try {
        await supabaseClient.from('findings').insert({
          investigation_id: investigation.id,
          agent_type: 'System',
          source: 'OSINT-System',
          data: { message: 'OSINT searches completed', searchSummary: searchDebug },
          confidence_score: null,
          verification_status: 'needs_review',
        });
      } catch (e) {
        console.error('Error inserting diagnostic finding:', e);
      }
    }

    return new Response(
      JSON.stringify({ investigationId: investigation.id, searchesRun: searchPromises.length, searchTypes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('Error in comprehensive investigation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
