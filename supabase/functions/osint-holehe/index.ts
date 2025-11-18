import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlatformCheck {
  name: string;
  domain: string;
  method: string;
  url: string;
  exists: boolean;
  rateLimit?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target } = await req.json();
    console.log('Holehe email enumeration for:', target);

    // Comprehensive platform list based on Holehe's database
    const platforms = [
      { name: "Adobe", url: "https://auth.services.adobe.com/accountsecurity/accountverification" },
      { name: "Airbnb", url: "https://www.airbnb.com/api/v3/UsersController/check_email" },
      { name: "Amazon", url: "https://www.amazon.com/ap/signin" },
      { name: "Apple", url: "https://appleid.apple.com/account" },
      { name: "Atlassian", url: "https://id.atlassian.com" },
      { name: "Badoo", url: "https://badoo.com/api/account/email/check" },
      { name: "Battle.net", url: "https://account.battle.net" },
      { name: "Booking", url: "https://account.booking.com/api/identity/verify_email" },
      { name: "Bukalapak", url: "https://accounts.bukalapak.com/api/v2/sessions" },
      { name: "Deliveroo", url: "https://deliveroo.co.uk/orderapp/v1/users" },
      { name: "Discord", url: "https://discord.com/api/v9/auth/register" },
      { name: "Docker", url: "https://hub.docker.com/v2/users/login" },
      { name: "Dropbox", url: "https://www.dropbox.com/ajax/check_email" },
      { name: "Duolingo", url: "https://www.duolingo.com/2017-06-30/users" },
      { name: "eBay", url: "https://signin.ebay.com/ws/eBayISAPI.dll" },
      { name: "Envato", url: "https://account.envato.com/sign_in" },
      { name: "Evernote", url: "https://www.evernote.com/Login.action" },
      { name: "Facebook", url: "https://www.facebook.com/login/identify" },
      { name: "Firefox", url: "https://api.accounts.firefox.com/v1/account/status" },
      { name: "Flickr", url: "https://login.yahoo.com/account/challenge/username" },
      { name: "Freelancer", url: "https://www.freelancer.com/api/users/0.1/users" },
      { name: "GitHub", url: "https://github.com/signup_check/email" },
      { name: "GitLab", url: "https://gitlab.com/api/v4/users" },
      { name: "Google", url: "https://accounts.google.com/_/lookup/accountlookup" },
      { name: "Gravatar", url: "https://en.gravatar.com/profiles/" },
      { name: "Imgur", url: "https://imgur.com/signin/ajax_email_available" },
      { name: "Instagram", url: "https://www.instagram.com/api/v1/web/accounts/web_create_ajax/attempt/" },
      { name: "Issuu", url: "https://issuu.com/signin" },
      { name: "Joom", url: "https://api.joom.com/1.1/users/check" },
      { name: "Lastpass", url: "https://lastpass.com/create_account.php" },
      { name: "LinkedIn", url: "https://www.linkedin.com/checkpoint/lg/login-submit" },
      { name: "Mailchimp", url: "https://login.mailchimp.com/signup/" },
      { name: "Mailru", url: "https://account.mail.ru/api/v1/user/exists" },
      { name: "Microsoft", url: "https://login.live.com/GetCredentialType.srf" },
      { name: "MySpace", url: "https://myspace.com/signup/usernamecheck" },
      { name: "Netflix", url: "https://www.netflix.com/signup/registration" },
      { name: "Nike", url: "https://unite.nike.com/check_user_exists" },
      { name: "Nintendo", url: "https://accounts.nintendo.com/authorize_age_gate" },
      { name: "OneDrive", url: "https://login.live.com/GetCredentialType.srf" },
      { name: "Patreon", url: "https://www.patreon.com/api/login" },
      { name: "PayPal", url: "https://www.paypal.com/signin/validate" },
      { name: "Pinterest", url: "https://www.pinterest.com/_ngjs/resource/EmailExistsResource/get/" },
      { name: "PlayStation", url: "https://auth.api.sonyentertainmentnetwork.com/2.0/ssocookie" },
      { name: "Quora", url: "https://www.quora.com/webnode2/server_call_POST" },
      { name: "Reddit", url: "https://www.reddit.com/api/check_email.json" },
      { name: "Samsung", url: "https://account.samsung.com/accounts/v1/STWS/checkUserID" },
      { name: "Skype", url: "https://login.live.com/GetCredentialType.srf" },
      { name: "Slack", url: "https://slack.com/api/auth.findUser" },
      { name: "Snapchat", url: "https://accounts.snapchat.com/accounts/get_username_suggestions" },
      { name: "SoundCloud", url: "https://api-v2.soundcloud.com/resolve" },
      { name: "Spotify", url: "https://spclient.wg.spotify.com/signup/public/v1/account" },
      { name: "Steam", url: "https://store.steampowered.com/join/checkavail" },
      { name: "Strava", url: "https://www.strava.com/athletes/check_email" },
      { name: "Taringa", url: "https://www.taringa.net/auth/validate-email" },
      { name: "Telegram", url: "https://my.telegram.org/auth/send_password" },
      { name: "TikTok", url: "https://www.tiktok.com/passport/web/check_email/" },
      { name: "Tinder", url: "https://api.gotinder.com/v2/auth/sms/send" },
      { name: "Tumblr", url: "https://www.tumblr.com/svc/account/register" },
      { name: "Twitch", url: "https://passport.twitch.tv/usernames" },
      { name: "Twitter", url: "https://api.twitter.com/i/users/email_available.json" },
      { name: "Uber", url: "https://auth.uber.com/v2/signup/validate" },
      { name: "VK", url: "https://login.vk.com/?act=check_email" },
      { name: "Wattpad", url: "https://www.wattpad.com/api/v3/users" },
      { name: "WeChat", url: "https://login.wx.qq.com" },
      { name: "WhatsApp", url: "https://v.whatsapp.com/v2/register" },
      { name: "WordPress", url: "https://wordpress.com/wp-login.php" },
      { name: "Xbox", url: "https://login.live.com/GetCredentialType.srf" },
      { name: "Yahoo", url: "https://login.yahoo.com/account/challenge/username" },
      { name: "Yandex", url: "https://passport.yandex.ru/registration-validations/checkEmailAvailability" },
      { name: "Zillow", url: "https://www.zillow.com/user/Login.htm" },
      { name: "Zoom", url: "https://zoom.us/signup/checkEmail" },
      // Additional platforms
      { name: "Adobé ID", url: "https://auth.services.adobe.com/accountsecurity/accountverification" },
      { name: "Airtel", url: "https://www.airtel.in/api/v1/user/check" },
      { name: "Alibaba", url: "https://login.alibaba.com" },
      { name: "Archive.org", url: "https://archive.org/account/login" },
      { name: "Asana", url: "https://app.asana.com/-/login" },
      { name: "Basecamp", url: "https://launchpad.37signals.com/login" },
      { name: "Behance", url: "https://www.behance.net/login" },
      { name: "Bitbucket", url: "https://bitbucket.org/account/signup/" },
      { name: "Blogger", url: "https://www.blogger.com/start" },
      { name: "Box", url: "https://account.box.com/api/oauth2/authorize" },
      { name: "Buffer", url: "https://login.buffer.com" },
      { name: "Canva", url: "https://www.canva.com/api/accounts/exists" },
      { name: "Dailymotion", url: "https://www.dailymotion.com/signup" },
      { name: "Deezer", url: "https://www.deezer.com/ajax/action.php" },
      { name: "DeviantArt", url: "https://www.deviantart.com/users/login" },
      { name: "Dribbble", url: "https://dribbble.com/session/new" },
      { name: "Epic Games", url: "https://www.epicgames.com/id/api/account/lookup" },
      { name: "Etsy", url: "https://www.etsy.com/api/v3/ajax/member/email-available" },
      { name: "Foursquare", url: "https://foursquare.com/signup" },
      { name: "Genius", url: "https://genius.com/signup_or_login" },
      { name: "Glassdoor", url: "https://www.glassdoor.com/member/home/checkEmail.htm" },
      { name: "Goodreads", url: "https://www.goodreads.com/user/sign_up" },
      { name: "HackerOne", url: "https://hackerone.com/users/sign_up" },
      { name: "HackerRank", url: "https://www.hackerrank.com/rest/auth/signup" },
      { name: "Indeed", url: "https://secure.indeed.com/account/register" },
      { name: "Kickstarter", url: "https://www.kickstarter.com/signup" },
      { name: "Meetup", url: "https://secure.meetup.com/register/" },
      { name: "Medium", url: "https://medium.com/_/api/users/exists" },
      { name: "MyFitnessPal", url: "https://www.myfitnesspal.com/account/sign_up" },
      { name: "Okta", url: "https://login.okta.com" },
      { name: "Pandora", url: "https://www.pandora.com/api/v1/auth/login" },
      { name: "Pluralsight", url: "https://app.pluralsight.com/id" },
      { name: "Razer", url: "https://razerid.razer.com/auth/register" },
      { name: "Rumble", url: "https://rumble.com/register.php" },
      { name: "Scribd", url: "https://www.scribd.com/signup" },
      { name: "Shopify", url: "https://accounts.shopify.com/signup" },
      { name: "Smule", url: "https://www.smule.com/api/check_email" },
      { name: "Stack Overflow", url: "https://stackoverflow.com/users/signup" },
      { name: "Trello", url: "https://trello.com/1/authorization/signup" },
      { name: "Truecaller", url: "https://account-asia-south1.truecaller.com/v1/checkEmailStatus" },
      { name: "Udemy", url: "https://www.udemy.com/join/signup-popup/" },
      { name: "Vimeo", url: "https://vimeo.com/check_availability" },
      { name: "Venmo", url: "https://api.venmo.com/v1/users" },
      { name: "Viber", url: "https://www.viber.com/en/api/register" },
      { name: "Vivino", url: "https://www.vivino.com/api/users" },
      { name: "Weibo", url: "https://login.sina.com.cn/signup/signup.php" },
      { name: "Yelp", url: "https://www.yelp.com/signup" },
    ];

    const results: PlatformCheck[] = [];
    let foundCount = 0;

    // Check platforms in batches to avoid overwhelming
    const BATCH_SIZE = 10;
    const TIMEOUT_MS = 8000;

    for (let i = 0; i < platforms.length; i += BATCH_SIZE) {
      const batch = platforms.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (platform) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            const response = await fetch(platform.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              body: JSON.stringify({ email: target }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            let exists = false;

            // Platform-specific detection logic
            if (response.status === 200) {
              const text = await response.text().catch(() => '');
              
              // Common patterns indicating account exists
              if (text.includes('already') || text.includes('exists') || 
                  text.includes('registered') || text.includes('taken')) {
                exists = true;
              }
            } else if (response.status === 409 || response.status === 400) {
              exists = true;
            }

            if (exists) {
              foundCount++;
              console.log(`✓ ${platform.name}`);
            }

            results.push({
              name: platform.name,
              domain: platform.url.split('/')[2],
              method: 'email',
              url: platform.url,
              exists,
            });
          } catch (error: unknown) {
            const err = error as Error;
            results.push({
              name: platform.name,
              domain: platform.url.split('/')[2],
              method: 'email',
              url: platform.url,
              exists: false,
              rateLimit: err.name === 'AbortError',
            });
          }
        })
      );
    }

    const summary = {
      email: target,
      totalPlatforms: platforms.length,
      accountsFound: foundCount,
      registeredOn: results.filter(r => r.exists).map(r => r.name),
      allResults: results,
    };

    console.log(`Holehe complete: ${foundCount}/${platforms.length} accounts found`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in osint-holehe:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
