import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchData {
  fullName: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
  keywords?: string;
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

    // Create investigation record
    const { data: investigation, error: invError } = await supabaseClient
      .from('investigations')
      .insert({
        user_id: user.id,
        target: searchData.fullName,
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

    // Always run web search with full name + keywords + Google Dork operators
    const webSearchQuery = keywords.length > 0 
      ? `${searchData.fullName} ${keywords.join(' ')}`
      : searchData.fullName;
    
    searchPromises.push(
      supabaseClient.functions.invoke('osint-web-search', {
        body: { 
          target: webSearchQuery,
          searchData: searchData // Pass full context for Google Dork enhancement
        }
      })
    );
    searchTypes.push('web');

    // Email enumeration
    if (searchData.email) {
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

      // Run LeakCheck for breach data
      searchPromises.push(
        supabaseClient.functions.invoke('osint-leakcheck', {
          body: { email: searchData.email }
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
    }

    // Phone lookup
    if (searchData.phone) {
      searchPromises.push(
        supabaseClient.functions.invoke('osint-phone-lookup', {
          body: { target: searchData.phone }
        })
      );
      searchTypes.push('phone');
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
          searchDebug.push({
            type: agentType,
            status: 'error',
            error: typeof error === 'string' ? error : JSON.stringify(error),
          });
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
            fullName: searchData.fullName,
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
        searchDebug.push({
          type: agentType,
          status: 'failed',
          error: typeof result.reason === 'string' ? result.reason : JSON.stringify(result.reason),
        });
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
