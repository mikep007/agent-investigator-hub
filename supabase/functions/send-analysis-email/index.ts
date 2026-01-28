import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalysisEmailRequest {
  recipientEmail: string;
  target: string;
  analysis: {
    riskLevel: string;
    summary: string;
    keyFindings: string[];
    patterns: string[];
    relatedPersons: string[];
    recommendations: string[];
    anomalies: string[];
  };
  pdfBase64: string;
}

const getRiskColor = (level: string): string => {
  switch (level) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
};

serve(async (req: Request): Promise<Response> => {
  console.log("send-analysis-email function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error("Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Failed to verify user:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resend = new Resend(resendApiKey);
    const { recipientEmail, target, analysis, pdfBase64 }: AnalysisEmailRequest = await req.json();

    if (!recipientEmail || !analysis) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields: recipientEmail and analysis" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending analysis email to: ${recipientEmail} for target: ${target}`);

    const riskColor = getRiskColor(analysis.riskLevel);
    const timestamp = new Date().toLocaleString();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 24px;">
          <h1 style="margin: 0 0 10px 0; font-size: 24px;">AI Investigation Analysis Report</h1>
          <p style="margin: 0; opacity: 0.8;">Target: ${target || 'Unknown'}</p>
          <p style="margin: 5px 0 0 0; opacity: 0.6; font-size: 14px;">Generated: ${timestamp}</p>
        </div>

        <div style="background: #f8f9fa; border-left: 4px solid ${riskColor}; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
          <div style="margin-bottom: 12px;">
            <span style="background: ${riskColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
              ${analysis.riskLevel} RISK
            </span>
          </div>
          <p style="margin: 0; color: #555;">${analysis.summary}</p>
        </div>

        ${analysis.keyFindings?.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <h2 style="font-size: 18px; color: #1a1a2e; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Key Findings</h2>
            <ul style="padding-left: 20px; margin: 12px 0;">
              ${analysis.keyFindings.map(f => `<li style="margin-bottom: 8px;">${f}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${analysis.anomalies?.length > 0 ? `
          <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="font-size: 16px; color: #92400e; margin: 0 0 12px 0;">⚠️ Anomalies & Red Flags</h2>
            <ul style="padding-left: 20px; margin: 0; color: #92400e;">
              ${analysis.anomalies.map(a => `<li style="margin-bottom: 6px;">${a}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${analysis.recommendations?.length > 0 ? `
          <div style="background: #eff6ff; border: 1px solid #3b82f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="font-size: 16px; color: #1e40af; margin: 0 0 12px 0;">Recommended Next Steps</h2>
            <ol style="padding-left: 20px; margin: 0; color: #1e40af;">
              ${analysis.recommendations.map(r => `<li style="margin-bottom: 6px;">${r}</li>`).join('')}
            </ol>
          </div>
        ` : ''}

        <div style="text-align: center; padding: 20px; border-top: 1px solid #e5e7eb; margin-top: 30px; color: #6b7280; font-size: 12px;">
          <p style="margin: 0;">This report was generated by Webutation AI Investigation Platform</p>
          <p style="margin: 5px 0 0 0;">Full PDF report attached below</p>
        </div>
      </body>
      </html>
    `;

    const attachments = pdfBase64 ? [{
      filename: `analysis-${target?.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`,
      content: pdfBase64,
    }] : [];

    const emailResponse = await resend.emails.send({
      from: "Webutation <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `Investigation Analysis Report - ${target || 'Target'}`,
      html: htmlContent,
      attachments,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
