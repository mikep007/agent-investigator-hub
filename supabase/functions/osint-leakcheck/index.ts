import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeakCheckResult {
  success: boolean;
  found: number;
  fields: string[];
  sources: BreachSource[];
}

interface BreachSource {
  name: string;
  date: string;
  line?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target, type } = await req.json(); // target can be email, phone, or username
    const searchType = type || 'email'; // Default to email for backwards compatibility
    console.log(`LeakCheck search for ${searchType}:`, target);

    const leakCheckApiKey = Deno.env.get('LEAKCHECK_API_KEY');
    if (!leakCheckApiKey) {
      throw new Error('LEAKCHECK_API_KEY not configured');
    }

    // Call LeakCheck.io API
    const response = await fetch(`https://leakcheck.io/api/public?check=${encodeURIComponent(target)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': leakCheckApiKey,
      },
    });

    if (!response.ok) {
      console.error('LeakCheck API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      
      return new Response(JSON.stringify({ 
        error: `LeakCheck API error: ${response.statusText}`,
        found: 0,
        sources: []
      }), {
        status: 200, // Return 200 to not break the investigation flow
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data: LeakCheckResult = await response.json();
    console.log('LeakCheck results:', {
      found: data.found,
      sources: data.sources?.length || 0,
    });

    return new Response(JSON.stringify({
      target,
      type: searchType,
      found: data.found || 0,
      fields: data.fields || [],
      sources: data.sources || [],
      success: data.success,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-leakcheck:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      found: 0,
      sources: []
    }), {
      status: 200, // Return 200 to not break the investigation flow
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
