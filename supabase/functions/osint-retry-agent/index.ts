import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetryRequest {
  investigationId: string;
  agentType: string;
  searchData: {
    fullName?: string;
    address?: string;
    email?: string;
    phone?: string;
    username?: string;
    keywords?: string;
  };
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

    const { investigationId, agentType, searchData }: RetryRequest = await req.json();
    
    console.log(`Retrying agent: ${agentType} for investigation: ${investigationId}`);

    // Map agent types to function calls
    let functionName = '';
    let functionBody: any = {};

    switch (agentType.toLowerCase()) {
      case 'web':
      case 'web_email_exact':
      case 'web_phone_search':
      case 'address_owner_search':
      case 'address_residents_search':
        functionName = 'osint-web-search';
        if (agentType === 'web') {
          const keywords = searchData.keywords 
            ? searchData.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
            : [];
          const webSearchQuery = searchData.fullName
            ? (keywords.length > 0 
                ? `${searchData.fullName} ${keywords.join(' ')}`
                : searchData.fullName)
            : keywords.join(' ');
          functionBody = { target: webSearchQuery, searchData };
        } else if (agentType === 'web_email_exact') {
          functionBody = { target: `"${searchData.email}"` };
        } else if (agentType === 'web_phone_search') {
          functionBody = { target: `"${searchData.phone}"`, searchData };
        } else if (agentType === 'address_owner_search') {
          functionBody = { target: `"${searchData.address}" owner property records`, searchData };
        } else if (agentType === 'address_residents_search') {
          functionBody = { target: `"${searchData.address}" residents people`, searchData };
        }
        break;

      case 'holehe':
        functionName = 'osint-holehe';
        functionBody = { target: searchData.email };
        break;

      case 'sherlock':
      case 'sherlock_from_email':
        functionName = 'osint-sherlock';
        functionBody = { 
          target: agentType === 'sherlock_from_email' 
            ? searchData.email?.split('@')[0] 
            : searchData.username 
        };
        break;

      case 'email':
        functionName = 'osint-email-lookup';
        functionBody = { target: searchData.email };
        break;

      case 'phone':
        functionName = 'osint-phone-lookup';
        functionBody = { target: searchData.phone };
        break;

      case 'social':
        functionName = 'osint-social-search';
        functionBody = { target: searchData.email || searchData.username };
        break;

      case 'osint_industries':
        functionName = 'osint-industries';
        functionBody = { target: searchData.email };
        break;

      case 'leakcheck':
      case 'leakcheck_username':
      case 'leakcheck_phone':
        functionName = 'osint-leakcheck';
        const leakType = agentType === 'leakcheck_username' ? 'username' 
                      : agentType === 'leakcheck_phone' ? 'phone' 
                      : 'email';
        const leakTarget = leakType === 'email' ? searchData.email
                        : leakType === 'phone' ? searchData.phone
                        : searchData.username;
        functionBody = { target: leakTarget, type: leakType };
        break;

      case 'people_search':
      case 'people_search_phone':
        functionName = 'osint-people-search';
        if (agentType === 'people_search_phone') {
          functionBody = { phone: searchData.phone };
        } else {
          const nameParts = searchData.fullName?.trim().split(/\s+/) || [];
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(' ') || nameParts[0];
          let city, state;
          if (searchData.address) {
            const addressMatch = searchData.address.match(/,\s*([^,]+),\s*([A-Z]{2})/i);
            if (addressMatch) {
              city = addressMatch[1].trim();
              state = addressMatch[2].trim().toUpperCase();
            }
          }
          functionBody = { firstName, lastName, city, state };
        }
        break;

      case 'address':
        functionName = 'osint-address-search';
        functionBody = { target: searchData.address };
        break;

      case 'court_records':
        functionName = 'osint-court-records';
        const courtNameParts = searchData.fullName?.trim().split(/\s+/) || [];
        const courtFirstName = courtNameParts[0] || '';
        const courtLastName = courtNameParts.slice(1).join(' ') || courtNameParts[0] || '';
        let courtState, courtCounty;
        if (searchData.address) {
          const stateMatch = searchData.address.match(/,\s*([A-Z]{2})\s*\d{5}/i) || 
                            searchData.address.match(/,\s*([A-Z]{2})$/i);
          if (stateMatch) courtState = stateMatch[1].toUpperCase();
          const countyMatch = searchData.address.match(/([^,]+)\s+County/i);
          if (countyMatch) courtCounty = countyMatch[1].trim();
        }
        functionBody = { firstName: courtFirstName, lastName: courtLastName, state: courtState, county: courtCounty };
        break;

      case 'idcrawl':
        functionName = 'osint-idcrawl';
        functionBody = { fullName: searchData.fullName, location: searchData.address, keywords: searchData.keywords };
        break;

      case 'social_name':
        functionName = 'osint-social-search';
        functionBody = { target: searchData.fullName, type: 'name', fullName: searchData.fullName, location: searchData.address };
        break;

      case 'toutatis':
      case 'toutatis_from_email':
        functionName = 'osint-toutatis';
        functionBody = { 
          target: agentType === 'toutatis_from_email' 
            ? searchData.email?.split('@')[0] 
            : searchData.username 
        };
        break;

      case 'instaloader':
      case 'instaloader_from_email':
        functionName = 'osint-instaloader';
        functionBody = { 
          target: agentType === 'instaloader_from_email' 
            ? searchData.email?.split('@')[0] 
            : searchData.username,
          includePosts: agentType !== 'instaloader_from_email',
          postsLimit: 12
        };
        break;

      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }

    console.log(`Invoking ${functionName} with body:`, functionBody);
    
    const { data, error } = await supabaseClient.functions.invoke(functionName, {
      body: functionBody
    });

    if (error) {
      console.error(`Retry failed for ${agentType}:`, error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message || 'Agent retry failed',
          agentType 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No data returned from agent',
          agentType 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Calculate confidence score
    const keywords = searchData.keywords 
      ? searchData.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
      : [];

    const enrichedData = {
      ...data,
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

    let confidenceScore = 50;
    const dataPoints = enrichedData.searchContext.totalDataPoints;
    if (dataPoints >= 5) confidenceScore += 35;
    else if (dataPoints >= 4) confidenceScore += 25;
    else if (dataPoints >= 3) confidenceScore += 15;
    else if (dataPoints >= 2) confidenceScore += 10;

    if (data.items && Array.isArray(data.items)) {
      const maxBoost = Math.max(...data.items.map((item: any) => item.confidenceBoost || 0));
      if (maxBoost > 0) confidenceScore += maxBoost * 100;
    }

    if (keywords.length > 0) {
      const findingDataStr = JSON.stringify(data).toLowerCase();
      const keywordMatches = keywords.filter((keyword) => findingDataStr.includes(keyword)).length;
      if (keywordMatches > 0) {
        confidenceScore += Math.min(keywordMatches * 5, 15);
      }
    }

    // Store new finding
    const { error: insertError } = await supabaseClient.from('findings').insert({
      investigation_id: investigationId,
      agent_type: agentType.charAt(0).toUpperCase() + agentType.slice(1),
      source: `OSINT-${agentType}`,
      data: enrichedData,
      confidence_score: Math.min(confidenceScore, 100),
      verification_status: 'needs_review',
    });

    if (insertError) {
      console.error(`Error inserting retry findings:`, insertError);
      throw insertError;
    }

    console.log(`Successfully retried ${agentType} with confidence: ${confidenceScore}%`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        agentType,
        confidenceScore: Math.min(confidenceScore, 100)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in retry agent:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
