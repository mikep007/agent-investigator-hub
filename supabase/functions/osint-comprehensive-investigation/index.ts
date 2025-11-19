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

    // Always run web search with full name
    searchPromises.push(
      supabaseClient.functions.invoke('osint-web-search', {
        body: { target: searchData.fullName }
      })
    );
    searchTypes.push('web');

    // Email enumeration
    if (searchData.email) {
      searchPromises.push(
        supabaseClient.functions.invoke('osint-holehe', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('holehe');

      searchPromises.push(
        supabaseClient.functions.invoke('osint-email-lookup', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('email');

      searchPromises.push(
        supabaseClient.functions.invoke('osint-social-search', {
          body: { target: searchData.email }
        })
      );
      searchTypes.push('social');
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

    // Address search
    if (searchData.address) {
      searchPromises.push(
        supabaseClient.functions.invoke('osint-address-search', {
          body: { target: searchData.address }
        })
      );
      searchTypes.push('address');
    }

    console.log(`Running ${searchPromises.length} OSINT searches...`);
    const results = await Promise.allSettled(searchPromises);

    // Store findings with correlation data
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const agentType = searchTypes[i];

      if (result.status === 'fulfilled' && result.value.data) {
        const findingData = result.value.data;
        
        // Add search context for correlation
        const enrichedData = {
          ...findingData,
          searchContext: {
            fullName: searchData.fullName,
            hasEmail: !!searchData.email,
            hasPhone: !!searchData.phone,
            hasUsername: !!searchData.username,
            hasAddress: !!searchData.address,
            totalDataPoints: [
              searchData.fullName,
              searchData.email,
              searchData.phone,
              searchData.username,
              searchData.address
            ].filter(Boolean).length
          }
        };

        // Calculate initial confidence score
        let confidenceScore = 50; // Base score
        
        // Boost confidence if multiple data points were provided
        const dataPoints = enrichedData.searchContext.totalDataPoints;
        if (dataPoints >= 4) confidenceScore += 30;
        else if (dataPoints >= 3) confidenceScore += 20;
        else if (dataPoints >= 2) confidenceScore += 10;

        // Store finding
        await supabaseClient
          .from('findings')
          .insert({
            investigation_id: investigation.id,
            agent_type: agentType.charAt(0).toUpperCase() + agentType.slice(1),
            source: `OSINT-${agentType}`,
            data: enrichedData,
            confidence_score: Math.min(confidenceScore, 100),
            verification_status: 'needs_review'
          });

        console.log(`Stored ${agentType} findings with confidence: ${confidenceScore}%`);
      }
    }

    return new Response(
      JSON.stringify({ 
        investigationId: investigation.id,
        searchesRun: searchPromises.length,
        searchTypes: searchTypes
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
