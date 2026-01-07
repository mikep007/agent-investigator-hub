import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchQuery {
  first_name: string;
  last_name: string;
  middle_name?: string;
  city?: string;
  state?: string;
  country?: string;
  age_range?: { min: number; max: number };
}

interface SearchOptions {
  max_candidates?: number;
  min_us_presence_score?: number;
  include_relatives?: boolean;
}

interface SeedRelative {
  name: { first: string; last: string; middle?: string };
  relationship_hint: string;
  city?: string;
  state?: string;
  age_band?: string;
  sources: string[];
  seed_confidence: number;
}

interface Candidate {
  person: any;
  source_breakdown: {
    whitepages_hit: boolean;
    anywho_hit: boolean;
    truepeoplesearch_hit: boolean;
    fastpeoplesearch_hit: boolean;
  };
  scores: {
    candidate_match_score: number;
    name_location_match: number;
    age_band_match: number;
  };
  seed_relatives: SeedRelative[];
  seed_addresses: any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { query, options = {} }: { query: SearchQuery; options: SearchOptions } = await req.json();
    console.log('[search-people] Query:', JSON.stringify(query));

    const { first_name, last_name, middle_name, city, state, country = 'US' } = query;
    const { max_candidates = 5, min_us_presence_score = 0.6, include_relatives = true } = options;

    if (!first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: 'first_name and last_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullName = [first_name, middle_name, last_name].filter(Boolean).join(' ');
    const location = [city, state].filter(Boolean).join(', ');

    const candidates: Candidate[] = [];
    const sourceResults: Record<string, any> = {};

    // 1. Call osint-people-search (TruePeopleSearch + FastPeopleSearch)
    try {
      console.log('[search-people] Querying people search aggregators...');
      const peopleResponse = await supabase.functions.invoke('osint-people-search', {
        body: { fullName, location }
      });

      if (peopleResponse.data) {
        sourceResults.truepeoplesearch = peopleResponse.data.truePeopleSearch;
        sourceResults.fastpeoplesearch = peopleResponse.data.fastPeopleSearch;
      }
    } catch (err) {
      console.error('[search-people] People search error:', err);
    }

    // 2. Call osint-idcrawl for additional coverage
    try {
      console.log('[search-people] Querying IDCrawl...');
      const idcrawlResponse = await supabase.functions.invoke('osint-idcrawl', {
        body: { fullName, location }
      });

      if (idcrawlResponse.data) {
        sourceResults.idcrawl = idcrawlResponse.data;
      }
    } catch (err) {
      console.error('[search-people] IDCrawl error:', err);
    }

    // 3. Process TruePeopleSearch results
    if (sourceResults.truepeoplesearch?.persons) {
      for (const person of sourceResults.truepeoplesearch.persons) {
        const candidate = createCandidateFromPeopleSearch(
          person, 
          'truepeoplesearch',
          query,
          include_relatives
        );
        if (candidate.scores.candidate_match_score >= min_us_presence_score) {
          candidates.push(candidate);
        }
      }
    }

    // 4. Process FastPeopleSearch results
    if (sourceResults.fastpeoplesearch?.persons) {
      for (const person of sourceResults.fastpeoplesearch.persons) {
        const existingIdx = candidates.findIndex(c => 
          isSamePerson(c.person, person, query)
        );

        if (existingIdx >= 0) {
          // Merge with existing candidate
          candidates[existingIdx] = mergeCandidates(
            candidates[existingIdx],
            createCandidateFromPeopleSearch(person, 'fastpeoplesearch', query, include_relatives)
          );
        } else {
          const candidate = createCandidateFromPeopleSearch(
            person,
            'fastpeoplesearch',
            query,
            include_relatives
          );
          if (candidate.scores.candidate_match_score >= min_us_presence_score) {
            candidates.push(candidate);
          }
        }
      }
    }

    // 5. Sort by match score and limit
    candidates.sort((a, b) => b.scores.candidate_match_score - a.scores.candidate_match_score);
    const topCandidates = candidates.slice(0, max_candidates);

    // 6. Cross-reference relatives between candidates
    if (include_relatives) {
      crossReferenceRelatives(topCandidates);
    }

    const response = {
      candidates: topCandidates,
      search_metadata: {
        query,
        sources_queried: Object.keys(sourceResults),
        total_raw_results: countRawResults(sourceResults),
        filtered_candidates: topCandidates.length
      }
    };

    console.log(`[search-people] Returning ${topCandidates.length} candidates`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[search-people] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function createCandidateFromPeopleSearch(
  person: any,
  source: string,
  query: SearchQuery,
  includeRelatives: boolean
): Candidate {
  const nameParts = (person.name || '').split(' ');
  const personName = {
    first: nameParts[0] || '',
    middle: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : null,
    last: nameParts[nameParts.length - 1] || '',
    aliases: person.aka || []
  };

  const locationParts = (person.location || '').split(',').map((s: string) => s.trim());
  const currentLocation = {
    city: locationParts[0] || '',
    state: locationParts[1] || '',
    country: 'US',
    confidence: 0.7
  };

  // Calculate match scores
  const nameLocationMatch = calculateNameLocationMatch(personName, currentLocation, query);
  const ageBandMatch = calculateAgeBandMatch(person.age, query.age_range);
  const candidateMatchScore = (nameLocationMatch * 0.6) + (ageBandMatch * 0.2) + 0.2;

  // Parse addresses
  const addresses = (person.addresses || []).map((addr: string, idx: number) => 
    parseAddressString(addr, source, idx)
  );

  // Parse seed relatives
  const seedRelatives: SeedRelative[] = [];
  if (includeRelatives && person.relatives) {
    for (const relativeName of person.relatives) {
      const relNameParts = relativeName.split(' ');
      seedRelatives.push({
        name: {
          first: relNameParts[0] || '',
          last: relNameParts[relNameParts.length - 1] || ''
        },
        relationship_hint: inferRelationshipHint(personName, relNameParts),
        city: currentLocation.city,
        state: currentLocation.state,
        age_band: undefined,
        sources: [source],
        seed_confidence: 0.6
      });
    }
  }

  return {
    person: {
      id: `${source}_${crypto.randomUUID().slice(0, 8)}`,
      source_ids: { [source]: person.profileUrl || crypto.randomUUID() },
      name: personName,
      age: person.age,
      age_band: person.age ? `${Math.floor(person.age / 5) * 5}-${Math.floor(person.age / 5) * 5 + 4}` : null,
      current_location: currentLocation,
      addresses,
      phones: (person.phones || []).map((p: string) => ({
        number: p,
        type: 'unknown',
        is_current: true,
        source,
        confidence: 0.7
      })),
      emails: (person.emails || []).map((e: string) => ({
        address: e,
        is_current: true,
        source,
        confidence: 0.7
      })),
      scores: {
        overall_confidence: candidateMatchScore,
        current_us_presence: 0.8,
        global_presence: 0.1
      }
    },
    source_breakdown: {
      whitepages_hit: false,
      anywho_hit: false,
      truepeoplesearch_hit: source === 'truepeoplesearch',
      fastpeoplesearch_hit: source === 'fastpeoplesearch'
    },
    scores: {
      candidate_match_score: candidateMatchScore,
      name_location_match: nameLocationMatch,
      age_band_match: ageBandMatch
    },
    seed_relatives: seedRelatives,
    seed_addresses: addresses
  };
}

function calculateNameLocationMatch(
  personName: any,
  location: any,
  query: SearchQuery
): number {
  let score = 0.5;

  // First name match
  if (personName.first?.toLowerCase() === query.first_name?.toLowerCase()) {
    score += 0.2;
  } else if (personName.first?.toLowerCase().startsWith(query.first_name?.toLowerCase().slice(0, 3))) {
    score += 0.1;
  }

  // Last name match
  if (personName.last?.toLowerCase() === query.last_name?.toLowerCase()) {
    score += 0.15;
  }

  // City match
  if (query.city && location.city?.toLowerCase() === query.city.toLowerCase()) {
    score += 0.1;
  }

  // State match
  if (query.state && location.state?.toLowerCase() === query.state.toLowerCase()) {
    score += 0.05;
  }

  return Math.min(score, 1);
}

function calculateAgeBandMatch(personAge: number | null, queryAgeRange?: { min: number; max: number }): number {
  if (!personAge || !queryAgeRange) return 0.5;
  
  if (personAge >= queryAgeRange.min && personAge <= queryAgeRange.max) {
    return 1.0;
  }
  
  const distance = Math.min(
    Math.abs(personAge - queryAgeRange.min),
    Math.abs(personAge - queryAgeRange.max)
  );
  
  return Math.max(0, 1 - (distance * 0.1));
}

function parseAddressString(addrStr: string, source: string, idx: number): any {
  const parts = addrStr.split(',').map(s => s.trim());
  const lastPart = parts[parts.length - 1] || '';
  const stateZip = lastPart.split(' ');

  return {
    id: `addr_${idx}_${crypto.randomUUID().slice(0, 6)}`,
    street: parts[0] || '',
    city: parts.length > 2 ? parts[parts.length - 2] : '',
    state: stateZip[0] || '',
    zip: stateZip[1] || '',
    country: 'US',
    is_current: idx === 0,
    source,
    confidence: 0.7,
    from_year: null,
    to_year: null
  };
}

function inferRelationshipHint(personName: any, relativeNameParts: string[]): string {
  const relativeLast = relativeNameParts[relativeNameParts.length - 1]?.toLowerCase();
  const personLast = personName.last?.toLowerCase();

  if (relativeLast === personLast) {
    return 'possible_sibling';
  }
  return 'possible_relative';
}

function isSamePerson(person1: any, person2: any, query: SearchQuery): boolean {
  const name1 = person1.name;
  const name2Parts = (person2.name || '').split(' ');
  const name2 = {
    first: name2Parts[0] || '',
    last: name2Parts[name2Parts.length - 1] || ''
  };

  return (
    name1.first?.toLowerCase() === name2.first?.toLowerCase() &&
    name1.last?.toLowerCase() === name2.last?.toLowerCase()
  );
}

function mergeCandidates(existing: Candidate, newCandidate: Candidate): Candidate {
  // Merge source breakdown
  existing.source_breakdown = {
    ...existing.source_breakdown,
    ...newCandidate.source_breakdown
  };

  // Merge source_ids
  existing.person.source_ids = {
    ...existing.person.source_ids,
    ...newCandidate.person.source_ids
  };

  // Merge addresses (deduplicate)
  const existingAddrs = new Set(existing.person.addresses.map((a: any) => a.street?.toLowerCase()));
  for (const addr of newCandidate.person.addresses) {
    if (!existingAddrs.has(addr.street?.toLowerCase())) {
      existing.person.addresses.push(addr);
      existing.seed_addresses.push(addr);
    }
  }

  // Merge phones (deduplicate)
  const existingPhones = new Set(existing.person.phones.map((p: any) => p.number));
  for (const phone of newCandidate.person.phones) {
    if (!existingPhones.has(phone.number)) {
      existing.person.phones.push(phone);
    }
  }

  // Merge relatives (deduplicate and boost confidence)
  const existingRelNames = new Map(
    existing.seed_relatives.map(r => [`${r.name.first}_${r.name.last}`.toLowerCase(), r])
  );
  
  for (const rel of newCandidate.seed_relatives) {
    const key = `${rel.name.first}_${rel.name.last}`.toLowerCase();
    if (existingRelNames.has(key)) {
      const existingRel = existingRelNames.get(key)!;
      existingRel.sources = [...new Set([...existingRel.sources, ...rel.sources])];
      existingRel.seed_confidence = Math.min(existingRel.seed_confidence + 0.15, 0.95);
    } else {
      existing.seed_relatives.push(rel);
    }
  }

  // Boost scores for multi-source confirmation
  existing.scores.candidate_match_score = Math.min(
    existing.scores.candidate_match_score + 0.1,
    0.99
  );
  existing.person.scores.overall_confidence = existing.scores.candidate_match_score;

  return existing;
}

function crossReferenceRelatives(candidates: Candidate[]): void {
  // Check if relatives appear across multiple candidates
  const relativeMap = new Map<string, { count: number; candidates: string[] }>();

  for (const candidate of candidates) {
    for (const rel of candidate.seed_relatives) {
      const key = `${rel.name.first}_${rel.name.last}`.toLowerCase();
      if (!relativeMap.has(key)) {
        relativeMap.set(key, { count: 0, candidates: [] });
      }
      const entry = relativeMap.get(key)!;
      entry.count++;
      entry.candidates.push(candidate.person.id);
    }
  }

  // Boost confidence for relatives that appear in multiple candidate results
  for (const candidate of candidates) {
    for (const rel of candidate.seed_relatives) {
      const key = `${rel.name.first}_${rel.name.last}`.toLowerCase();
      const entry = relativeMap.get(key);
      if (entry && entry.count > 1) {
        rel.seed_confidence = Math.min(rel.seed_confidence + 0.1, 0.95);
      }
    }
  }
}

function countRawResults(sourceResults: Record<string, any>): number {
  let count = 0;
  if (sourceResults.truepeoplesearch?.persons) count += sourceResults.truepeoplesearch.persons.length;
  if (sourceResults.fastpeoplesearch?.persons) count += sourceResults.fastpeoplesearch.persons.length;
  if (sourceResults.idcrawl?.profiles) count += sourceResults.idcrawl.profiles.length;
  return count;
}
