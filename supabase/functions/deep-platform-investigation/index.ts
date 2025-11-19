import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investigationId, findingId, platform } = await req.json();
    
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user ID from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Deep platform investigation requested for ${platform} by user ${user.id}`);

    // Create platform investigation record
    const { data: platformInvestigation, error: insertError } = await supabase
      .from('platform_investigations')
      .insert({
        investigation_id: investigationId,
        finding_id: findingId,
        platform: platform,
        status: 'processing'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Perform deep investigation using AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Get the original finding data
    const { data: finding } = await supabase
      .from('findings')
      .select('data')
      .eq('id', findingId)
      .single();

    const emailData = finding?.data as any;
    const email = emailData?.email || 'unknown';

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an OSINT investigation expert. Analyze platform data and provide actionable intelligence about user accounts, activity, and potential connections.'
          },
          {
            role: 'user',
            content: `Perform a deep investigation for email "${email}" on platform "${platform}". 

Based on publicly available information and OSINT techniques, provide:
1. Likely username patterns for this email on ${platform}
2. Account activity assessment (likely active/inactive based on platform patterns)
3. Public visibility assessment (what information is typically public on ${platform})
4. Potential connections to other identities (common username patterns, linked accounts)

Format your response as JSON with these fields:
{
  "usernames": ["array of likely usernames"],
  "activity_status": "active/inactive/unknown",
  "visibility": "high/medium/low",
  "visibility_details": "description of what's typically public",
  "connections": ["array of potential connection indicators"],
  "recommendations": ["array of next steps for investigation"]
}`
          }
        ]
      })
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        throw new Error('AI rate limit exceeded. Please try again later.');
      }
      if (aiResponse.status === 402) {
        throw new Error('AI credits exhausted. Please add credits to continue.');
      }
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;
    
    let results;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      results = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw_analysis: aiContent };
    } catch {
      results = { raw_analysis: aiContent };
    }

    // Update platform investigation with results
    const { error: updateError } = await supabase
      .from('platform_investigations')
      .update({
        results: results,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', platformInvestigation.id);

    if (updateError) throw updateError;

    console.log(`Deep investigation completed for ${platform}`);

    return new Response(JSON.stringify({ 
      success: true,
      platformInvestigationId: platformInvestigation.id,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in deep-platform-investigation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
