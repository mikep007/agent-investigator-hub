import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('OSINT Industries lookup for:', target);

    const OSINT_INDUSTRIES_API_KEY = Deno.env.get('OSINT_INDUSTRIES_API_KEY');
    
    if (!OSINT_INDUSTRIES_API_KEY) {
      console.warn('OSINT Industries API key not configured');
      return new Response(JSON.stringify({ 
        error: 'OSINT Industries API key not configured',
        configured: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // OSINT Industries API endpoint for email intelligence
    const response = await fetch('https://api.osint.industries/v1/email/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OSINT_INDUSTRIES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: target
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OSINT Industries API error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        error: `API error: ${response.status}`,
        details: errorText
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status
      });
    }

    const data = await response.json();
    console.log('OSINT Industries results:', data);

    return new Response(JSON.stringify({
      email: target,
      results: data,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in osint-industries:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
