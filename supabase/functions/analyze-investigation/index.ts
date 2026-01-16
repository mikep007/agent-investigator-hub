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

    const systemPrompt = `You are an expert OSINT investigator analyzing digital footprint data. Analyze findings and provide:

1. Risk assessment (low/medium/high/critical)
2. 3-5 key findings
3. Patterns or connections
4. Related persons
5. Anomalies or red flags
6. Recommendations for next steps

Do NOT recommend searching data already provided. Focus on new angles. Be concise.

Return JSON:
{
  "riskLevel": "low|medium|high|critical",
  "summary": "brief explanation",
  "keyFindings": ["finding1", ...],
  "patterns": ["pattern1", ...],
  "relatedPersons": ["name1", ...],
  "anomalies": ["anomaly1", ...],
  "recommendations": ["rec1", ...]
}`;

    const uniqueNames = [...new Set(dataSummary.allNames)];

    const userPrompt = `Target: ${dataSummary.target}
Findings: ${dataSummary.totalFindings}

Already searched: ${Object.entries(searchedParams).filter(([_, val]) => val).map(([key]) => key).join(', ') || 'None'}

Names/keywords: ${uniqueNames.slice(0, 15).join(', ') || 'None'}

By type: ${Object.entries(dataSummary.findingsByType).map(([type, count]) => `${type}: ${count}`).join(', ')}

Platforms (${dataSummary.platforms.length}): ${dataSummary.platforms.slice(0, 15).join(', ')}

Breaches: ${dataSummary.breaches.slice(0, 5).join(', ') || 'None'}

Locations: ${dataSummary.locations.join(', ') || 'None'}

Phones: ${dataSummary.phones.join(', ') || 'None'}

Web mentions: ${dataSummary.webMentions.slice(0, 3).join('; ') || 'None'}

Analyze and provide insights.`;

    // Helper function to make AI request with retry logic
    async function makeAIRequest(retryCount = 0): Promise<any> {
      const maxRetries = 2;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);

      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
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
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            throw { status: 429, message: "Rate limit exceeded. Please try again later." };
          }
          if (response.status === 402) {
            throw { status: 402, message: "Payment required. Please add credits to your workspace." };
          }
          if ((response.status === 502 || response.status === 503) && retryCount < maxRetries) {
            console.log(`AI gateway error ${response.status}, retrying... (attempt ${retryCount + 1})`);
            await new Promise(r => setTimeout(r, 1000 * (retryCount + 1))); // backoff
            return makeAIRequest(retryCount + 1);
          }
          const errorText = await response.text();
          console.error('AI gateway error:', response.status, errorText);
          throw new Error('AI analysis failed');
        }

        const data = await response.json();
        console.log('AI Response:', JSON.stringify(data, null, 2));

        // Check for network error in response
        if (data.choices?.[0]?.error?.code === 502 || data.choices?.[0]?.error?.message?.includes('Network')) {
          if (retryCount < maxRetries) {
            console.log('AI network error detected, retrying...');
            await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
            return makeAIRequest(retryCount + 1);
          }
          throw new Error('Network connection lost. Please try again.');
        }

        return data;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('AI request timed out after 55 seconds');
          throw { status: 504, message: "Analysis timed out. Please try again." };
        }
        if (fetchError.status) {
          throw fetchError; // Re-throw structured errors
        }
        // Retry on network errors
        if (retryCount < maxRetries) {
          console.log('Network error, retrying...', fetchError.message);
          await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
          return makeAIRequest(retryCount + 1);
        }
        throw fetchError;
      }
    }

    let aiData;
    try {
      aiData = await makeAIRequest();
    } catch (err: any) {
      if (err.status) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: err.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }

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
