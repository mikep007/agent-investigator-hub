import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  city?: string;
  state?: string;
  age_range?: { min: number; max: number };
  known_relatives?: string[];
  phone?: string;
  email?: string;
  limit?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const searchRequest: SearchRequest = await req.json();
    console.log('[person-graph-search] Search request:', JSON.stringify(searchRequest));

    const { first_name, last_name, city, state, known_relatives, phone, email, limit = 10 } = searchRequest;

    if (!first_name && !last_name && !phone && !email) {
      return new Response(
        JSON.stringify({ error: 'At least one search parameter required (name, phone, or email)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchId = crypto.randomUUID();
    const sourcesQueried: string[] = [];
    const results: any[] = [];

    // Build full name for searches
    const fullName = [first_name, last_name].filter(Boolean).join(' ');
    const locationContext = [city, state].filter(Boolean).join(', ');

    // 1. Query existing persons table if we have one
    const { data: existingPersons } = await supabase
      .from('persons')
      .select('*')
      .or(`name->first.ilike.%${first_name || ''}%,name->last.ilike.%${last_name || ''}%`)
      .limit(limit);

    if (existingPersons && existingPersons.length > 0) {
      sourcesQueried.push('local_cache');
      results.push(...existingPersons);
    }

    // 2. Invoke people search for fresh data
    try {
      const peopleSearchPayload = {
        fullName,
        location: locationContext || undefined,
        knownRelatives: known_relatives
      };

      console.log('[person-graph-search] Calling osint-people-search:', peopleSearchPayload);
      
      const peopleResponse = await supabase.functions.invoke('osint-people-search', {
        body: peopleSearchPayload
      });

      if (peopleResponse.data) {
        sourcesQueried.push('people_search');
        const normalized = normalizePeopleSearchResults(peopleResponse.data, fullName);
        results.push(...normalized);
      }
    } catch (err) {
      console.error('[person-graph-search] People search error:', err);
    }

    // 3. Search for known relatives connections
    if (known_relatives && known_relatives.length > 0) {
      for (const relativeName of known_relatives.slice(0, 5)) {
        try {
          const relativePayload = { fullName: relativeName, location: locationContext };
          const relativeResponse = await supabase.functions.invoke('osint-people-search', {
            body: relativePayload
          });

          if (relativeResponse.data) {
            sourcesQueried.push(`relative_search:${relativeName}`);
            const normalizedRelative = normalizePeopleSearchResults(relativeResponse.data, relativeName);
            
            // Mark these as potential relatives
            normalizedRelative.forEach((person: any) => {
              person.discovered_via = 'known_relative_search';
              person.connected_to = fullName;
            });
            
            results.push(...normalizedRelative);
          }
        } catch (err) {
          console.error(`[person-graph-search] Relative search error for ${relativeName}:`, err);
        }
      }
    }

    // 4. If phone provided, do phone lookup
    if (phone) {
      try {
        const phoneResponse = await supabase.functions.invoke('osint-phone-lookup', {
          body: { phone }
        });

        if (phoneResponse.data) {
          sourcesQueried.push('phone_lookup');
          const normalizedPhone = normalizePhoneLookupResults(phoneResponse.data, phone);
          results.push(...normalizedPhone);
        }
      } catch (err) {
        console.error('[person-graph-search] Phone lookup error:', err);
      }
    }

    // 5. If email provided, do email intelligence
    if (email) {
      try {
        const emailResponse = await supabase.functions.invoke('osint-email-intelligence', {
          body: { email }
        });

        if (emailResponse.data) {
          sourcesQueried.push('email_intelligence');
          const normalizedEmail = normalizeEmailResults(emailResponse.data, email);
          results.push(...normalizedEmail);
        }
      } catch (err) {
        console.error('[person-graph-search] Email lookup error:', err);
      }
    }

    // Deduplicate and merge results
    const mergedResults = mergeAndDeduplicatePersons(results);

    // Calculate scores for each result
    const scoredResults = mergedResults.map(person => calculatePersonScores(person, searchRequest));

    // Sort by overall confidence
    scoredResults.sort((a, b) => (b.scores?.overall_confidence || 0) - (a.scores?.overall_confidence || 0));

    const response = {
      results: scoredResults.slice(0, limit),
      total_count: scoredResults.length,
      sources_queried: [...new Set(sourcesQueried)],
      search_id: searchId
    };

    console.log(`[person-graph-search] Returning ${response.results.length} results from ${response.sources_queried.length} sources`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[person-graph-search] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function normalizePeopleSearchResults(data: any, searchName: string): any[] {
  const persons: any[] = [];
  
  // Handle TruePeopleSearch format
  if (data.truePeopleSearch?.persons) {
    data.truePeopleSearch.persons.forEach((p: any) => {
      persons.push({
        id: `tps_${crypto.randomUUID().slice(0, 8)}`,
        source_ids: { truepeoplesearch: p.profileUrl || crypto.randomUUID() },
        name: {
          first: p.name?.split(' ')[0] || '',
          last: p.name?.split(' ').slice(-1)[0] || '',
          aliases: p.aka || []
        },
        age_band: p.age ? `${Math.floor(p.age / 5) * 5}-${Math.floor(p.age / 5) * 5 + 4}` : null,
        current_location: p.location ? parseLocation(p.location) : null,
        addresses: (p.addresses || []).map((addr: string, idx: number) => ({
          id: `addr_${idx}`,
          ...parseAddressString(addr),
          source: 'truepeoplesearch',
          confidence: 0.7
        })),
        phones: (p.phones || []).map((phone: string) => ({
          number: phone,
          type: 'unknown',
          is_current: true,
          source: 'truepeoplesearch',
          confidence: 0.7
        })),
        emails: (p.emails || []).map((email: string) => ({
          address: email,
          is_current: true,
          source: 'truepeoplesearch',
          confidence: 0.7
        })),
        relatives: p.relatives || [],
        scores: { overall_confidence: 0.7, current_us_presence: 0.8, global_presence: 0.1 }
      });
    });
  }

  // Handle FastPeopleSearch format
  if (data.fastPeopleSearch?.persons) {
    data.fastPeopleSearch.persons.forEach((p: any) => {
      persons.push({
        id: `fps_${crypto.randomUUID().slice(0, 8)}`,
        source_ids: { fastpeoplesearch: p.profileUrl || crypto.randomUUID() },
        name: {
          first: p.name?.split(' ')[0] || '',
          last: p.name?.split(' ').slice(-1)[0] || '',
          aliases: p.aka || []
        },
        age_band: p.age ? `${Math.floor(p.age / 5) * 5}-${Math.floor(p.age / 5) * 5 + 4}` : null,
        current_location: p.location ? parseLocation(p.location) : null,
        addresses: (p.addresses || []).map((addr: string, idx: number) => ({
          id: `addr_${idx}`,
          ...parseAddressString(addr),
          source: 'fastpeoplesearch',
          confidence: 0.7
        })),
        phones: (p.phones || []).map((phone: string) => ({
          number: phone,
          type: 'unknown',
          is_current: true,
          source: 'fastpeoplesearch',
          confidence: 0.7
        })),
        emails: (p.emails || []).map((email: string) => ({
          address: email,
          is_current: true,
          source: 'fastpeoplesearch',
          confidence: 0.7
        })),
        relatives: p.relatives || [],
        scores: { overall_confidence: 0.7, current_us_presence: 0.8, global_presence: 0.1 }
      });
    });
  }

  return persons;
}

function normalizePhoneLookupResults(data: any, phone: string): any[] {
  if (!data) return [];
  
  return [{
    id: `phone_${crypto.randomUUID().slice(0, 8)}`,
    source_ids: { phone_lookup: phone },
    name: data.name ? {
      first: data.name.split(' ')[0] || '',
      last: data.name.split(' ').slice(-1)[0] || ''
    } : { first: '', last: '' },
    phones: [{
      number: phone,
      type: data.lineType || 'unknown',
      is_current: true,
      source: 'phone_lookup',
      confidence: 0.8
    }],
    current_location: data.location ? parseLocation(data.location) : null,
    addresses: data.address ? [{ ...parseAddressString(data.address), source: 'phone_lookup', confidence: 0.75 }] : [],
    scores: { overall_confidence: 0.75, current_us_presence: 0.8, global_presence: 0.1 }
  }];
}

function normalizeEmailResults(data: any, email: string): any[] {
  if (!data) return [];
  
  const persons: any[] = [];
  
  if (data.owner) {
    persons.push({
      id: `email_${crypto.randomUUID().slice(0, 8)}`,
      source_ids: { email_intelligence: email },
      name: {
        first: data.owner.split(' ')[0] || '',
        last: data.owner.split(' ').slice(-1)[0] || ''
      },
      emails: [{
        address: email,
        is_current: true,
        source: 'email_intelligence',
        confidence: 0.85
      }],
      scores: { overall_confidence: 0.8, current_us_presence: 0.5, global_presence: 0.5 }
    });
  }

  return persons;
}

function parseLocation(locationStr: string): any {
  const parts = locationStr.split(',').map(s => s.trim());
  return {
    city: parts[0] || '',
    state: parts[1] || '',
    country: 'US',
    confidence: 0.7
  };
}

function parseAddressString(addrStr: string): any {
  // Simple address parsing - can be enhanced
  const parts = addrStr.split(',').map(s => s.trim());
  const lastPart = parts[parts.length - 1] || '';
  const stateZip = lastPart.split(' ');
  
  return {
    id: `addr_${crypto.randomUUID().slice(0, 8)}`,
    street: parts[0] || '',
    city: parts.length > 2 ? parts[parts.length - 2] : '',
    state: stateZip[0] || '',
    zip: stateZip[1] || '',
    country: 'US',
    is_current: true
  };
}

function mergeAndDeduplicatePersons(persons: any[]): any[] {
  const merged = new Map<string, any>();

  for (const person of persons) {
    // Create a key based on name similarity
    const nameKey = `${person.name?.first?.toLowerCase() || ''}_${person.name?.last?.toLowerCase() || ''}`;
    
    if (merged.has(nameKey)) {
      const existing = merged.get(nameKey);
      
      // Merge addresses
      const allAddresses = [...(existing.addresses || []), ...(person.addresses || [])];
      existing.addresses = deduplicateByField(allAddresses, 'street');
      
      // Merge phones
      const allPhones = [...(existing.phones || []), ...(person.phones || [])];
      existing.phones = deduplicateByField(allPhones, 'number');
      
      // Merge emails
      const allEmails = [...(existing.emails || []), ...(person.emails || [])];
      existing.emails = deduplicateByField(allEmails, 'address');
      
      // Merge source_ids
      existing.source_ids = { ...existing.source_ids, ...person.source_ids };
      
      // Merge aliases
      existing.name.aliases = [...new Set([...(existing.name.aliases || []), ...(person.name?.aliases || [])])];
      
      // Merge relatives
      existing.relatives = [...new Set([...(existing.relatives || []), ...(person.relatives || [])])];
      
      // Update confidence if higher
      if ((person.scores?.overall_confidence || 0) > (existing.scores?.overall_confidence || 0)) {
        existing.scores = person.scores;
      }
      
      merged.set(nameKey, existing);
    } else {
      merged.set(nameKey, { ...person });
    }
  }

  return Array.from(merged.values());
}

function deduplicateByField(items: any[], field: string): any[] {
  const seen = new Set();
  return items.filter(item => {
    const value = item[field]?.toLowerCase?.() || item[field];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function calculatePersonScores(person: any, searchRequest: SearchRequest): any {
  let confidence = 0.5;
  
  // Name match bonus
  if (searchRequest.first_name && person.name?.first?.toLowerCase() === searchRequest.first_name.toLowerCase()) {
    confidence += 0.15;
  }
  if (searchRequest.last_name && person.name?.last?.toLowerCase() === searchRequest.last_name.toLowerCase()) {
    confidence += 0.15;
  }
  
  // Location match bonus
  if (searchRequest.city && person.current_location?.city?.toLowerCase() === searchRequest.city.toLowerCase()) {
    confidence += 0.1;
  }
  if (searchRequest.state && person.current_location?.state?.toLowerCase() === searchRequest.state.toLowerCase()) {
    confidence += 0.05;
  }
  
  // Multi-source confirmation bonus
  const sourceCount = Object.keys(person.source_ids || {}).length;
  if (sourceCount > 1) {
    confidence += 0.1 * Math.min(sourceCount - 1, 3);
  }
  
  // Data completeness bonus
  if (person.addresses?.length > 0) confidence += 0.05;
  if (person.phones?.length > 0) confidence += 0.05;
  if (person.emails?.length > 0) confidence += 0.05;

  person.scores = {
    overall_confidence: Math.min(confidence, 1),
    current_us_presence: person.scores?.current_us_presence || 0.5,
    global_presence: person.scores?.global_presence || 0.1
  };

  return person;
}
