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
    console.log('Email lookup for:', target);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmail = emailRegex.test(target);

    if (!isEmail) {
      return new Response(JSON.stringify({ 
        error: 'Invalid email format',
        isValid: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract domain from email
    const domain = target.split('@')[1];

    // Basic email validation and domain check
    const results = {
      email: target,
      isValid: isEmail,
      domain: domain,
      disposable: false,
      mx_records: null as string | null,
      breach_check: 'Check haveibeenpwned.com manually'
    };

    // Try to check if domain exists via DNS (basic check)
    try {
      const dnsResponse = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
      const dnsData = await dnsResponse.json();
      results.mx_records = dnsData.Answer?.length > 0 ? 'Valid' : 'No MX records';
    } catch (error) {
      console.error('DNS check error:', error);
    }

    console.log('Email lookup complete:', results.isValid);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-email-lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});