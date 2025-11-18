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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization')!;

    const { target, searchType } = await req.json();
    console.log('Starting investigation for:', target, 'type:', searchType);

    // Get current user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    const userId = payload.sub;

    // Create investigation
    const invResponse = await fetch(`${supabaseUrl}/rest/v1/investigations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        user_id: userId,
        target: target,
        status: 'active'
      })
    });

    const [investigation] = await invResponse.json();
    console.log('Investigation created:', investigation.id);

    // Start different OSINT searches based on search type
    const searches = [];
    
    // Always run web search
    searches.push(fetch(`${supabaseUrl}/functions/v1/osint-web-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({ target })
    }));

    // Type-specific searches
    if (searchType === 'name') {
      // For names: social media, web, address
      searches.push(
        fetch(`${supabaseUrl}/functions/v1/osint-social-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        }),
        fetch(`${supabaseUrl}/functions/v1/osint-address-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        })
      );
    } else if (searchType === 'username') {
      // For usernames: Sherlock (399+ sites), social media
      searches.push(
        fetch(`${supabaseUrl}/functions/v1/osint-sherlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        }),
        fetch(`${supabaseUrl}/functions/v1/osint-social-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        })
      );
    } else if (searchType === 'email') {
      // For emails: email validation, Holehe (120+ platforms), social media
      searches.push(
        fetch(`${supabaseUrl}/functions/v1/osint-email-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        }),
        fetch(`${supabaseUrl}/functions/v1/osint-holehe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        }),
        fetch(`${supabaseUrl}/functions/v1/osint-social-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        })
      );
    } else if (searchType === 'phone') {
      // For phones: phone lookup, social media
      searches.push(
        fetch(`${supabaseUrl}/functions/v1/osint-phone-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        }),
        fetch(`${supabaseUrl}/functions/v1/osint-social-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ target })
        })
      );
    }

    const results = await Promise.allSettled(searches);
    
    // Determine agent types based on search type
    const getAgentTypes = (searchType: string) => {
      const types = ['web']; // Always include web
      
      if (searchType === 'name') {
        types.push('social', 'address');
      } else if (searchType === 'username') {
        types.push('sherlock', 'social');
      } else if (searchType === 'email') {
        types.push('email', 'holehe', 'social');
      } else if (searchType === 'phone') {
        types.push('phone', 'social');
      }
      
      return types;
    };
    
    const agentTypes = getAgentTypes(searchType);
    
    // Store findings
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      
      if (result.status === 'fulfilled') {
        const data = await result.value.json();
        
        await fetch(`${supabaseUrl}/rest/v1/findings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          },
          body: JSON.stringify({
            investigation_id: investigation.id,
            agent_type: agentTypes[i],
            source: agentTypes[i] + '_search',
            data: data,
            confidence_score: 0.75
          })
        });
        
        console.log(`Stored ${agentTypes[i]} findings`);
      }
    }

    return new Response(JSON.stringify({ 
      investigationId: investigation.id,
      message: 'Investigation started successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-start-investigation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});