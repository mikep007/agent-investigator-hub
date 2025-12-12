import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investigationId } = await req.json();

    if (!investigationId) {
      return new Response(
        JSON.stringify({ error: "Investigation ID is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      console.error('Error fetching findings:', findingsError);
      throw new Error('Failed to fetch investigation findings');
    }

    if (!findings || findings.length === 0) {
      return new Response(
        JSON.stringify({ error: "No findings found for this investigation" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch investigation details
    const { data: investigation, error: invError } = await supabase
      .from('investigations')
      .select('*')
      .eq('id', investigationId)
      .single();

    if (invError) {
      console.error('Error fetching investigation:', invError);
      throw new Error('Failed to fetch investigation details');
    }

    // Extract original search parameters from the first finding's searchContext
    let searchedParams = {
      fullName: false,
      email: false,
      phone: false,
      username: false,
      address: false,
      keywords: false
    };
    if (findings.length > 0 && findings[0].data?.searchContext) {
      const ctx = findings[0].data.searchContext;
      searchedParams = {
        fullName: !!ctx.fullName,
        email: !!ctx.hasEmail,
        phone: !!ctx.hasPhone,
        username: !!ctx.hasUsername,
        address: !!ctx.hasAddress,
        keywords: !!ctx.hasKeywords
      };
    }

    // Prepare data summary for AI analysis
    const dataSummary = {
      target: investigation.target,
      totalFindings: findings.length,
      findingsByType: {} as Record<string, number>,
      platforms: [] as string[],
      breaches: [] as string[],
      locations: [] as string[],
      emails: [] as string[],
      phones: [] as string[],
      usernames: [] as string[],
      webMentions: [] as string[],
      allNames: [] as string[],
    };

    // Process findings
    findings.forEach((finding) => {
      const agentType = finding.agent_type;
      dataSummary.findingsByType[agentType] = (dataSummary.findingsByType[agentType] || 0) + 1;

      const findingData = finding.data as any;

      // Extract data based on agent type
      if (agentType === 'Holehe' && findingData.results) {
        findingData.results.forEach((result: any) => {
          if (result.exists && result.platform) {
            dataSummary.platforms.push(result.platform);
          }
        });
      }

      if (agentType === 'Sherlock' && findingData.profileLinks) {
        findingData.profileLinks.forEach((profile: any) => {
          dataSummary.platforms.push(profile.platform);
          dataSummary.usernames.push(profile.username || profile.platform);
        });
      }

      if (agentType === 'LeakCheck' && findingData.sources) {
        findingData.sources.forEach((breach: any) => {
          dataSummary.breaches.push(breach.name || 'Unknown breach');
        });
      }

      if (agentType === 'Address' && findingData.location) {
        dataSummary.locations.push(findingData.location);
      }

      if (agentType === 'Phone' && findingData.number) {
        dataSummary.phones.push(findingData.number);
      }

      if (agentType === 'Web' && findingData.items) {
        findingData.items.forEach((item: any) => {
          if (item.title) {
            dataSummary.webMentions.push(item.title);
          }
        });
      }

      // Extract names and associated terms from all findings
      if (findingData.name) dataSummary.allNames.push(findingData.name);
      if (findingData.names) dataSummary.allNames.push(...findingData.names);
      if (findingData.searchContext?.keywords && Array.isArray(findingData.searchContext.keywords)) {
        dataSummary.allNames.push(...findingData.searchContext.keywords);
      }
    });

    // Call Lovable AI for analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `You are an expert OSINT investigator analyzing digital footprint data for law enforcement, investigative journalists, and private investigators. Analyze the investigation findings and provide:

1. Risk assessment (low/medium/high/critical) with brief explanation
2. 3-5 key findings that are most significant
3. Patterns or connections between data points
4. Related persons mentioned across findings
5. Anomalies or red flags
6. Actionable recommendations for next investigation steps

IMPORTANT: Do NOT recommend searching for data that was already provided as input (e.g., if email/phone/address was already searched, don't suggest searching for it again). Focus recommendations on new angles, related persons, or deeper investigation of discovered data.

Be concise, professional, and focus on investigative value. Return a JSON object with this structure:
{
  "riskLevel": "low|medium|high|critical",
  "summary": "brief risk assessment explanation",
  "keyFindings": ["finding1", "finding2", ...],
  "patterns": ["pattern1", "pattern2", ...],
  "relatedPersons": ["name1", "name2", ...],
  "anomalies": ["anomaly1", "anomaly2", ...],
  "recommendations": ["rec1", "rec2", ...]
}`;

    const uniqueNames = [...new Set(dataSummary.allNames)];

    const userPrompt = `Target: ${dataSummary.target}

Total findings: ${dataSummary.totalFindings}

ALREADY SEARCHED (do NOT recommend searching these again):
${Object.entries(searchedParams).filter(([_, val]) => val).map(([key]) => `- ${key}`).join('\n') || '- None'}

Associated names / keywords from search and findings:
${uniqueNames.slice(0, 20).join(', ') || '- None'}

Findings by type:
${Object.entries(dataSummary.findingsByType).map(([type, count]) => `- ${type}: ${count}`).join('\n')}

Platforms found (${dataSummary.platforms.length}): ${dataSummary.platforms.slice(0, 20).join(', ')}${dataSummary.platforms.length > 20 ? '...' : ''}

Breaches (${dataSummary.breaches.length}): ${dataSummary.breaches.slice(0, 10).join(', ')}${dataSummary.breaches.length > 10 ? '...' : ''}

Locations: ${dataSummary.locations.join(', ')}

Phone numbers: ${dataSummary.phones.join(', ')}

Web mentions (sample): ${dataSummary.webMentions.slice(0, 5).join('; ')}

Names found in data: ${uniqueNames.slice(0, 20).join(', ')}

Analyze this investigation and provide insights.`;

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
        tools: [{
          type: "function",
          function: {
            name: "provide_analysis",
            description: "Return structured investigation analysis",
            parameters: {
              type: "object",
              properties: {
                riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
                summary: { type: "string" },
                keyFindings: { type: "array", items: { type: "string" } },
                patterns: { type: "array", items: { type: "string" } },
                relatedPersons: { type: "array", items: { type: "string" } },
                anomalies: { type: "array", items: { type: "string" } },
                recommendations: { type: "array", items: { type: "string" } }
              },
              required: ["riskLevel", "summary", "keyFindings", "recommendations"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "provide_analysis" } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    console.log('AI Response:', JSON.stringify(aiData, null, 2));

    // Extract analysis from tool call
    let analysis;
    if (aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const argsString = aiData.choices[0].message.tool_calls[0].function.arguments;
      analysis = typeof argsString === 'string' ? JSON.parse(argsString) : argsString;
    } else {
      throw new Error('Unexpected AI response format');
    }

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in analyze-investigation:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
