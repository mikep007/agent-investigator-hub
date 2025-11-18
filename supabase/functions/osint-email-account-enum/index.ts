import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AccountCheck {
  platform: string;
  exists: boolean;
  url?: string;
  rateLimit?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Account enumeration for email:', target);

    // List of major platforms to check via their API endpoints
    // This mimics what Holehe does but with major platforms
    const platforms = [
      { name: 'Nike', checkUrl: `https://www.nike.com/identity/check-email`, method: 'POST', body: { email: target } },
      { name: 'Microsoft', checkUrl: `https://login.live.com/GetCredentialType.srf`, method: 'POST', body: { username: target } },
      { name: 'Adobe', checkUrl: `https://www.adobe.com/account/sign-in`, method: 'GET' },
      { name: 'Airbnb', checkUrl: `https://www.airbnb.com/api/v3/UsersController/check_email`, method: 'POST', body: { email: target } },
      { name: 'Spotify', checkUrl: `https://spclient.wg.spotify.com/signup/public/v1/account`, method: 'POST', body: { email: target } },
      { name: 'Twitter', checkUrl: `https://api.twitter.com/i/users/email_available.json`, method: 'GET' },
      { name: 'Discord', checkUrl: `https://discord.com/api/v9/auth/register`, method: 'POST', body: { email: target } },
      { name: 'GitHub', checkUrl: `https://github.com/signup_check/email`, method: 'POST', body: { value: target } },
      { name: 'Instagram', checkUrl: `https://www.instagram.com/api/v1/web/accounts/web_create_ajax/attempt/`, method: 'POST', body: { email: target } },
      { name: 'Pinterest', checkUrl: `https://www.pinterest.com/_ngjs/resource/EmailExistsResource/get/`, method: 'GET' },
      { name: 'Dropbox', checkUrl: `https://www.dropbox.com/ajax/check_email`, method: 'POST', body: { email: target } },
      { name: 'LinkedIn', checkUrl: `https://www.linkedin.com/checkpoint/lg/login-submit`, method: 'POST', body: { session_key: target } },
      { name: 'Snapchat', checkUrl: `https://accounts.snapchat.com/accounts/get_username_suggestions`, method: 'POST', body: { email: target } },
      { name: 'TikTok', checkUrl: `https://www.tiktok.com/passport/web/check_email/`, method: 'POST', body: { email: target } },
      { name: 'Tumblr', checkUrl: `https://www.tumblr.com/svc/account/register`, method: 'POST', body: { email: target } },
      { name: 'Twitch', checkUrl: `https://passport.twitch.tv/usernames`, method: 'POST', body: { email: target } },
      { name: 'Reddit', checkUrl: `https://www.reddit.com/api/check_email.json`, method: 'POST', body: { email: target } },
      { name: 'Amazon', checkUrl: `https://www.amazon.com/ap/signin`, method: 'POST', body: { email: target } },
      { name: 'Uber', checkUrl: `https://auth.uber.com/v2/`, method: 'POST', body: { email: target } },
      { name: 'Zoom', checkUrl: `https://zoom.us/signup/checkEmail`, method: 'POST', body: { email: target } },
      { name: 'Slack', checkUrl: `https://slack.com/api/auth.findUser`, method: 'POST', body: { email: target } },
      { name: 'PayPal', checkUrl: `https://www.paypal.com/graphql`, method: 'POST', body: { email: target } },
      { name: 'eBay', checkUrl: `https://signup.ebay.com/pa/crx`, method: 'POST', body: { email: target } },
      { name: 'Truecaller', checkUrl: `https://account-asia-south1.truecaller.com/v1/checkEmailStatus`, method: 'POST', body: { email: target } },
      { name: 'Smule', checkUrl: `https://www.smule.com/api/check_email`, method: 'POST', body: { email: target } },
    ];

    const results: AccountCheck[] = [];
    let checkedCount = 0;
    let foundCount = 0;

    // Check each platform
    for (const platform of platforms) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const options: RequestInit = {
          method: platform.method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: controller.signal,
        };

        if (platform.method === 'POST' && platform.body) {
          options.body = JSON.stringify(platform.body);
        }

        const response = await fetch(platform.checkUrl, options);
        clearTimeout(timeoutId);

        checkedCount++;

        // Platform-specific logic to determine if account exists
        let exists = false;
        
        if (response.status === 200) {
          const data = await response.json().catch(() => null);
          
          // Platform-specific detection logic
          if (platform.name === 'Microsoft' && data?.IfExistsResult === 0) {
            exists = true;
          } else if (platform.name === 'GitHub' && data?.available === false) {
            exists = true;
          } else if (platform.name === 'Discord' && data?.email) {
            exists = data.email[0]?.includes('already registered');
          } else if (data?.error?.message?.toLowerCase().includes('already') || 
                     data?.message?.toLowerCase().includes('exist') ||
                     data?.exists === true) {
            exists = true;
          }
        } else if (response.status === 409 || response.status === 400) {
          // Conflict often means account exists
          exists = true;
        }

        if (exists) {
          foundCount++;
          results.push({
            platform: platform.name,
            exists: true,
            url: getProfileUrl(platform.name, target),
          });
          console.log(`✓ Found account on ${platform.name}`);
        } else {
          results.push({
            platform: platform.name,
            exists: false,
          });
        }
      } catch (error: unknown) {
        const errorObj = error as Error;
        if (errorObj.name === 'AbortError') {
          console.log(`⏱ Timeout checking ${platform.name}`);
          results.push({
            platform: platform.name,
            exists: false,
            rateLimit: true,
          });
        } else {
          console.log(`✗ Error checking ${platform.name}:`, errorObj.message);
          results.push({
            platform: platform.name,
            exists: false,
          });
        }
        checkedCount++;
      }
    }

    const summary = {
      email: target,
      totalPlatformsChecked: checkedCount,
      accountsFound: foundCount,
      registeredPlatforms: results.filter(r => r.exists).map(r => r.platform),
      allResults: results,
    };

    console.log(`Account enumeration complete: ${foundCount} accounts found across ${checkedCount} platforms`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-email-account-enum:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getProfileUrl(platform: string, email: string): string | undefined {
  const username = email.split('@')[0];
  const urls: Record<string, string> = {
    'GitHub': `https://github.com/${username}`,
    'Twitter': `https://twitter.com/${username}`,
    'Instagram': `https://instagram.com/${username}`,
    'LinkedIn': `https://linkedin.com/in/${username}`,
    'Reddit': `https://reddit.com/u/${username}`,
    'TikTok': `https://tiktok.com/@${username}`,
    'Twitch': `https://twitch.tv/${username}`,
  };
  return urls[platform];
}
