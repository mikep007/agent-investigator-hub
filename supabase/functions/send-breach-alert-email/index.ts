import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify internal secret for authentication (only callable from internal functions)
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    
    if (!expectedSecret || internalSecret !== expectedSecret) {
      console.error('Unauthorized call to send-breach-alert-email');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { userId, subjectValue, subjectType, breachSource, breachDate, breachData } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Service unavailable' }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendApiKey);

    // Get user email from auth
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !user?.email) {
      console.error('Error getting user email:', userError);
      return new Response(
        JSON.stringify({ error: 'User email not found' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Format breach data for email
    const breachDataLines = Object.entries(breachData)
      .map(([key, value]) => `<strong>${key.charAt(0).toUpperCase() + key.slice(1)}:</strong> ${value}`)
      .join('<br>');

    // Send email
    const emailResponse = await resend.emails.send({
      from: "OSINT Platform <onboarding@resend.dev>",
      to: [user.email],
      subject: `🚨 Breach Alert: ${subjectValue} found in ${breachSource}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">🚨 New Data Breach Detected</h1>
          
          <p>A monitored subject has been found in a new data breach:</p>
          
          <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
            <p><strong>Subject:</strong> ${subjectValue} (${subjectType})</p>
            <p><strong>Breach Source:</strong> ${breachSource}</p>
            ${breachDate ? `<p><strong>Breach Date:</strong> ${breachDate}</p>` : ''}
          </div>
          
          <h3>Leaked Data:</h3>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px;">
            ${breachDataLines}
          </div>
          
          <p style="margin-top: 20px;">
            <a href="${supabaseUrl.replace('supabase.co', 'lovable.app')}/breach-monitoring" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Alert Details
            </a>
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #6b7280; font-size: 14px;">
            You're receiving this email because you're monitoring this subject for data breaches. 
            To manage your monitoring settings, visit the Breach Monitoring dashboard.
          </p>
        </div>
      `,
    });

    console.log('Breach alert email sent:', emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error sending breach alert email:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});