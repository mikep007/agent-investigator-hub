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
