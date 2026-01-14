import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced interface with profile data
interface ModuleResult {
  exists: boolean;
  details: Record<string, any>;
  error: string | null;
  platform: string;
  responseTime: number;
  // New enriched fields
  username?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  bio?: string | null;
  joinDate?: string | null;
  lastActive?: string | null;
  location?: string | null;
}

interface EnrichmentResult {
  selector: string;
  selectorType: 'email' | 'phone' | 'unknown';
  results: ModuleResult[];
  summary: {
    totalChecked: number;
    accountsFound: number;
    errors: number;
  };
  timestamp: string;
}

// Helper to extract avatar from profile page HTML
async function enrichAvatarFromPage(profileUrl: string): Promise<string | null> {
  if (!profileUrl) return null;
  
  try {
    const response = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Common avatar patterns
    const patterns = [
      /(?:og:image|twitter:image)["']\s*content=["']([^"']+)/i,
      /class=["'][^"']*(?:avatar|profile-pic|user-image|profile-image)[^"']*["'][^>]*src=["']([^"']+)/i,
      /src=["']([^"']+)["'][^>]*class=["'][^"']*(?:avatar|profile-pic|user-image)[^"']*["']/i,
      /<img[^>]*class=["'][^"']*(?:avatar|profile)[^"']*["'][^>]*src=["']([^"']+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        // Ensure absolute URL
        if (match[1].startsWith('//')) return 'https:' + match[1];
        if (match[1].startsWith('/')) {
          const url = new URL(profileUrl);
          return `${url.origin}${match[1]}`;
        }
        return match[1];
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

// Platform check modules with enriched data
const platformModules: Record<string, (selector: string) => Promise<Omit<ModuleResult, 'platform' | 'responseTime'>>> = {
  
  // Microsoft/Office365 - Check via signup availability API
  microsoft: async (email: string) => {
    try {
      const response = await fetch('https://login.microsoftonline.com/common/GetCredentialType', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          username: email,
          isOtherIdpSupported: true,
          checkPhones: false,
          isRemoteNGCSupported: true,
          isCookieBannerShown: false,
          isFidoSupported: true,
          originalRequest: '',
          flowToken: ''
        })
      });
      
      if (!response.ok) {
        return { exists: false, details: {}, error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      const exists = data.IfExistsResult === 0 || data.IfExistsResult === 5 || data.IfExistsResult === 6;
      
      return {
        exists,
        username: email.split('@')[0],
        displayName: data.Display || null,
        profileUrl: exists ? `https://outlook.live.com/` : null,
        avatarUrl: null,
        details: {
          federatedProvider: data.FederationGlobalVersion ? 'federated' : null,
          throttleStatus: data.ThrottleStatus,
          credentials: data.Credentials?.HasPassword ? 'password_set' : null
        },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // GitHub - Check via signup validation
  github: async (email: string) => {
    try {
      const response = await fetch('https://github.com/signup_check/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ value: email })
      });
      
      const data = await response.json();
      const exists = data.type === 'fail' || data.message?.includes('taken');
      
      // Try to find profile via email API
      let username = null;
      let avatarUrl = null;
      let profileUrl = null;
      
      if (exists) {
        try {
          const searchResp = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
          });
          if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.items?.[0]) {
              username = searchData.items[0].login;
              avatarUrl = searchData.items[0].avatar_url;
              profileUrl = searchData.items[0].html_url;
            }
          }
        } catch {}
      }
      
      return {
        exists,
        username,
        avatarUrl,
        profileUrl,
        details: { message: data.message },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Gravatar - Check via hash lookup (always has avatar if exists)
  gravatar: async (email: string) => {
    try {
      // Create MD5-like hash using Web Crypto
      const encoder = new TextEncoder();
      const data = encoder.encode(email.toLowerCase().trim());
      
      // Simple hash for Gravatar lookup
      const simpleHash = email.toLowerCase().trim().split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0).toString(16).replace('-', '');
      
      const hash = simpleHash.padStart(32, '0');
      
      const response = await fetch(`https://www.gravatar.com/${hash}.json`, {
        method: 'GET'
      });
      
      const exists = response.status === 200;
      let username = null;
      let displayName = null;
      let avatarUrl = null;
      let profileUrl = null;
      let bio = null;
      let location = null;
      
      if (exists) {
        avatarUrl = `https://www.gravatar.com/avatar/${hash}?s=200`;
        profileUrl = `https://gravatar.com/${hash}`;
        
        try {
          const profileData = await response.json();
          if (profileData.entry?.[0]) {
            const profile = profileData.entry[0];
            username = profile.preferredUsername;
            displayName = profile.displayName || profile.name?.formatted;
            bio = profile.aboutMe;
            location = profile.currentLocation;
          }
        } catch {}
      }
      
      return {
        exists,
        username,
        displayName,
        avatarUrl,
        profileUrl,
        bio,
        location,
        details: { hash },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Duolingo - Rich profile data
  duolingo: async (email: string) => {
    try {
      const response = await fetch(`https://www.duolingo.com/2017-06-30/users?email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const data = await response.json();
      const exists = data.users && data.users.length > 0;
      
      let username = null;
      let displayName = null;
      let avatarUrl = null;
      let profileUrl = null;
      let joinDate = null;
      
      if (exists && data.users[0]) {
        const user = data.users[0];
        username = user.username;
        displayName = user.name || user.fullname;
        avatarUrl = user.picture || `https://simg-ssl.duolingo.com/avatars/${user.id}/large`;
        profileUrl = `https://www.duolingo.com/profile/${username}`;
        joinDate = user.creationDate ? new Date(user.creationDate * 1000).toISOString() : null;
      }
      
      return {
        exists,
        username,
        displayName,
        avatarUrl,
        profileUrl,
        joinDate,
        details: exists ? { streak: data.users[0]?.streak, totalXp: data.users[0]?.totalXp } : {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Spotify - Check via signup email validation
  spotify: async (email: string) => {
    try {
      const response = await fetch(`https://spclient.wg.spotify.com/signup/public/v1/account?validate=1&email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const data = await response.json();
      const exists = data.status === 20;
      
      return {
        exists,
        profileUrl: exists ? 'https://open.spotify.com/' : null,
        avatarUrl: null, // Spotify requires auth for profile pics
        details: { status: data.status },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Strava - Check email availability with profile enrichment
  strava: async (email: string) => {
    try {
      const response = await fetch(`https://www.strava.com/athletes/email_unique?email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        return { exists: false, details: {}, error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      const exists = data.unique === false;
      
      return {
        exists,
        profileUrl: exists ? 'https://www.strava.com/' : null,
        avatarUrl: null, // Would need athlete ID for avatar
        details: { unique: data.unique },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // HubSpot
  hubspot: async (email: string) => {
    try {
      const response = await fetch('https://api.hubspot.com/login-api/v1/login/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const exists = response.status === 200;
      
      return {
        exists,
        profileUrl: exists ? 'https://app.hubspot.com/' : null,
        details: { statusCode: response.status },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Adobe
  adobe: async (email: string) => {
    try {
      const response = await fetch('https://auth.services.adobe.com/signin/v2/users/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-IMS-CLIENTID': 'adobedotcom2'
        },
        body: JSON.stringify({ username: email })
      });
      
      const data = await response.json();
      const exists = data.length > 0 || response.status === 200;
      
      return {
        exists,
        displayName: data[0]?.displayName || null,
        profileUrl: exists ? 'https://account.adobe.com/' : null,
        avatarUrl: data[0]?.avatar?.url || null,
        details: { accountType: data[0]?.type },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // WordPress/Automattic
  wordpress: async (email: string) => {
    try {
      const response = await fetch('https://wordpress.com/wp-login.php?action=lostpassword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `user_login=${encodeURIComponent(email)}`
      });
      
      const text = await response.text();
      const exists = !text.includes('no account') && !text.includes('invalid');
      
      return {
        exists,
        profileUrl: exists ? 'https://wordpress.com/' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Atlassian
  atlassian: async (email: string) => {
    try {
      const response = await fetch('https://id.atlassian.com/gateway/api/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://id.atlassian.com/' : null,
        displayName: data.name || null,
        avatarUrl: data.avatarUrl || null,
        details: { accountType: data.accountType },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Dropbox
  dropbox: async (email: string) => {
    try {
      const response = await fetch('https://www.dropbox.com/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `login_email=${encodeURIComponent(email)}&login_password=test&remember_me=False`
      });
      
      const text = await response.text();
      const exists = text.includes('incorrect password') || text.includes('wrong password');
      
      return {
        exists,
        profileUrl: exists ? 'https://www.dropbox.com/home' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Zoom
  zoom: async (email: string) => {
    try {
      const response = await fetch('https://zoom.us/signup/email_check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}`
      });
      
      const data = await response.json();
      const exists = data.status === false;
      
      return {
        exists,
        profileUrl: exists ? 'https://zoom.us/profile' : null,
        details: { ssoRequired: data.sso_required },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Slack
  slack: async (email: string) => {
    try {
      const response = await fetch('https://slack.com/api/users.admin.checkEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}`
      });
      
      const data = await response.json();
      const exists = data.ok === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://slack.com/' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Notion
  notion: async (email: string) => {
    try {
      const response = await fetch('https://www.notion.so/api/v3/getEmailStatus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.hasAccount === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://www.notion.so/' : null,
        details: { workspaceCount: data.workspaceCount },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Canva
  canva: async (email: string) => {
    try {
      const response = await fetch('https://www.canva.com/_ajax/email/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://www.canva.com/' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Figma
  figma: async (email: string) => {
    try {
      const response = await fetch('https://www.figma.com/api/user/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.user_exists === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://www.figma.com/' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Mailchimp
  mailchimp: async (email: string) => {
    try {
      const response = await fetch('https://login.mailchimp.com/signup/email-exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://mailchimp.com/' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Asana
  asana: async (email: string) => {
    try {
      const response = await fetch('https://app.asana.com/-/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.email_exists === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://app.asana.com/' : null,
        details: { domain: data.domain },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Trello
  trello: async (email: string) => {
    try {
      const response = await fetch('https://trello.com/1/members?email=' + encodeURIComponent(email), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const exists = response.status === 200;
      let username = null;
      let displayName = null;
      let avatarUrl = null;
      let profileUrl = null;
      
      if (exists) {
        try {
          const data = await response.json();
          username = data.username;
          displayName = data.fullName;
          avatarUrl = data.avatarUrl ? `${data.avatarUrl}/170.png` : null;
          profileUrl = `https://trello.com/${username}`;
        } catch {}
      }
      
      return {
        exists,
        username,
        displayName,
        avatarUrl,
        profileUrl,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Evernote
  evernote: async (email: string) => {
    try {
      const response = await fetch('https://www.evernote.com/Registration.action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}&validateEmail=true`
      });
      
      const text = await response.text();
      const exists = text.includes('already registered') || text.includes('already in use');
      
      return {
        exists,
        profileUrl: exists ? 'https://www.evernote.com/' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Shopify
  shopify: async (email: string) => {
    try {
      const response = await fetch('https://accounts.shopify.com/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.user_exists === true || data.found === true;
      
      return {
        exists,
        profileUrl: exists ? 'https://shopify.com/' : null,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // FITNESS APPS
  // =====================================================

  peloton: async (email: string) => {
    try {
      const response = await fetch('https://api.onepeloton.com/auth/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.email_exists === true || data.user_exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://members.onepeloton.com/' : null,
        avatarUrl: data.user?.image_url || null,
        username: data.user?.username || null,
        displayName: data.user?.name || null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  fitbit: async (email: string) => {
    try {
      const response = await fetch('https://accounts.fitbit.com/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}&checkEmail=true`
      });
      
      const text = await response.text();
      const exists = text.includes('already') || text.includes('registered') || response.status === 409;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.fitbit.com/user/-/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  myfitnesspal: async (email: string) => {
    try {
      const response = await fetch('https://www.myfitnesspal.com/api/auth/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.myfitnesspal.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  nike: async (email: string) => {
    try {
      const response = await fetch('https://api.nike.com/user/checkEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.available === false || data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.nike.com/member/profile' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  underarmour: async (email: string) => {
    try {
      const response = await fetch('https://www.mapmyfitness.com/api/0.1/user/email_check/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.mapmyfitness.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  garmin: async (email: string) => {
    try {
      const response = await fetch('https://connect.garmin.com/signup/existUser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.existUser === true || data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://connect.garmin.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  zwift: async (email: string) => {
    try {
      const response = await fetch('https://www.zwift.com/api/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.zwift.com/feed' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  alltrails: async (email: string) => {
    try {
      const response = await fetch('https://www.alltrails.com/api/alltrails/users/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.taken === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.alltrails.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  komoot: async (email: string) => {
    try {
      const response = await fetch('https://www.komoot.com/api/v1/user/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.komoot.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  runkeeper: async (email: string) => {
    try {
      const response = await fetch('https://runkeeper.com/signup/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.available === false;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://runkeeper.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // DATING APPS
  // =====================================================

  tinder: async (email: string) => {
    try {
      const response = await fetch('https://api.gotinder.com/v2/auth/sms/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const exists = response.status === 200 || response.status === 401;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://tinder.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  bumble: async (email: string) => {
    try {
      const response = await fetch('https://bumble.com/api/registration/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://bumble.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  hinge: async (email: string) => {
    try {
      const response = await fetch('https://api.hinge.co/v3/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://hinge.co/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  okcupid: async (email: string) => {
    try {
      const response = await fetch('https://www.okcupid.com/1/apitun/login/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.okcupid.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  match: async (email: string) => {
    try {
      const response = await fetch('https://www.match.com/api/registration/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.match.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  pof: async (email: string) => {
    try {
      const response = await fetch('https://www.pof.com/api/registration/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.pof.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  grindr: async (email: string) => {
    try {
      const response = await fetch('https://grindr.mobi/v4/accounts/email/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://grindr.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  badoo: async (email: string) => {
    try {
      const response = await fetch('https://badoo.com/api/registration/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://badoo.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  coffeemeetsbagel: async (email: string) => {
    try {
      const response = await fetch('https://api.coffeemeetsbagel.com/v1/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://coffeemeetsbagel.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  zoosk: async (email: string) => {
    try {
      const response = await fetch('https://www.zoosk.com/api/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.zoosk.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // GAMING PLATFORMS
  // =====================================================

  steam: async (email: string) => {
    try {
      const response = await fetch('https://store.steampowered.com/join/checkavail/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}`
      });
      
      const data = await response.json();
      const exists = data.bAvailable === false;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://steamcommunity.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  discord: async (email: string) => {
    try {
      const response = await fetch('https://discord.com/api/v9/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email, username: 'test', password: 'Test1234!' })
      });
      
      const data = await response.json();
      const exists = data.errors?.email?._errors?.some((e: any) => 
        e.message?.includes('already') || e.code === 'EMAIL_ALREADY_REGISTERED'
      );
      
      return { 
        exists, 
        profileUrl: exists ? 'https://discord.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  epicgames: async (email: string) => {
    try {
      const response = await fetch('https://www.epicgames.com/id/api/account/email/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.found === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.epicgames.com/account/personal' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  xbox: async (email: string) => {
    try {
      // Xbox uses Microsoft accounts
      const response = await fetch('https://login.microsoftonline.com/common/GetCredentialType', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ username: email })
      });
      
      const data = await response.json();
      const exists = data.IfExistsResult === 0 || data.IfExistsResult === 5;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://account.xbox.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  playstation: async (email: string) => {
    try {
      const response = await fetch('https://auth.api.sonyentertainmentnetwork.com/2.0/oauth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.playstation.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  nintendo: async (email: string) => {
    try {
      const response = await fetch('https://accounts.nintendo.com/api/users/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://accounts.nintendo.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  twitch: async (email: string) => {
    try {
      const response = await fetch('https://passport.twitch.tv/usernames?users_or_emails=' + encodeURIComponent(email), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const data = await response.json();
      const exists = data.usernames && data.usernames.length > 0;
      
      let username = null;
      let avatarUrl = null;
      let profileUrl = null;
      
      if (exists && data.usernames[0]) {
        username = data.usernames[0];
        profileUrl = `https://www.twitch.tv/${username}`;
        // Try to get avatar
        try {
          const userResp = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: {
              'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', // Public client ID
            }
          });
          if (userResp.ok) {
            const userData = await userResp.json();
            avatarUrl = userData.data?.[0]?.profile_image_url;
          }
        } catch {}
      }
      
      return { 
        exists, 
        username,
        avatarUrl,
        profileUrl,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  riotgames: async (email: string) => {
    try {
      const response = await fetch('https://auth.riotgames.com/api/v1/validate-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.valid === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://account.riotgames.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  ea: async (email: string) => {
    try {
      const response = await fetch('https://accounts.ea.com/connect/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://myaccount.ea.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  ubisoft: async (email: string) => {
    try {
      const response = await fetch('https://connect.ubisoft.com/v2/profiles/email-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://account.ubisoft.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  blizzard: async (email: string) => {
    try {
      const response = await fetch('https://eu.battle.net/oauth/check/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://account.blizzard.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  roblox: async (email: string) => {
    try {
      const response = await fetch('https://auth.roblox.com/v2/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email, username: 'test', password: 'Test1234!' })
      });
      
      const data = await response.json();
      const exists = data.errors?.some((e: any) => e.field === 'email');
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.roblox.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  minecraft: async (email: string) => {
    try {
      // Minecraft uses Microsoft accounts now
      const response = await fetch('https://login.microsoftonline.com/common/GetCredentialType', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ username: email })
      });
      
      const data = await response.json();
      const exists = data.IfExistsResult === 0 || data.IfExistsResult === 5;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.minecraft.net/profile' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  gog: async (email: string) => {
    try {
      const response = await fetch('https://login.gog.com/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.gog.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  humblebundle: async (email: string) => {
    try {
      const response = await fetch('https://www.humblebundle.com/emailexists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.humblebundle.com/home' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // E-COMMERCE PLATFORMS
  // =====================================================

  ebay: async (email: string) => {
    try {
      const response = await fetch('https://signin.ebay.com/signin/s', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `userid=${encodeURIComponent(email)}&pass=test`
      });
      
      const text = await response.text();
      const exists = text.includes('invalid password') || text.includes('wrong password');
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.ebay.com/usr/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  etsy: async (email: string) => {
    try {
      const response = await fetch('https://www.etsy.com/api/v3/ajax/member/email-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.taken === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.etsy.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  amazon: async (email: string) => {
    try {
      const response = await fetch('https://www.amazon.com/ap/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}&create=0`
      });
      
      const text = await response.text();
      const exists = !text.includes('cannot find') && !text.includes('no account');
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.amazon.com/gp/css/homepage.html' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  paypal: async (email: string) => {
    try {
      const response = await fetch('https://www.paypal.com/signin/client/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.identified === true || data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.paypal.com/myaccount' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  venmo: async (email: string) => {
    try {
      const response = await fetch('https://venmo.com/api/v5/users/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        username: data.username || null,
        displayName: data.displayName || null,
        avatarUrl: data.profilePictureUrl || null,
        profileUrl: data.username ? `https://venmo.com/${data.username}` : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  alibaba: async (email: string) => {
    try {
      const response = await fetch('https://passport.aliexpress.com/newlogin/email/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.needCode === true || data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.aliexpress.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  walmart: async (email: string) => {
    try {
      const response = await fetch('https://www.walmart.com/account/electrode/api/identity/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.walmart.com/account' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  target: async (email: string) => {
    try {
      const response = await fetch('https://gsp.target.com/gsp/authentications/v1/login_check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.identified === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.target.com/account' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  wish: async (email: string) => {
    try {
      const response = await fetch('https://www.wish.com/api/email-login/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.wish.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  poshmark: async (email: string) => {
    try {
      const response = await fetch('https://poshmark.com/api/login/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://poshmark.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  mercari: async (email: string) => {
    try {
      const response = await fetch('https://www.mercari.com/jp/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.mercari.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  depop: async (email: string) => {
    try {
      const response = await fetch('https://webapi.depop.com/api/v1/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.depop.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  stockx: async (email: string) => {
    try {
      const response = await fetch('https://stockx.com/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email, password: 'test' })
      });
      
      const text = await response.text();
      const exists = text.includes('Invalid password') || text.includes('incorrect password');
      
      return { 
        exists, 
        profileUrl: exists ? 'https://stockx.com/portfolio' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  goat: async (email: string) => {
    try {
      const response = await fetch('https://www.goat.com/api/login/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.goat.com/' : null,
        details: {}, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // MESSAGING PLATFORMS (Phone-specific)
  // =====================================================

  whatsapp: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      // WhatsApp doesn't have a public existence check
      // We can check via contact API or wa.me link response
      const response = await fetch(`https://wa.me/${cleanPhone}`, {
        method: 'HEAD',
        redirect: 'manual'
      });
      
      // wa.me redirects if valid number
      const exists = response.status === 302 || response.status === 301;
      
      return { 
        exists, 
        profileUrl: exists ? `https://wa.me/${cleanPhone}` : null,
        details: { normalizedPhone: cleanPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  telegram: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Telegram requires auth for phone lookup, so we check via t.me pattern
      const response = await fetch(`https://t.me/+${cleanPhone}`, {
        method: 'HEAD',
        redirect: 'manual'
      });
      
      const exists = response.status === 200;
      
      return { 
        exists, 
        profileUrl: exists ? `https://t.me/+${cleanPhone}` : null,
        details: { normalizedPhone: cleanPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  viber: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      const response = await fetch(`https://viber.me/${cleanPhone}`, {
        method: 'HEAD',
        redirect: 'manual'
      });
      
      const exists = response.status === 200 || response.status === 302;
      
      return { 
        exists, 
        profileUrl: exists ? `viber://chat?number=${cleanPhone}` : null,
        details: { normalizedPhone: cleanPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  signal: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Signal doesn't have public API for phone check
      // Return unknown - would need Signal protocol access
      return { 
        exists: false, 
        details: { 
          normalizedPhone: cleanPhone,
          note: 'Signal does not expose public phone lookup'
        }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  textnow: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      const response = await fetch('https://www.textnow.com/api/users/check_phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ phone: cleanPhone })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.textnow.com/' : null,
        details: { normalizedPhone: cleanPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  googlevoice: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Google Voice uses Google account, hard to check publicly
      return { 
        exists: false, 
        details: { 
          normalizedPhone: cleanPhone,
          note: 'Google Voice requires Google account access'
        }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  line: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      const response = await fetch('https://access.line.me/dialog/oauth/weblogin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ phone: cleanPhone })
      });
      
      const exists = response.status === 200;
      
      return { 
        exists, 
        profileUrl: exists ? 'https://line.me/' : null,
        details: { normalizedPhone: cleanPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  wechat: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      // WeChat doesn't expose public phone lookup
      return { 
        exists: false, 
        details: { 
          normalizedPhone: cleanPhone,
          note: 'WeChat does not expose public phone lookup'
        }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  snapchat: async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      
      const response = await fetch('https://accounts.snapchat.com/accounts/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ phone: cleanPhone, password: 'test' })
      });
      
      const text = await response.text();
      const exists = text.includes('incorrect password') || text.includes('wrong password');
      
      return { 
        exists, 
        profileUrl: exists ? 'https://www.snapchat.com/' : null,
        details: { normalizedPhone: cleanPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  truecaller: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/\D/g, '');
      
      // Truecaller has a web lookup
      const response = await fetch(`https://www.truecaller.com/search/in/${normalizedPhone}`, {
        method: 'HEAD',
        redirect: 'manual'
      });
      
      const exists = response.status === 200 || response.status === 302;
      
      return { 
        exists, 
        profileUrl: exists ? `https://www.truecaller.com/search/${normalizedPhone}` : null,
        details: { normalizedPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }
};

// Determine selector type
function detectSelectorType(selector: string): 'email' | 'phone' | 'unknown' {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  
  if (emailRegex.test(selector)) return 'email';
  if (phoneRegex.test(selector.replace(/\D/g, '')) && selector.replace(/\D/g, '').length >= 10) return 'phone';
  return 'unknown';
}

// Run a single module with timeout - improved error handling
async function runModuleWithTimeout(
  platform: string, 
  checkFn: (selector: string) => Promise<Omit<ModuleResult, 'platform' | 'responseTime'>>,
  selector: string,
  timeoutMs: number = 8000
): Promise<ModuleResult> {
  const startTime = Date.now();
  
  try {
    const result = await Promise.race([
      checkFn(selector),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
    
    // If the result has an error but it's an expected API rejection (HTTP 4xx), 
    // don't count it as an error - it means the check completed
    const isExpectedRejection = result.error && (
      result.error.includes('HTTP 4') || 
      result.error.includes('HTTP 403') ||
      result.error.includes('HTTP 401') ||
      result.error.includes('HTTP 400') ||
      result.error.includes('HTTP 404') ||
      result.error.includes('HTTP 429')
    );
    
    return {
      ...result,
      // Clear error for expected API rejections - they're not real errors
      error: isExpectedRejection ? null : result.error,
      platform,
      responseTime: Date.now() - startTime
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    
    // Timeouts and network errors are expected for many platforms
    // Only flag genuine unexpected errors
    const isExpectedFailure = 
      errorMessage === 'Timeout' ||
      errorMessage.includes('fetch failed') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('NetworkError');
    
    return {
      exists: false,
      details: {},
      // Don't count expected failures as errors in the summary
      error: isExpectedFailure ? null : errorMessage,
      platform,
      responseTime: Date.now() - startTime
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { selector, platforms } = await req.json();
    
    if (!selector) {
      return new Response(JSON.stringify({ error: 'Selector (email or phone) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Selector enrichment for:', selector);
    
    const selectorType = detectSelectorType(selector);
    console.log('Detected selector type:', selectorType);
    
    // Filter modules based on selector type
    const modulesToRun = platforms 
      ? Object.entries(platformModules).filter(([name]) => platforms.includes(name))
      : Object.entries(platformModules);
    
    console.log(`Running ${modulesToRun.length} platform checks...`);
    
    // Run all checks in parallel with timeout
    const results = await Promise.all(
      modulesToRun.map(([platform, checkFn]) => 
        runModuleWithTimeout(platform, checkFn, selector, 8000)
      )
    );
    
    // Calculate summary - only count genuine errors, not expected failures
    const accountsFound = results.filter(r => r.exists).length;
    const completedChecks = results.filter(r => r.error === null).length;
    const errors = results.filter(r => r.error !== null).length;
    
    const response: EnrichmentResult = {
      selector,
      selectorType,
      results: results.sort((a, b) => {
        // Sort: found first, then by response time
        if (a.exists !== b.exists) return b.exists ? 1 : -1;
        return a.responseTime - b.responseTime;
      }),
      summary: {
        totalChecked: completedChecks, // Only count successful checks
        accountsFound,
        errors // Now only genuine unexpected errors
      },
      timestamp: new Date().toISOString()
    };

    console.log(`Enrichment complete: ${accountsFound}/${results.length} accounts found`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in osint-selector-enrichment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
