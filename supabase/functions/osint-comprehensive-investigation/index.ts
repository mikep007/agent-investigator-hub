import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchData {
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
  keywords?: string;
  knownRelatives?: string;
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

    const searchData: SearchData = await req.json();
    console.log('Starting comprehensive investigation:', searchData);

    // Validate that at least one search parameter is provided
    const hasAtLeastOneParam = searchData.fullName || searchData.email || 
                                 searchData.phone || searchData.username || 
                                 searchData.address;
    
    if (!hasAtLeastOneParam) {
      throw new Error('At least one search parameter is required');
    }

    // Determine the investigation target (use the first available parameter)
    const target = searchData.fullName || 
                   searchData.email || 
                   searchData.phone || 
                   searchData.username || 
                   searchData.address || 
                   'Unknown';

    // Create investigation record
    const { data: investigation, error: invError } = await supabaseClient
      .from('investigations')
      .insert({
        user_id: user.id,
        target: target,
        status: 'active'
      })
      .select()
      .single();

    if (invError) throw invError;
    console.log('Investigation created:', investigation.id);

    // Track which searches to run and their targets
    const searchPromises: Promise<any>[] = [];
    const searchTypes: string[] = [];

    // Parse keywords for matching
    const keywords = searchData.keywords 
      ? searchData.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
      : [];

    // Always run web search if we have full name or keywords
    if (searchData.fullName || keywords.length > 0) {
      const webSearchQuery = searchData.fullName
        ? (keywords.length > 0 
            ? `${searchData.fullName} ${keywords.join(' ')}`
            : searchData.fullName)
        : keywords.join(' ');
      
      searchPromises.push(
        supabaseClient.functions.invoke('osint-web-search', {
          body: { 
            target: webSearchQuery,
            searchData: searchData // Pass full context for Google Dork enhancement
          }
        })
      );
      searchTypes.push('web');
    }

    // People search for structured data (phones, emails, addresses, relatives)
    if (searchData.fullName) {
      const nameParts = searchData.fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0]; // Handle single names
      
      // Extract city/state from address if provided
      let city, state;
      if (searchData.address) {
        const addressMatch = searchData.address.match(/,\s*([^,]+),\s*([A-Z]{2})/i);
        if (addressMatch) {
          city = addressMatch[1].trim();
          state = addressMatch[2].trim().toUpperCase();
        }
      }
      
      // Pass ALL available data for cross-validation
      searchPromises.push(
        supabaseClient.functions.invoke('osint-people-search', {
          body: { 
            firstName,
            lastName,
            city,
            state,
            phone: searchData.phone,
            email: searchData.email,
            address: searchData.address,
            validateData: true, // Enable validation against provided data
          }
        })
      );
      searchTypes.push('people_search');

      // Social search for Facebook profiles using Google (searches by name)
      const locationForSocial = city && state ? `${city}, ${state}` : (searchData.address || '');
      searchPromises.push(
        supabaseClient.functions.invoke('osint-social-search', {
          body: { 
            target: searchData.fullName,
            searchType: 'name',
            fullName: searchData.fullName,
            location: locationForSocial,
          }
        })
      );
      searchTypes.push('social_name');

      // IDCrawl aggregator search - finds Facebook, LinkedIn, TikTok profiles and more
      searchPromises.push(
        supabaseClient.functions.invoke('osint-idcrawl', {
          body: { 
            fullName: searchData.fullName,
            location: locationForSocial,
            keywords: searchData.keywords,
          }
        })
      );
      searchTypes.push('idcrawl');
    }

    // Email enumeration
    if (searchData.email) {
      // Run Selector Enrichment - 80+ platform real-time account checks
      searchPromises.push(
        supabaseClient.functions.invoke('osint-selector-enrichment', {
          body: { selector: searchData.email }
        })
      );
      searchTypes.push('selector_enrichment_email');

      // Run Email Intelligence for associated emails (like OSINT Industries)
      searchPromises.push(
        supabaseClient.functions.invoke('osint-email-intelligence', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('email_intelligence');

      // Run Holehe for platform enumeration
      searchPromises.push(
        supabaseClient.functions.invoke('osint-holehe', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('holehe');

      // Run basic email validation and lookup
      searchPromises.push(
        supabaseClient.functions.invoke('osint-email-lookup', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('email');

      // Run social search for email mentions
      searchPromises.push(
        supabaseClient.functions.invoke('osint-social-search', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('social');

      // Run OSINT Industries API for email intelligence
      searchPromises.push(
        supabaseClient.functions.invoke('osint-industries', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('osint_industries');

      // Run LeakCheck for breach data (email)
      searchPromises.push(
        supabaseClient.functions.invoke('osint-leakcheck', {
          body: { target: searchData.email, type: 'email' }
        })
      );
      searchTypes.push('leakcheck');

      // Extract username from email local-part (before @) and run Sherlock
      const emailLocalPart = searchData.email.split('@')[0];
      if (emailLocalPart && emailLocalPart.length > 0) {
        console.log(`Extracted username from email: ${emailLocalPart}`);
        searchPromises.push(
          supabaseClient.functions.invoke('osint-sherlock', {
            body: { target: emailLocalPart }
          })
        );
        searchTypes.push('sherlock_from_email');

        // Also run web search for the exact email string
        searchPromises.push(
          supabaseClient.functions.invoke('osint-web-search', {
            body: { target: `"${searchData.email}"` }
          })
        );
        searchTypes.push('web_email_exact');

        // Instagram OSINT - Toutatis for contact info from email username
        searchPromises.push(
          supabaseClient.functions.invoke('osint-toutatis', {
            body: { target: emailLocalPart }
          })
        );
        searchTypes.push('toutatis_from_email');

        // Instagram OSINT - Instaloader for profile data from email username
        searchPromises.push(
          supabaseClient.functions.invoke('osint-instaloader', {
            body: { target: emailLocalPart, includePosts: false }
          })
        );
        searchTypes.push('instaloader_from_email');
      }
    }

    // Username enumeration
    if (searchData.username) {
      searchPromises.push(
        supabaseClient.functions.invoke('osint-sherlock', {
          body: { target: searchData.username }
        })
      );
      searchTypes.push('sherlock');

      searchPromises.push(
        supabaseClient.functions.invoke('osint-social-search', {
          body: { target: searchData.username }
        })
      );
      searchTypes.push('social');

      // Run LeakCheck for username breaches
      searchPromises.push(
        supabaseClient.functions.invoke('osint-leakcheck', {
          body: { target: searchData.username, type: 'username' }
        })
      );
      searchTypes.push('leakcheck_username');

      // Instagram OSINT - Toutatis for contact info extraction
      searchPromises.push(
        supabaseClient.functions.invoke('osint-toutatis', {
          body: { target: searchData.username }
        })
      );
      searchTypes.push('toutatis');

      // Instagram OSINT - Instaloader for profile data
      searchPromises.push(
        supabaseClient.functions.invoke('osint-instaloader', {
          body: { target: searchData.username, includePosts: true, postsLimit: 12 }
        })
      );
      searchTypes.push('instaloader');
    }

    // Phone lookup
    if (searchData.phone) {
      // Run Selector Enrichment for phone - 80+ platform real-time account checks (messaging apps)
      searchPromises.push(
        supabaseClient.functions.invoke('osint-selector-enrichment', {
          body: { selector: searchData.phone }
        })
      );
      searchTypes.push('selector_enrichment_phone');

      searchPromises.push(
        supabaseClient.functions.invoke('osint-phone-lookup', {
          body: { target: searchData.phone }
        })
      );
      searchTypes.push('phone');

      // Run web search for phone number
      searchPromises.push(
        supabaseClient.functions.invoke('osint-web-search', {
          body: { 
            target: `"${searchData.phone}"`,
            searchData: searchData
          }
        })
      );
      searchTypes.push('web_phone_search');

      // Run people search for phone number (FastPeopleSearch & TruePeopleSearch)
      // Include name context if available for better matching
      const phoneSearchBody: any = { phone: searchData.phone };
      if (searchData.fullName) {
        const nameParts = searchData.fullName.trim().split(/\s+/);
        phoneSearchBody.firstName = nameParts[0];
        phoneSearchBody.lastName = nameParts.slice(1).join(' ') || nameParts[0];
        phoneSearchBody.email = searchData.email;
        phoneSearchBody.address = searchData.address;
        phoneSearchBody.validateData = true;
      }
      searchPromises.push(
        supabaseClient.functions.invoke('osint-people-search', {
          body: phoneSearchBody
        })
      );
      searchTypes.push('people_search_phone');

      // Run LeakCheck for phone number breaches
      searchPromises.push(
        supabaseClient.functions.invoke('osint-leakcheck', {
          body: { target: searchData.phone, type: 'phone' }
        })
      );
      searchTypes.push('leakcheck_phone');
    }

    // Address search with enhanced lookups
    if (searchData.address) {
      // Basic geocoding and Street View
      searchPromises.push(
        supabaseClient.functions.invoke('osint-address-search', {
          body: { target: searchData.address }
        })
      );
      searchTypes.push('address');

      // Property records search for ownership, tax, and sales history
      searchPromises.push(
        supabaseClient.functions.invoke('osint-property-records', {
          body: { 
            address: searchData.address,
            ownerName: searchData.fullName,
          }
        })
      );
      searchTypes.push('property_records');

      // Web search for owner/property information with name+address context
      searchPromises.push(
        supabaseClient.functions.invoke('osint-web-search', {
          body: { 
            target: `"${searchData.address}" owner property records`,
            searchData: searchData
          }
        })
      );
      searchTypes.push('address_owner_search');

      // Web search for people associated with address
      searchPromises.push(
        supabaseClient.functions.invoke('osint-web-search', {
          body: { 
            target: `"${searchData.address}" residents people`,
            searchData: searchData
          }
        })
      );
      searchTypes.push('address_residents_search');

      // State business registry searches based on address state
      // Extract state abbreviation from address
      const stateMatch = searchData.address.match(/,\s*([A-Z]{2})\s*\d{5}/i) ||
                         searchData.address.match(/,\s*([A-Z]{2})\s*$/i);
      const detectedState = stateMatch ? stateMatch[1].toUpperCase() : null;
      
      // Also check for full state names
      const flMatch = searchData.address.match(/,\s*Florida\s*/i);
      const caMatch = searchData.address.match(/,\s*California\s*/i);
      const nyMatch = searchData.address.match(/,\s*New\s*York\s*/i);
      const txMatch = searchData.address.match(/,\s*Texas\s*/i);
      const nvMatch = searchData.address.match(/,\s*Nevada\s*/i);
      const gaMatch = searchData.address.match(/,\s*Georgia\s*/i);
      const azMatch = searchData.address.match(/,\s*Arizona\s*/i);
      
      const stateCode = detectedState || 
                        (flMatch ? 'FL' : null) ||
                        (caMatch ? 'CA' : null) ||
                        (nyMatch ? 'NY' : null) ||
                        (txMatch ? 'TX' : null) ||
                        (nvMatch ? 'NV' : null) ||
                        (gaMatch ? 'GA' : null) ||
                        (azMatch ? 'AZ' : null);
      
      if (stateCode === 'FL') {
        console.log('Florida address detected - running Sunbiz search');
        searchPromises.push(
          supabaseClient.functions.invoke('osint-sunbiz-search', {
            body: { 
              address: searchData.address,
              officerName: searchData.fullName,
              fullContext: {
                fullName: searchData.fullName,
                phone: searchData.phone,
                email: searchData.email,
              }
            }
          })
        );
        searchTypes.push('sunbiz');
      } else if (stateCode === 'CA' || stateCode === 'NY' || stateCode === 'TX' || stateCode === 'NV' || stateCode === 'DE' || stateCode === 'GA' || stateCode === 'AZ') {
        console.log(`${stateCode} address detected - running state business search`);
        searchPromises.push(
          supabaseClient.functions.invoke('osint-state-business-search', {
            body: { 
              state: stateCode,
              address: searchData.address,
              officerName: searchData.fullName,
              fullContext: {
                fullName: searchData.fullName,
                phone: searchData.phone,
                email: searchData.email,
              }
            }
          })
        );
        searchTypes.push(`state_business_${stateCode.toLowerCase()}`);
      }
    }

    // Also run Sunbiz if we have a name and might be in Florida (check for FL hints)
    if (searchData.fullName && !searchData.address) {
      // Run Sunbiz officer search for name even without address
      // This catches cases where someone is a registered agent/officer
      searchPromises.push(
        supabaseClient.functions.invoke('osint-sunbiz-search', {
          body: { 
            officerName: searchData.fullName,
            fullContext: {
              fullName: searchData.fullName,
              phone: searchData.phone,
              email: searchData.email,
            }
          }
        })
      );
      searchTypes.push('sunbiz_officer');
      
      // Also search other major state registries by officer name
      // California
      searchPromises.push(
        supabaseClient.functions.invoke('osint-state-business-search', {
          body: { 
            state: 'CA',
            officerName: searchData.fullName,
            fullContext: {
              fullName: searchData.fullName,
              phone: searchData.phone,
              email: searchData.email,
            }
          }
        })
      );
      searchTypes.push('state_business_ca_officer');
      
      // New York
      searchPromises.push(
        supabaseClient.functions.invoke('osint-state-business-search', {
          body: { 
            state: 'NY',
            officerName: searchData.fullName,
            fullContext: {
              fullName: searchData.fullName,
              phone: searchData.phone,
              email: searchData.email,
            }
          }
        })
      );
      searchTypes.push('state_business_ny_officer');
      
      // Texas
      searchPromises.push(
        supabaseClient.functions.invoke('osint-state-business-search', {
          body: { 
            state: 'TX',
            officerName: searchData.fullName,
            fullContext: {
              fullName: searchData.fullName,
              phone: searchData.phone,
              email: searchData.email,
            }
          }
        })
      );
      searchTypes.push('state_business_tx_officer');
      
      // Nevada
      searchPromises.push(
        supabaseClient.functions.invoke('osint-state-business-search', {
          body: { 
            state: 'NV',
            officerName: searchData.fullName,
            fullContext: {
              fullName: searchData.fullName,
              phone: searchData.phone,
              email: searchData.email,
            }
          }
        })
      );
      searchTypes.push('state_business_nv_officer');
      
      // Delaware
      searchPromises.push(
        supabaseClient.functions.invoke('osint-state-business-search', {
          body: { 
            state: 'DE',
            officerName: searchData.fullName,
            fullContext: {
              fullName: searchData.fullName,
              phone: searchData.phone,
              email: searchData.email,
            }
          }
        })
      );
      searchTypes.push('state_business_de_officer');
      
      // Georgia
      searchPromises.push(
        supabaseClient.functions.invoke('osint-state-business-search', {
          body: { 
            state: 'GA',
            officerName: searchData.fullName,
            fullContext: {
              fullName: searchData.fullName,
              phone: searchData.phone,
              email: searchData.email,
            }
          }
        })
      );
      searchTypes.push('state_business_ga_officer');
    }

    // Court Records search - criminal and civil records
    if (searchData.fullName) {
      const nameParts = searchData.fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0];
      
      // Extract state from address if available
      let state = 'PA'; // Default to PA
      if (searchData.address) {
        const stateMatch = searchData.address.match(/,\s*([A-Z]{2})\s*\d{5}/i) ||
                          searchData.address.match(/,\s*([A-Z]{2})\s*$/i);
        if (stateMatch) {
          state = stateMatch[1].toUpperCase();
        }
      }
      
      // Extract county from address if available
      let county;
      if (searchData.address) {
        const countyMatch = searchData.address.match(/([A-Za-z]+)\s+County/i);
        if (countyMatch) {
          county = countyMatch[1];
        }
      }
      
      searchPromises.push(
        supabaseClient.functions.invoke('osint-court-records', {
          body: { 
            firstName,
            lastName,
            state,
            county,
          }
        })
      );
      searchTypes.push('court_records');
    }

    // Known Relatives / Associates - Search for connections
    if (searchData.knownRelatives) {
      const relatives = searchData.knownRelatives
        .split(',')
        .map(r => r.trim())
        .filter(r => r.length >= 2);
      
      console.log(`Searching for ${relatives.length} known relatives/associates:`, relatives);
      
      for (const relativeName of relatives) {
        // Web search for connections between target and relative
        if (searchData.fullName) {
          searchPromises.push(
            supabaseClient.functions.invoke('osint-web-search', {
              body: { 
                target: `"${searchData.fullName}" "${relativeName}"`,
                searchData: {
                  ...searchData,
                  keywords: `${searchData.keywords || ''} ${relativeName}`.trim()
                }
              }
            })
          );
          searchTypes.push(`connection_${relativeName.replace(/\s+/g, '_').toLowerCase()}`);
        }
        
        // People search for the relative (to find shared addresses, phones)
        const nameParts = relativeName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || nameParts[0];
        
        // Extract location context from target's address
        let city, state;
        if (searchData.address) {
          const addressMatch = searchData.address.match(/,\s*([^,]+),\s*([A-Z]{2})/i);
          if (addressMatch) {
            city = addressMatch[1].trim();
            state = addressMatch[2].trim().toUpperCase();
          }
        }
        
        searchPromises.push(
          supabaseClient.functions.invoke('osint-people-search', {
            body: { 
              firstName,
              lastName,
              city,
              state,
              validateData: false, // Don't validate - just search
              connectionSearch: true, // Flag this as a connection search
              primaryTarget: searchData.fullName, // Pass primary target for correlation
            }
          })
        );
        searchTypes.push(`relative_search_${relativeName.replace(/\s+/g, '_').toLowerCase()}`);
        
        // IDCrawl search for each relative
        searchPromises.push(
          supabaseClient.functions.invoke('osint-idcrawl', {
            body: { 
              fullName: relativeName,
              location: city && state ? `${city}, ${state}` : '',
              keywords: searchData.fullName, // Use primary target name as keyword for correlation
            }
          })
        );
        searchTypes.push(`idcrawl_${relativeName.replace(/\s+/g, '_').toLowerCase()}`);
      }
    }

    console.log(`Running ${searchPromises.length} OSINT searches...`);
    const results = await Promise.allSettled(searchPromises);

    // Collect debug status for each search
    const searchDebug: Array<{
      type: string;
      status: string;
      error?: string;
      hasData?: boolean;
    }> = [];

    // Store findings with correlation data
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const agentType = searchTypes[i];

      if (result.status === 'fulfilled') {
        const { data, error } = result.value as { data: any; error: any };

        if (error) {
          console.error(`Error from ${agentType} function:`, error);
          const errorMessage = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
          searchDebug.push({
            type: agentType,
            status: 'error',
            error: errorMessage,
          });
          
          // Still create a finding with the error so the UI can display it
          if (agentType === 'web' || agentType.includes('web_')) {
            await supabaseClient.from('findings').insert({
              investigation_id: investigation.id,
              agent_type: 'Web',
              source: `OSINT-${agentType}`,
              data: {
                error: errorMessage,
                items: [],
                confirmedItems: [],
                possibleItems: [],
              },
              confidence_score: null,
              verification_status: 'needs_review',
            });
          }
          continue;
        }

        if (!data) {
          console.warn(`No data returned from ${agentType} function.`);
          searchDebug.push({ type: agentType, status: 'no_data', hasData: false });
          continue;
        }

        const findingData = data;

        searchDebug.push({ type: agentType, status: 'ok', hasData: true });

        // Add search context for correlation
        const enrichedData = {
          ...findingData,
          searchContext: {
            fullName: searchData.fullName || null,
            hasEmail: !!searchData.email,
            hasPhone: !!searchData.phone,
            hasUsername: !!searchData.username,
            hasAddress: !!searchData.address,
            hasKeywords: keywords.length > 0,
            keywords: keywords,
            totalDataPoints: [
              searchData.fullName,
              searchData.email,
              searchData.phone,
              searchData.username,
              searchData.address,
              searchData.keywords,
            ].filter(Boolean).length,
          },
        };

        // Calculate initial confidence score
        let confidenceScore = 50; // Base score

        // Boost confidence if multiple data points were provided
        const dataPoints = enrichedData.searchContext.totalDataPoints;
        if (dataPoints >= 5) confidenceScore += 35;
        else if (dataPoints >= 4) confidenceScore += 25;
        else if (dataPoints >= 3) confidenceScore += 15;
        else if (dataPoints >= 2) confidenceScore += 10;

        // Apply Google Dork co-occurrence boost from web search results
        if (findingData.items && Array.isArray(findingData.items)) {
          const maxBoost = Math.max(
            ...findingData.items.map((item: any) => item.confidenceBoost || 0)
          );
          if (maxBoost > 0) {
            confidenceScore += maxBoost * 100; // Convert decimal to percentage
            console.log(`Google Dork co-occurrence boost: +${maxBoost * 100}%`);
          }
        }

        // Keyword matching boost - check if any keywords appear in the finding data
        if (keywords.length > 0) {
          const findingDataStr = JSON.stringify(findingData).toLowerCase();
          const keywordMatches = keywords.filter((keyword) => findingDataStr.includes(keyword)).length;

          if (keywordMatches > 0) {
            // Boost score by 5% per keyword match, max 15%
            const keywordBoost = Math.min(keywordMatches * 5, 15);
            confidenceScore += keywordBoost;
            console.log(`Keyword matches found: ${keywordMatches}, boost: +${keywordBoost}%`);
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

        if (insertError) {
          console.error(`Error inserting ${agentType} findings:`, insertError);
        } else {
          console.log(`Stored ${agentType} findings with confidence: ${confidenceScore}%`);
        }
      } else {
        console.error(`OSINT search ${agentType} failed:`, result.reason);
        const errorMessage = typeof result.reason === 'string' ? result.reason : (result.reason?.message || JSON.stringify(result.reason));
        searchDebug.push({
          type: agentType,
          status: 'failed',
          error: errorMessage,
        });
        
        // Still create a finding with the error so the UI can display it
        if (agentType === 'web' || agentType.includes('web_')) {
          await supabaseClient.from('findings').insert({
            investigation_id: investigation.id,
            agent_type: 'Web',
            source: `OSINT-${agentType}`,
            data: {
              error: errorMessage,
              items: [],
              confirmedItems: [],
              possibleItems: [],
            },
            confidence_score: null,
            verification_status: 'needs_review',
          });
        }
      }
    }

    // If no findings were stored, insert a diagnostic record so the UI shows something
    if (searchDebug.length > 0) {
      try {
        const { error: diagError } = await supabaseClient.from('findings').insert({
          investigation_id: investigation.id,
          agent_type: 'System',
          source: 'OSINT-System',
          data: {
            message: 'OSINT searches completed',
            searchSummary: searchDebug,
          },
          confidence_score: null,
          verification_status: 'needs_review',
        });

        if (diagError) {
          console.error('Error inserting diagnostic finding:', diagError);
        }
      } catch (e) {
        console.error('Unexpected error inserting diagnostic finding:', e);
      }
    }

    return new Response(
      JSON.stringify({
        investigationId: investigation.id,
        searchesRun: searchPromises.length,
        searchTypes: searchTypes,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error in comprehensive investigation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
