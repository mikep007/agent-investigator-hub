import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investigationId } = await req.json();
    console.log('Generating report for investigation:', investigationId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all findings for this investigation
    const { data: findings, error: findingsError } = await supabase
      .from('findings')
      .select('*')
      .eq('investigation_id', investigationId)
      .order('created_at', { ascending: true });

    if (findingsError) {
      throw new Error(`Failed to fetch findings: ${findingsError.message}`);
    }

    if (!findings || findings.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No findings available for this investigation' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get investigation details
    const { data: investigation, error: invError } = await supabase
      .from('investigations')
      .select('target, created_at')
      .eq('id', investigationId)
      .single();

    if (invError) {
      throw new Error(`Failed to fetch investigation: ${invError.message}`);
    }

    // Organize findings by type
    const organizedFindings = {
      email_matches: findings.filter(f => f.agent_type === 'holehe' || f.agent_type === 'sherlock'),
      social_profiles: findings.filter(f => f.agent_type === 'social'),
      web_results: findings.filter(f => f.agent_type === 'web'),
      email_validation: findings.filter(f => f.agent_type === 'email'),
      phone_validation: findings.filter(f => f.agent_type === 'phone'),
      username_searches: findings.filter(f => f.agent_type === 'username'),
      address_searches: findings.filter(f => f.agent_type === 'address'),
    };

    // Prepare AI prompt
    const systemPrompt = `You are an OSINT (Open Source Intelligence) analyst creating professional investigation reports. 
    
Your task is to analyze findings from various sources and create a comprehensive, well-organized report with these sections:

1. **Executive Summary** - Brief overview of the investigation
2. **Verified Matches** - High-confidence findings with clear evidence
3. **Potential Matches** - Findings that need further verification
4. **Digital Footprint Analysis** - Overall online presence assessment
5. **Recommendations** - Next steps for investigation

Use professional language, be objective, and clearly distinguish between confirmed and potential findings.
Format the output in clean, readable Markdown.`;

    const userPrompt = `Create a detailed OSINT investigation report for target: "${investigation.target}"

Investigation Date: ${new Date(investigation.created_at).toLocaleDateString()}

FINDINGS DATA:
${JSON.stringify(organizedFindings, null, 2)}

Analyze these findings and create a comprehensive report. Pay special attention to:
- Email matches found via Holehe and Sherlock (these check if email is registered on platforms)
- Social media profiles discovered
- Web search results mentioning the target
- Any patterns or connections between findings
- Confidence levels for each finding

Organize the report with clear sections and actionable insights.`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Calling Lovable AI for report generation...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again in a few moments.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Lovable AI credits depleted. Please add credits to continue.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const report = aiData.choices[0].message.content;

    console.log('Report generated successfully');

    return new Response(JSON.stringify({ 
      report,
      target: investigation.target,
      generatedAt: new Date().toISOString(),
      findingsCount: findings.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-osint-report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
