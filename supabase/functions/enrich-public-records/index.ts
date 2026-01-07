import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddressInput {
  id: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

interface PersonInput {
  id: string;
  name: { first: string; last: string; middle?: string };
}

interface EnrichOptions {
  include_property_records?: boolean;
  include_corporate_filings?: boolean;
  include_court_records?: boolean;
}

interface AddressResult {
  id: string;
  parcel_owner_names: string[];
  owner_match_person_ids: string[];
  owner_match_confidence: number;
  household_members: string[];
  property_details?: {
    property_type?: string;
    year_built?: number;
    assessed_value?: number;
    last_sale_date?: string;
    last_sale_price?: number;
  };
  score_flags: {
    owner_is_subject: boolean;
    owner_in_relatives: boolean;
    multi_person_household: boolean;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { addresses, persons, options = {} }: { 
      addresses: AddressInput[]; 
      persons: PersonInput[];
      options: EnrichOptions;
    } = await req.json();

    console.log('[enrich-public-records] Addresses:', addresses.length, 'Persons:', persons.length);

    const {
      include_property_records = true,
      include_corporate_filings = false,
      include_court_records = false
    } = options;

    const addressResults: AddressResult[] = [];
    const corporateResults: any[] = [];
    const courtResults: any[] = [];

    // Create person name lookup map
    const personNameMap = new Map<string, string>();
    for (const person of persons) {
      const fullName = `${person.name.first} ${person.name.last}`.toLowerCase();
      personNameMap.set(fullName, person.id);
      
      // Also add variations
      if (person.name.middle) {
        personNameMap.set(
          `${person.name.first} ${person.name.middle} ${person.name.last}`.toLowerCase(),
          person.id
        );
        personNameMap.set(
          `${person.name.first} ${person.name.middle[0]} ${person.name.last}`.toLowerCase(),
          person.id
        );
      }
    }

    // 1. Process each address for property records
    if (include_property_records) {
      for (const address of addresses) {
        console.log(`[enrich-public-records] Processing address: ${address.street}, ${address.city}`);
        
        const addressString = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
        
        try {
          // Call property records search
          const propertyResponse = await supabase.functions.invoke('osint-property-records', {
            body: { address: addressString }
          });

          const result = processPropertyResult(
            propertyResponse.data,
            address,
            personNameMap,
            persons
          );
          
          addressResults.push(result);
        } catch (err) {
          console.error(`[enrich-public-records] Property search error for ${address.id}:`, err);
          
          // Add placeholder result
          addressResults.push({
            id: address.id,
            parcel_owner_names: [],
            owner_match_person_ids: [],
            owner_match_confidence: 0,
            household_members: [],
            score_flags: {
              owner_is_subject: false,
              owner_in_relatives: false,
              multi_person_household: false
            }
          });
        }

        // Also search address for residents
        try {
          const addressSearchResponse = await supabase.functions.invoke('osint-address-search', {
            body: { address: addressString }
          });

          if (addressSearchResponse.data?.residents) {
            const existingResult = addressResults.find(r => r.id === address.id);
            if (existingResult) {
              // Add residents to household members
              for (const resident of addressSearchResponse.data.residents) {
                const residentName = typeof resident === 'string' ? resident : resident.name;
                if (residentName && !existingResult.household_members.includes(residentName)) {
                  existingResult.household_members.push(residentName);
                  
                  // Check if resident matches any person
                  const personId = matchPersonName(residentName, personNameMap);
                  if (personId && !existingResult.owner_match_person_ids.includes(personId)) {
                    existingResult.owner_match_person_ids.push(personId);
                    existingResult.score_flags.owner_in_relatives = true;
                  }
                }
              }
              
              existingResult.score_flags.multi_person_household = 
                existingResult.household_members.length > 1;
            }
          }
        } catch (err) {
          console.error(`[enrich-public-records] Address search error:`, err);
        }
      }
    }

    // 2. Search for corporate filings
    if (include_corporate_filings && persons.length > 0) {
      for (const person of persons.slice(0, 5)) {
        try {
          console.log(`[enrich-public-records] Corporate search for: ${person.name.first} ${person.name.last}`);
          
          const corporateResponse = await supabase.functions.invoke('osint-sunbiz-search', {
            body: {
              searchTerm: `${person.name.first} ${person.name.last}`,
              searchType: 'officer'
            }
          });

          if (corporateResponse.data?.results) {
            for (const result of corporateResponse.data.results) {
              corporateResults.push({
                person_id: person.id,
                entity_name: result.entity_name,
                entity_number: result.entity_number,
                status: result.status,
                role: result.role || 'officer',
                source: 'sunbiz'
              });
            }
          }

          // Also check state business search
          const stateResponse = await supabase.functions.invoke('osint-state-business-search', {
            body: {
              searchTerm: `${person.name.first} ${person.name.last}`,
              state: addresses[0]?.state || 'FL'
            }
          });

          if (stateResponse.data?.results) {
            for (const result of stateResponse.data.results) {
              const exists = corporateResults.some(c => 
                c.entity_name === result.entity_name && c.person_id === person.id
              );
              if (!exists) {
                corporateResults.push({
                  person_id: person.id,
                  entity_name: result.entity_name,
                  entity_number: result.entity_number,
                  status: result.status,
                  role: result.role || 'associated',
                  source: 'state_business'
                });
              }
            }
          }
        } catch (err) {
          console.error(`[enrich-public-records] Corporate search error:`, err);
        }
      }
    }

    // 3. Search for court records
    if (include_court_records && persons.length > 0) {
      for (const person of persons.slice(0, 3)) {
        try {
          console.log(`[enrich-public-records] Court records search for: ${person.name.first} ${person.name.last}`);
          
          const courtResponse = await supabase.functions.invoke('osint-court-records', {
            body: {
              firstName: person.name.first,
              lastName: person.name.last,
              state: addresses[0]?.state
            }
          });

          if (courtResponse.data?.records) {
            for (const record of courtResponse.data.records) {
              courtResults.push({
                person_id: person.id,
                case_number: record.case_number,
                case_type: record.case_type,
                court: record.court,
                filing_date: record.filing_date,
                status: record.status,
                source: 'court_records'
              });
            }
          }
        } catch (err) {
          console.error(`[enrich-public-records] Court records error:`, err);
        }
      }
    }

    // 4. Cross-reference address ownership with persons
    for (const addrResult of addressResults) {
      calculateOwnershipConfidence(addrResult, persons);
    }

    const response = {
      addresses: addressResults,
      corporate_filings: include_corporate_filings ? corporateResults : undefined,
      court_records: include_court_records ? courtResults : undefined,
      enrichment_metadata: {
        addresses_processed: addressResults.length,
        corporate_entities_found: corporateResults.length,
        court_cases_found: courtResults.length
      }
    };

    console.log(`[enrich-public-records] Completed. ${addressResults.length} addresses, ${corporateResults.length} corporate, ${courtResults.length} court`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[enrich-public-records] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function processPropertyResult(
  propertyData: any,
  address: AddressInput,
  personNameMap: Map<string, string>,
  persons: PersonInput[]
): AddressResult {
  const result: AddressResult = {
    id: address.id,
    parcel_owner_names: [],
    owner_match_person_ids: [],
    owner_match_confidence: 0,
    household_members: [],
    score_flags: {
      owner_is_subject: false,
      owner_in_relatives: false,
      multi_person_household: false
    }
  };

  if (!propertyData) return result;

  // Extract owner names
  if (propertyData.owner || propertyData.owners) {
    const owners = propertyData.owners || [propertyData.owner];
    for (const owner of owners) {
      const ownerName = typeof owner === 'string' ? owner : owner.name;
      if (ownerName) {
        result.parcel_owner_names.push(ownerName);
        result.household_members.push(ownerName);

        // Check if owner matches any person
        const personId = matchPersonName(ownerName, personNameMap);
        if (personId) {
          result.owner_match_person_ids.push(personId);
          
          // Check if this is the primary subject (first person)
          if (persons.length > 0 && personId === persons[0].id) {
            result.score_flags.owner_is_subject = true;
          } else {
            result.score_flags.owner_in_relatives = true;
          }
        }
      }
    }
  }

  // Extract property details
  if (propertyData.property_type || propertyData.year_built || propertyData.value) {
    result.property_details = {
      property_type: propertyData.property_type,
      year_built: propertyData.year_built,
      assessed_value: propertyData.assessed_value || propertyData.value,
      last_sale_date: propertyData.last_sale_date,
      last_sale_price: propertyData.last_sale_price
    };
  }

  // Extract residents/occupants
  if (propertyData.residents || propertyData.occupants) {
    const residents = propertyData.residents || propertyData.occupants || [];
    for (const resident of residents) {
      const residentName = typeof resident === 'string' ? resident : resident.name;
      if (residentName && !result.household_members.includes(residentName)) {
        result.household_members.push(residentName);
      }
    }
  }

  result.score_flags.multi_person_household = result.household_members.length > 1;

  return result;
}

function matchPersonName(name: string, personNameMap: Map<string, string>): string | null {
  const normalizedName = name.toLowerCase().trim();
  
  // Direct match
  if (personNameMap.has(normalizedName)) {
    return personNameMap.get(normalizedName)!;
  }

  // Try partial matching
  for (const [mapName, personId] of personNameMap) {
    // Check if all parts of the map name are in the search name
    const mapParts = mapName.split(' ');
    const nameParts = normalizedName.split(' ');
    
    const firstMatch = mapParts[0] === nameParts[0];
    const lastMatch = mapParts[mapParts.length - 1] === nameParts[nameParts.length - 1];
    
    if (firstMatch && lastMatch) {
      return personId;
    }
  }

  return null;
}

function calculateOwnershipConfidence(result: AddressResult, persons: PersonInput[]): void {
  let confidence = 0;

  // Base confidence from having owner data
  if (result.parcel_owner_names.length > 0) {
    confidence = 0.5;
  }

  // Boost for matching subjects
  if (result.score_flags.owner_is_subject) {
    confidence += 0.3;
  }

  // Boost for matching relatives
  if (result.score_flags.owner_in_relatives) {
    confidence += 0.15;
  }

  // Boost for multiple household members matching
  const matchedCount = result.owner_match_person_ids.length;
  if (matchedCount > 1) {
    confidence += Math.min(matchedCount * 0.05, 0.15);
  }

  result.owner_match_confidence = Math.min(confidence, 0.98);
}
