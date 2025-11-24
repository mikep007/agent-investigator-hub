import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { findings } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Prepare findings summary for AI analysis
    const findingsSummary = findings.map((f: any) => {
      const data = f.data || {};
      return {
        type: f.agent_type,
        source: f.source,
        data: {
          profiles: data.profiles?.filter((p: any) => p.exists).map((p: any) => p.platform),
          webResults: data.items?.slice(0, 5).map((i: any) => ({ 
            title: i.title, 
            snippet: i.snippet,
            url: i.displayLink 
          })),
          sherlockPlatforms: data.foundPlatforms?.map((p: any) => p.name),
          holehePlatforms: data.allResults?.filter((r: any) => r.exists).map((r: any) => r.name),
          location: data.location?.formatted_address,
          email: data.email,
          phone: data.phoneNumber,
        }
      };
    });

    console.log('Analyzing findings:', JSON.stringify(findingsSummary, null, 2));

    const systemPrompt = `You are an expert OSINT (Open Source Intelligence) investigator analyzing digital footprint data. Your role is to:

1. Identify patterns and connections between discovered data points
2. Detect co-occurring names in search results (spouses, business partners, family members, associates)
3. Suggest specific additional platforms, websites, or data sources to investigate based on the findings
4. Recommend targeted search combinations that could reveal more information
5. Provide context-aware investigative insights

**CRITICAL**: Analyze web search result snippets for additional names that appear alongside the target subject. These could indicate:
- Spouses or partners (co-ownership, joint accounts, property records)
- Business associates (co-founders, partners, colleagues)
- Family members (parents, siblings, children)
- Co-residents or roommates

When you identify co-occurring names, create a specific suggestion to investigate that person as a separate search target.

Based on the discovered information, provide 3-5 actionable suggestions. Each suggestion should include:
- A clear action (what to search/where to look)
- The reasoning (why this makes sense based on current findings)
- Expected value (what you might discover)

Format your response as a JSON array of suggestions with this structure:
{
  "suggestions": [
    {
      "action": "Investigate Shapiro Yana",
      "reasoning": "Name appears with subject in property ownership records, suggesting spouse or co-owner relationship",
      "platform": "Comprehensive Search",
      "searchType": "related_person",
      "searchQuery": "Shapiro Yana",
      "expectedValue": "Additional addresses, phone numbers, emails, and connections that may link back to subject"
    },
    {
      "action": "Check Athlinks.com for race results",
      "reasoning": "Found Spartan Race and Tough Mudder mentions indicating obstacle course racing",
      "platform": "Athlinks.com",
      "searchType": "web",
      "searchQuery": "name + location on Athlinks",
      "expectedValue": "Race history, timing results, athletic profile"
    }
  ]
}

Be specific about platforms and search strategies. Consider:
- **Related persons** (names appearing in results with the subject)
- Sports/fitness platforms (Strava, Garmin Connect, MapMyRun, Athlinks)
- Professional networks (LinkedIn, GitHub, Stack Overflow, Behance)
- Geographic patterns (local business directories, regional platforms)
- Interest-based communities (Reddit, Discord, specialized forums)
- Content platforms (Medium, Substack, YouTube, TikTok)`;

    const userPrompt = `Analyze these OSINT findings and provide investigative suggestions:

${JSON.stringify(findingsSummary, null, 2)}

Provide specific, actionable suggestions for additional investigation based on patterns you identify.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        tools: [
          {
            type: 'function',
            function: {
              name: 'provide_suggestions',
              description: 'Return investigative suggestions based on OSINT findings',
              parameters: {
                type: 'object',
                properties: {
                  suggestions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        action: { type: 'string' },
                        reasoning: { type: 'string' },
                        platform: { type: 'string' },
                        searchType: { type: 'string', enum: ['web', 'social', 'username', 'email', 'related_person'] },
                        searchQuery: { type: 'string' },
                        expectedValue: { type: 'string' }
                      },
                      required: ['action', 'reasoning', 'platform', 'searchType', 'searchQuery', 'expectedValue'],
                      additionalProperties: false
                    }
                  }
                },
                required: ['suggestions'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'provide_suggestions' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI request failed: ${response.status} ${errorText}`);
    }

    const aiResponse = await response.json();
    console.log('AI response:', JSON.stringify(aiResponse, null, 2));

    const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const suggestions = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify(suggestions),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in ai-investigative-assistant:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate suggestions' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
