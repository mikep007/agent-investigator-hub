import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichRequest {
  person_id?: string;
  person?: any;
  enrich_sources?: string[];
  include_relatives?: boolean;
  include_addresses?: boolean;
  include_phones?: boolean;
  include_emails?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const enrichRequest: EnrichRequest = await req.json();
    console.log('[person-graph-enrich] Enrich request:', JSON.stringify(enrichRequest));

    const { 
      person_id, 
      person, 
      enrich_sources = ['all'],
      include_relatives = true,
      include_addresses = true,
      include_phones = true,
      include_emails = true
    } = enrichRequest;

    if (!person && !person_id) {
      return new Response(
        JSON.stringify({ error: 'Either person_id or person object required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let basePerson = person;

    // If person_id provided, fetch from cache
    if (person_id && !person) {
      const { data: cachedPerson } = await supabase
        .from('persons')
        .select('*')
        .eq('id', person_id)
        .single();
      
      if (cachedPerson) {
        basePerson = cachedPerson;
      }
    }

    if (!basePerson) {
      return new Response(
        JSON.stringify({ error: 'Person not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const enrichmentSources: string[] = [];
    const newDataFound = {
      addresses: 0,
      phones: 0,
      emails: 0,
      relatives: 0
    };

    const fullName = `${basePerson.name?.first || ''} ${basePerson.name?.last || ''}`.trim();
    const location = basePerson.current_location 
      ? `${basePerson.current_location.city || ''}, ${basePerson.current_location.state || ''}`.trim()
      : '';

    // 1. Enrich with IDCrawl for social profiles
    if (shouldEnrich(enrich_sources, 'idcrawl')) {
      try {
        console.log('[person-graph-enrich] Enriching with IDCrawl');
        const idcrawlResponse = await supabase.functions.invoke('osint-idcrawl', {
          body: { fullName, location }
        });

        if (idcrawlResponse.data?.profiles) {
          enrichmentSources.push('idcrawl');
          basePerson.social_profiles = basePerson.social_profiles || [];
          basePerson.social_profiles.push(...idcrawlResponse.data.profiles);
          basePerson.source_ids = basePerson.source_ids || {};
          basePerson.source_ids.social = basePerson.source_ids.social || [];
          
          idcrawlResponse.data.profiles.forEach((p: any) => {
            if (p.platform && p.url) {
              basePerson.source_ids.social.push(`${p.platform}:${p.url}`);
            }
          });
        }
      } catch (err) {
        console.error('[person-graph-enrich] IDCrawl error:', err);
      }
    }

    // 2. Enrich with Sherlock for username discovery
    if (shouldEnrich(enrich_sources, 'sherlock')) {
      try {
        // Try to extract potential usernames from existing data
        const potentialUsernames = extractPotentialUsernames(basePerson);
        
        for (const username of potentialUsernames.slice(0, 3)) {
          console.log('[person-graph-enrich] Enriching with Sherlock:', username);
          const sherlockResponse = await supabase.functions.invoke('osint-sherlock', {
            body: { username }
          });

          if (sherlockResponse.data?.profiles) {
            enrichmentSources.push('sherlock');
            basePerson.social_profiles = basePerson.social_profiles || [];
            basePerson.social_profiles.push(...sherlockResponse.data.profiles);
          }
        }
      } catch (err) {
        console.error('[person-graph-enrich] Sherlock error:', err);
      }
    }

    // 3. Enrich with email intelligence if emails exist
    if (include_emails && shouldEnrich(enrich_sources, 'email')) {
      const existingEmails = basePerson.emails || [];
      
      for (const emailObj of existingEmails.slice(0, 3)) {
        try {
          console.log('[person-graph-enrich] Enriching email:', emailObj.address);
          const emailResponse = await supabase.functions.invoke('osint-email-intelligence', {
            body: { email: emailObj.address }
          });

          if (emailResponse.data) {
            enrichmentSources.push('email_intelligence');
            
            // Add breach data if found
            if (emailResponse.data.breaches) {
              basePerson.breach_data = basePerson.breach_data || [];
              basePerson.breach_data.push(...emailResponse.data.breaches);
            }
            
            // Add social accounts found via email
            if (emailResponse.data.accounts) {
              basePerson.social_profiles = basePerson.social_profiles || [];
              emailResponse.data.accounts.forEach((acc: any) => {
                basePerson.social_profiles.push({
                  platform: acc.platform,
                  exists: acc.exists,
                  source: 'holehe'
                });
              });
            }
          }
        } catch (err) {
          console.error('[person-graph-enrich] Email enrichment error:', err);
        }
      }
    }

    // 4. Enrich with phone lookup
    if (include_phones && shouldEnrich(enrich_sources, 'phone')) {
      const existingPhones = basePerson.phones || [];
      
      for (const phoneObj of existingPhones.slice(0, 3)) {
        try {
          console.log('[person-graph-enrich] Enriching phone:', phoneObj.number);
          const phoneResponse = await supabase.functions.invoke('osint-phone-lookup', {
            body: { phone: phoneObj.number }
          });

          if (phoneResponse.data) {
            enrichmentSources.push('phone_lookup');
            
            // Update phone type if discovered
            if (phoneResponse.data.lineType) {
              phoneObj.type = phoneResponse.data.lineType;
              phoneObj.confidence = 0.9;
            }
            
            // Add carrier info
            if (phoneResponse.data.carrier) {
              phoneObj.carrier = phoneResponse.data.carrier;
            }
          }
        } catch (err) {
          console.error('[person-graph-enrich] Phone enrichment error:', err);
        }
      }
    }

    // 5. Enrich with address/property records
    if (include_addresses && shouldEnrich(enrich_sources, 'property')) {
      const addresses = basePerson.addresses || [];
      const currentAddress = addresses.find((a: any) => a.is_current) || addresses[0];
      
      if (currentAddress) {
        try {
          const addressStr = `${currentAddress.street}, ${currentAddress.city}, ${currentAddress.state} ${currentAddress.zip}`;
          console.log('[person-graph-enrich] Enriching address:', addressStr);
          
          const propertyResponse = await supabase.functions.invoke('osint-property-records', {
            body: { address: addressStr }
          });

          if (propertyResponse.data) {
            enrichmentSources.push('property_records');
            
            // Add property details
            currentAddress.property_details = propertyResponse.data;
            
            // Check for co-residents/relatives
            if (propertyResponse.data.occupants) {
              basePerson.potential_relatives = basePerson.potential_relatives || [];
              propertyResponse.data.occupants.forEach((occ: any) => {
                if (occ.name && occ.name !== fullName) {
                  basePerson.potential_relatives.push({
                    name: occ.name,
                    source: 'property_records',
                    relationship_type: 'co_resident',
                    confidence: 0.6
                  });
                  newDataFound.relatives++;
                }
              });
            }
            
            newDataFound.addresses++;
          }
        } catch (err) {
          console.error('[person-graph-enrich] Property enrichment error:', err);
        }
      }
    }

    // 6. Search for relatives if requested
    if (include_relatives && shouldEnrich(enrich_sources, 'relatives')) {
      const knownRelatives = basePerson.relatives || [];
      
      for (const relativeName of knownRelatives.slice(0, 5)) {
        try {
          console.log('[person-graph-enrich] Searching relative:', relativeName);
          
          const relativeSearch = await supabase.functions.invoke('person-graph-search', {
            body: {
              first_name: relativeName.split(' ')[0],
              last_name: relativeName.split(' ').slice(-1)[0],
              city: basePerson.current_location?.city,
              state: basePerson.current_location?.state
            }
          });

          if (relativeSearch.data?.results?.length > 0) {
            enrichmentSources.push('relative_search');
            
            basePerson.enriched_relatives = basePerson.enriched_relatives || [];
            basePerson.enriched_relatives.push({
              original_name: relativeName,
              matched_persons: relativeSearch.data.results.slice(0, 3),
              search_confidence: relativeSearch.data.results[0]?.scores?.overall_confidence || 0.5
            });
            
            newDataFound.relatives++;
          }
        } catch (err) {
          console.error('[person-graph-enrich] Relative search error:', err);
        }
      }
    }

    // Deduplicate social profiles
    if (basePerson.social_profiles) {
      basePerson.social_profiles = deduplicateSocialProfiles(basePerson.social_profiles);
    }

    // Update scores based on enrichment
    basePerson.scores = recalculateScores(basePerson, enrichmentSources);
    basePerson.updated_at = new Date().toISOString();

    const response = {
      person: basePerson,
      enrichment_sources: [...new Set(enrichmentSources)],
      new_data_found: newDataFound
    };

    console.log(`[person-graph-enrich] Enriched person with ${enrichmentSources.length} sources`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[person-graph-enrich] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function shouldEnrich(sources: string[], source: string): boolean {
  return sources.includes('all') || sources.includes(source);
}

function extractPotentialUsernames(person: any): string[] {
  const usernames: string[] = [];
  
  // Generate from name
  const firstName = person.name?.first?.toLowerCase() || '';
  const lastName = person.name?.last?.toLowerCase() || '';
  
  if (firstName && lastName) {
    usernames.push(`${firstName}${lastName}`);
    usernames.push(`${firstName}.${lastName}`);
    usernames.push(`${firstName}_${lastName}`);
    usernames.push(`${firstName[0]}${lastName}`);
  }
  
  // Extract from existing social profiles
  if (person.social_profiles) {
    person.social_profiles.forEach((p: any) => {
      if (p.username) usernames.push(p.username);
    });
  }
  
  // Extract from email addresses
  if (person.emails) {
    person.emails.forEach((e: any) => {
      const localPart = e.address?.split('@')[0];
      if (localPart) usernames.push(localPart);
    });
  }
  
  return [...new Set(usernames)];
}

function deduplicateSocialProfiles(profiles: any[]): any[] {
  const seen = new Map();
  
  return profiles.filter(p => {
    const key = `${p.platform?.toLowerCase()}_${p.url || p.username || ''}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

function recalculateScores(person: any, enrichmentSources: string[]): any {
  let confidence = person.scores?.overall_confidence || 0.5;
  
  // Boost for each enrichment source
  confidence += enrichmentSources.length * 0.05;
  
  // Boost for data completeness
  if (person.social_profiles?.length > 0) confidence += 0.05;
  if (person.breach_data?.length > 0) confidence += 0.03;
  if (person.enriched_relatives?.length > 0) confidence += 0.05;
  if (person.addresses?.some((a: any) => a.property_details)) confidence += 0.05;
  
  return {
    overall_confidence: Math.min(confidence, 0.99),
    current_us_presence: person.scores?.current_us_presence || 0.5,
    global_presence: Math.min((person.social_profiles?.length || 0) * 0.1, 0.8)
  };
}
