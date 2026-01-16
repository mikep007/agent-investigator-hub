import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeakCheckRecord {
  line?: string;
  [key: string]: any;
}

interface LeakCheckProResult {
  success: boolean;
  found: number;
  sources: Array<{
    name: string;
    date: string | null;
  }>;
  fields?: string[];
  sources_data?: {
    [key: string]: Array<LeakCheckRecord>;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const leakCheckApiKey = Deno.env.get('LEAKCHECK_API_KEY');
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');

    if (!leakCheckApiKey) {
      throw new Error('LEAKCHECK_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all monitored subjects
    const { data: subjects, error: subjectsError } = await supabase
      .from('monitored_subjects')
      .select('*');

    if (subjectsError) {
      throw subjectsError;
    }

    console.log(`Checking ${subjects?.length || 0} monitored subjects for breaches`);

    let newAlertsCount = 0;

    for (const subject of subjects || []) {
      try {
        // Query LeakCheck API
        const response = await fetch(
          `https://leakcheck.io/api/v2/query/${encodeURIComponent(subject.subject_value)}`,
          {
            headers: {
              'X-API-Key': leakCheckApiKey,
            },
          }
        );

        if (!response.ok) {
          console.error(`LeakCheck API error for ${subject.subject_value}: ${response.status}`);
          continue;
        }

        const leakData: LeakCheckProResult = await response.json();

        if (leakData.success && leakData.found > 0 && leakData.sources_data) {
          // Get existing alerts for this subject
          const { data: existingAlerts } = await supabase
            .from('breach_alerts')
            .select('breach_source, breach_data')
            .eq('monitored_subject_id', subject.id);

          const existingBreaches = new Set(
            existingAlerts?.map(alert => 
              `${alert.breach_source}:${JSON.stringify(alert.breach_data)}`
            ) || []
          );

          // Process each source
          for (const [sourceName, records] of Object.entries(leakData.sources_data)) {
            const sourceInfo = leakData.sources.find(s => s.name === sourceName);
            
            for (const record of records) {
              const breachData = record.line ? { line: record.line } : { ...record };
              const breachKey = `${sourceName}:${JSON.stringify(breachData)}`;

              // Check if this is a new breach
              if (!existingBreaches.has(breachKey)) {
                // Create new alert
                const { error: insertError } = await supabase
                  .from('breach_alerts')
                  .insert({
                    monitored_subject_id: subject.id,
                    user_id: subject.user_id,
                    breach_source: sourceName,
                    breach_date: sourceInfo?.date || null,
                    breach_data: breachData,
                    is_read: false,
                  });

                if (!insertError) {
                  newAlertsCount++;
                  console.log(`New breach alert created for ${subject.subject_value} in ${sourceName}`);

                  // Send email notification with internal secret
                  try {
                    const emailUrl = `${supabaseUrl}/functions/v1/send-breach-alert-email`;
                    await fetch(emailUrl, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'x-internal-secret': internalSecret || '',
                      },
                      body: JSON.stringify({
                        userId: subject.user_id,
                        subjectValue: subject.subject_value,
                        subjectType: subject.subject_type,
                        breachSource: sourceName,
                        breachDate: sourceInfo?.date,
                        breachData,
                      }),
                    });
                  } catch (emailError) {
                    console.error('Error sending breach alert email:', emailError);
                  }
                }
              }
            }
          }
        }

        // Update last_checked_at
        await supabase
          .from('monitored_subjects')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', subject.id);

      } catch (error) {
        console.error(`Error checking subject ${subject.subject_value}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: subjects?.length || 0,
        newAlerts: newAlertsCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in check-breach-monitoring:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});