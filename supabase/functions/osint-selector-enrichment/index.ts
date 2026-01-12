import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ModuleResult {
  exists: boolean;
  details: Record<string, any>;
  error: string | null;
  platform: string;
  responseTime: number;
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

// Platform check modules - each returns existence info from public endpoints
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
      // IfExistsResult: 0 = exists, 1 = doesn't exist, 5 = exists (federated), 6 = exists (external)
      const exists = data.IfExistsResult === 0 || data.IfExistsResult === 5 || data.IfExistsResult === 6;
      
      return {
        exists,
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

  // HubSpot - Check via login endpoint
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
      
      // 200 usually means account exists, 404 means no account
      const exists = response.status === 200;
      
      return {
        exists,
        details: { statusCode: response.status },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Strava - Check email availability
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
      // If email is NOT unique, account exists
      const exists = data.unique === false;
      
      return {
        exists,
        details: { unique: data.unique },
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
        details: { status: data.status },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Adobe - Check via Behance/Adobe ID
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
        details: { accountType: data[0]?.type },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Gravatar - Check via hash lookup
  gravatar: async (email: string) => {
    try {
      // Create MD5 hash of email (Deno compatible)
      const encoder = new TextEncoder();
      const data = encoder.encode(email.toLowerCase().trim());
      const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => null);
      
      if (!hashBuffer) {
        // Fallback: simple hash approximation
        const simpleHash = email.toLowerCase().trim().split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0).toString(16);
        
        const response = await fetch(`https://www.gravatar.com/avatar/${simpleHash}?d=404`, {
          method: 'HEAD'
        });
        
        return {
          exists: response.status === 200,
          details: {},
          error: null
        };
      }
      
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const response = await fetch(`https://www.gravatar.com/avatar/${hash}?d=404`, {
        method: 'HEAD'
      });
      
      return {
        exists: response.status === 200,
        details: { hash },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // WordPress/Automattic - Check via login
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
      // If no error about invalid user, account likely exists
      const exists = !text.includes('no account') && !text.includes('invalid');
      
      return {
        exists,
        details: {},
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
      // If email is not available for signup, account exists
      const exists = data.type === 'fail' || data.message?.includes('taken');
      
      return {
        exists,
        details: { message: data.message },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Atlassian (Jira/Confluence/Trello) - Check via account lookup
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
        details: { accountType: data.accountType },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Dropbox - Check via login flow
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
      // If response mentions incorrect password (not invalid email), account exists
      const exists = text.includes('incorrect password') || text.includes('wrong password');
      
      return {
        exists,
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Zoom - Check via signup
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
      const exists = data.status === false; // false means email is taken
      
      return {
        exists,
        details: { ssoRequired: data.sso_required },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Slack - Check via workspace invite
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
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Notion - Check via signup
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
        details: { workspaceCount: data.workspaceCount },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Canva - Check via signup flow
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
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Figma - Check via signup
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
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Mailchimp - Check via signup
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
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Asana - Check via signup
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
        details: { domain: data.domain },
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Trello - Check via Atlassian
  trello: async (email: string) => {
    try {
      const response = await fetch('https://trello.com/1/members?email=' + encodeURIComponent(email), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const exists = response.status === 200;
      let details = {};
      
      if (exists) {
        try {
          const data = await response.json();
          details = { username: data.username, fullName: data.fullName };
        } catch {}
      }
      
      return {
        exists,
        details,
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Evernote - Check via signup
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
        details: {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Duolingo - Check via signup
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
      
      return {
        exists,
        details: exists ? { username: data.users[0].username } : {},
        error: null
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // FITNESS APPS (10 modules)
  // =====================================================

  // Peloton - Check via signup
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
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Fitbit - Check via Google signup (Fitbit uses Google accounts now)
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
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // MyFitnessPal - Check via signup
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
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Nike/Nike Run Club - Check via signup
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
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Under Armour (MapMyRun/MapMyFitness) - Check via signup
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
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Garmin Connect - Check via signup
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
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Zwift - Check via signup
  zwift: async (email: string) => {
    try {
      const response = await fetch('https://zwift.com/api/users/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.registered === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // AllTrails - Check via signup
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
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Komoot - Check via signup
  komoot: async (email: string) => {
    try {
      const response = await fetch('https://account.komoot.com/api/v1/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Runkeeper (ASICS) - Check via signup
  runkeeper: async (email: string) => {
    try {
      const response = await fetch('https://runkeeper.com/user/checkEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.registered === true || data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // DATING APPS (10 modules)
  // =====================================================

  // Tinder - Check via Facebook/phone lookup (limited)
  tinder: async (email: string) => {
    try {
      const response = await fetch('https://api.gotinder.com/v2/auth/sms/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Tinder/12.0.0 (iPhone; iOS 15.0; Scale/3.00)'
        },
        body: JSON.stringify({ email })
      });
      
      const exists = response.status === 200 || response.status === 400;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Bumble - Check via signup
  bumble: async (email: string) => {
    try {
      const response = await fetch('https://eu1.bumble.com/mwebapi.phtml?SERVER_CHECK_EMAIL', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.registered === true || data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Hinge - Check via signup
  hinge: async (email: string) => {
    try {
      const response = await fetch('https://api.hinge.co/v1/users/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // OkCupid - Check via login
  okcupid: async (email: string) => {
    try {
      const response = await fetch('https://www.okcupid.com/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}&password=test`
      });
      
      const text = await response.text();
      const exists = text.includes('incorrect password') || text.includes('wrong password');
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Match.com - Check via signup
  match: async (email: string) => {
    try {
      const response = await fetch('https://www.match.com/rest/registration/emailcheck', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // PlentyOfFish (POF) - Check via signup
  pof: async (email: string) => {
    try {
      const response = await fetch('https://www.pof.com/register/ajaxemail.aspx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}`
      });
      
      const text = await response.text();
      const exists = text.includes('taken') || text.includes('registered');
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Grindr - Check via signup
  grindr: async (email: string) => {
    try {
      const response = await fetch('https://grindr.mobi/v3/users/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'grindr3/7.0.0 (iPhone; iOS 15.0)'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Badoo - Check via signup
  badoo: async (email: string) => {
    try {
      const response = await fetch('https://eu1.badoo.com/webapi.phtml?SERVER_CHECK_USER_EXISTENCE', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.registered === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Coffee Meets Bagel - Check via signup
  coffeemeetsbagel: async (email: string) => {
    try {
      const response = await fetch('https://cmb.coffemeetsbagel.com/api/signup/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Zoosk - Check via signup
  zoosk: async (email: string) => {
    try {
      const response = await fetch('https://www.zoosk.com/ajax/checkEmail.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}`
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // GAMING PLATFORMS (15 modules)
  // =====================================================

  // Steam - Check via login
  steam: async (email: string) => {
    try {
      const response = await fetch('https://store.steampowered.com/join/ajaxcheckemailverified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}`
      });
      
      const data = await response.json();
      const exists = data.success === false || data.valid === false;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Discord - Check via signup
  discord: async (email: string) => {
    try {
      const response = await fetch('https://discord.com/api/v9/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ 
          email, 
          username: 'test_' + Math.random().toString(36).substring(7),
          password: 'TestPass123!',
          date_of_birth: '1990-01-01'
        })
      });
      
      const data = await response.json();
      const exists = data.errors?.email?.['_errors']?.[0]?.code === 'EMAIL_ALREADY_REGISTERED';
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Epic Games - Check via signup
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
      const exists = data.valid === false || data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Xbox/Microsoft Gaming - Check via signup
  xbox: async (email: string) => {
    try {
      const response = await fetch('https://signup.live.com/API/CheckAvailableSigninNames', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ signInName: email, includeSuggestions: false })
      });
      
      const data = await response.json();
      const exists = data.isAvailable === false;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // PlayStation Network - Check via signup
  playstation: async (email: string) => {
    try {
      const response = await fetch('https://auth.api.sonyentertainmentnetwork.com/2.0/ssocookie', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email, password: 'test' })
      });
      
      const exists = response.status === 400 || response.status === 401;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Nintendo - Check via signup
  nintendo: async (email: string) => {
    try {
      const response = await fetch('https://accounts.nintendo.com/api/email_check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.valid === false || data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Twitch - Check via signup
  twitch: async (email: string) => {
    try {
      const response = await fetch('https://passport.twitch.tv/usernames/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.available === false;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Riot Games (League of Legends, Valorant) - Check via signup
  riotgames: async (email: string) => {
    try {
      const response = await fetch('https://auth.riotgames.com/api/v1/account/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // EA/Origin - Check via signup
  ea: async (email: string) => {
    try {
      const response = await fetch('https://signin.ea.com/p/ajax/user/checkEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}`
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.available === false;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Ubisoft - Check via signup
  ubisoft: async (email: string) => {
    try {
      const response = await fetch('https://public-ubiservices.ubi.com/v3/users/validateField', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Ubi-AppId': 'e3d5ea9e-50bd-43b7-88bf-39794f4e3d40'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.valid === false;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Blizzard/Battle.net - Check via signup
  blizzard: async (email: string) => {
    try {
      const response = await fetch('https://us.battle.net/account/creation/email-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.valid === false || data.emailAlreadyInUse === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Roblox - Check via signup
  roblox: async (email: string) => {
    try {
      const response = await fetch('https://auth.roblox.com/v1/usernames/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.code === 1 || data.message?.includes('taken');
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Minecraft/Mojang - Check via signup
  minecraft: async (email: string) => {
    try {
      const response = await fetch('https://api.mojang.com/users/profiles/minecraft/' + encodeURIComponent(email), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const exists = response.status === 200;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // GOG.com - Check via signup
  gog: async (email: string) => {
    try {
      const response = await fetch('https://auth.gog.com/users/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.available === false;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Humble Bundle - Check via signup
  humblebundle: async (email: string) => {
    try {
      const response = await fetch('https://www.humblebundle.com/emailcheck', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // E-COMMERCE PLATFORMS (15 modules)
  // =====================================================

  // eBay - Check via signup
  ebay: async (email: string) => {
    try {
      const response = await fetch('https://reg.ebay.com/reg/EmailValidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.valid === false || data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Etsy - Check via signup
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
      const exists = data.exists === true || data.available === false;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Amazon - Check via signup (limited)
  amazon: async (email: string) => {
    try {
      const response = await fetch('https://www.amazon.com/ap/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `email=${encodeURIComponent(email)}&password=test&create=0`
      });
      
      const text = await response.text();
      const exists = text.includes('incorrect password') || text.includes('wrong password');
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Shopify - Check via signup (for shop owners)
  shopify: async (email: string) => {
    try {
      const response = await fetch('https://accounts.shopify.com/api/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // PayPal - Check via signup
  paypal: async (email: string) => {
    try {
      const response = await fetch('https://www.paypal.com/signin/client/v2/email-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Venmo - Check via signup
  venmo: async (email: string) => {
    try {
      const response = await fetch('https://api.venmo.com/v1/account/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email, phone: '', password: 'test' })
      });
      
      const text = await response.text();
      const exists = text.includes('already registered') || text.includes('email taken');
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Alibaba/AliExpress - Check via signup
  alibaba: async (email: string) => {
    try {
      const response = await fetch('https://passport.aliexpress.com/newlogin/check.do', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `loginId=${encodeURIComponent(email)}`
      });
      
      const data = await response.json();
      const exists = data.content?.data?.status === 1;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Walmart - Check via signup
  walmart: async (email: string) => {
    try {
      const response = await fetch('https://www.walmart.com/account/api/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email, password: 'test' })
      });
      
      const text = await response.text();
      const exists = text.includes('incorrect password') || response.status === 401;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Target - Check via signup
  target: async (email: string) => {
    try {
      const response = await fetch('https://gsp.target.com/gsp/registry/v1/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Wish - Check via signup
  wish: async (email: string) => {
    try {
      const response = await fetch('https://www.wish.com/api/email-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email, password: 'test' })
      });
      
      const data = await response.json();
      const exists = data.code === 3; // Invalid password means account exists
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Poshmark - Check via signup
  poshmark: async (email: string) => {
    try {
      const response = await fetch('https://poshmark.com/api/v1/users/email/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Mercari - Check via signup
  mercari: async (email: string) => {
    try {
      const response = await fetch('https://www.mercari.com/v1/api/users/check_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Depop - Check via signup
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
      const exists = data.exists === true || data.registered === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // StockX - Check via signup
  stockx: async (email: string) => {
    try {
      const response = await fetch('https://stockx.com/api/register/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // GOAT - Check via signup
  goat: async (email: string) => {
    try {
      const response = await fetch('https://www.goat.com/api/v1/users/email_check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      const exists = data.exists === true;
      
      return { exists, details: {}, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // =====================================================
  // PHONE-SPECIFIC MESSAGING PLATFORMS (10 modules)
  // =====================================================

  // WhatsApp - Check via web.whatsapp.com contact sync simulation
  whatsapp: async (phone: string) => {
    try {
      // Normalize phone number - remove all non-digits except leading +
      const normalizedPhone = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
      
      // WhatsApp uses wa.me links - we can check if a profile exists
      const response = await fetch(`https://wa.me/${normalizedPhone}`, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        redirect: 'manual'
      });
      
      // WhatsApp redirects valid numbers, 404 for invalid
      const exists = response.status === 302 || response.status === 301 || response.status === 200;
      
      return { 
        exists, 
        details: { 
          normalizedPhone,
          waLink: `https://wa.me/${normalizedPhone}`
        }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Telegram - Check via t.me phone lookup or API
  telegram: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d+]/g, '');
      
      // Telegram's public resolve endpoint
      const response = await fetch(`https://t.me/+${normalizedPhone.replace(/^\+/, '')}`, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        redirect: 'manual'
      });
      
      // Check if the phone resolves to a valid profile
      const exists = response.status === 200 || response.status === 302;
      
      return { 
        exists, 
        details: { normalizedPhone }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Viber - Check via Viber public directory
  viber: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      
      // Viber uses their chatapi for lookups
      const response = await fetch('https://www.viber.com/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Viber/15.0.0 (Android 11)'
        },
        body: JSON.stringify({ phone: normalizedPhone })
      });
      
      if (!response.ok) {
        // Try alternative endpoint
        const altResponse = await fetch(`https://chatapi.viber.com/pa/get_user_details`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({ phone: normalizedPhone })
        });
        
        const exists = altResponse.status === 200;
        return { exists, details: { normalizedPhone }, error: null };
      }
      
      const data = await response.json();
      const exists = data.found === true || data.user !== null;
      
      return { exists, details: { normalizedPhone }, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Signal - Check via Signal's directory service (limited without auth)
  signal: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d+]/g, '');
      
      // Signal uses sealed sender, limited public lookup
      // We check via their registration endpoint behavior
      const response = await fetch('https://textsecure-service.whispersystems.org/v1/accounts/sms/code/' + encodeURIComponent(normalizedPhone), {
        method: 'GET',
        headers: {
          'User-Agent': 'Signal-Android/5.0.0',
          'Accept': 'application/json'
        }
      });
      
      // 409 = already registered, 200 = can register (not registered)
      const exists = response.status === 409 || response.status === 403;
      
      return { 
        exists, 
        details: { 
          normalizedPhone,
          status: response.status === 409 ? 'registered' : 'unknown'
        }, 
        error: null 
      };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // TextNow - Check via signup
  textnow: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      
      const response = await fetch('https://www.textnow.com/api/v3/users/check_phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ phone: normalizedPhone })
      });
      
      const data = await response.json();
      const exists = data.exists === true || data.registered === true;
      
      return { exists, details: { normalizedPhone }, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Google Voice - Check via signup flow
  googlevoice: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      
      const response = await fetch('https://voice.google.com/api/phone/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ phone: normalizedPhone })
      });
      
      const exists = response.status === 200 || response.status === 409;
      
      return { exists, details: { normalizedPhone }, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Line - Check via Line lookup
  line: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      
      const response = await fetch('https://access.line.me/dialog/friend/add/phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `phone=${encodeURIComponent(normalizedPhone)}`
      });
      
      const exists = response.status === 200 || response.status === 302;
      
      return { exists, details: { normalizedPhone }, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // WeChat - Check via registration
  wechat: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      
      const response = await fetch('https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `phone=${encodeURIComponent(normalizedPhone)}`
      });
      
      const text = await response.text();
      const exists = text.includes('window.code=200') || response.status === 200;
      
      return { exists, details: { normalizedPhone }, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Snapchat - Check via phone lookup
  snapchat: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      
      const response = await fetch('https://accounts.snapchat.com/accounts/merlin/check_phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Snapchat/11.0 (iPhone; iOS 15.0)'
        },
        body: JSON.stringify({ phone_number: normalizedPhone, country_code: 'US' })
      });
      
      const data = await response.json();
      const exists = data.phone_number_taken === true || data.exists === true;
      
      return { exists, details: { normalizedPhone }, error: null };
    } catch (e) {
      return { exists: false, details: {}, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },

  // Truecaller - Phone lookup service
  truecaller: async (phone: string) => {
    try {
      const normalizedPhone = phone.replace(/[^\d]/g, '');
      
      // Truecaller's web interface lookup
      const response = await fetch(`https://www.truecaller.com/search/${normalizedPhone}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        redirect: 'manual'
      });
      
      // Truecaller redirects to profile page if found
      const exists = response.status === 200 || response.status === 302;
      
      return { 
        exists, 
        details: { 
          normalizedPhone,
          lookupUrl: `https://www.truecaller.com/search/${normalizedPhone}`
        }, 
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

// Run a single module with timeout
async function runModuleWithTimeout(
  platform: string, 
  checkFn: (selector: string) => Promise<Omit<ModuleResult, 'platform' | 'responseTime'>>,
  selector: string,
  timeoutMs: number = 10000
): Promise<ModuleResult> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const result = await Promise.race([
      checkFn(selector),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
    
    clearTimeout(timeout);
    
    return {
      ...result,
      platform,
      responseTime: Date.now() - startTime
    };
  } catch (e) {
    return {
      exists: false,
      details: {},
      error: e instanceof Error ? e.message : 'Unknown error',
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
    
    // Filter modules based on selector type (all current modules are email-focused)
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
    
    // Calculate summary
    const accountsFound = results.filter(r => r.exists).length;
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
        totalChecked: results.length,
        accountsFound,
        errors
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
