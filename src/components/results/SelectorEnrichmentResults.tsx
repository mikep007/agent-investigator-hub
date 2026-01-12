import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Check, 
  X, 
  Clock, 
  AlertCircle, 
  ExternalLink,
  Dumbbell,
  Heart,
  Gamepad2,
  ShoppingCart,
  Briefcase,
  Globe,
  Mail,
  Phone,
  Zap,
  Filter,
  User,
  MapPin,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleResult {
  exists: boolean;
  details: Record<string, any>;
  error: string | null;
  platform: string;
  responseTime: number;
  username?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  bio?: string | null;
  joinDate?: string | null;
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

interface SelectorEnrichmentResultsProps {
  data: EnrichmentResult | null;
  isLoading?: boolean;
}

const platformMeta: Record<string, { category: string; displayName: string; color: string }> = {
  microsoft: { category: 'business', displayName: 'Microsoft', color: '#00a4ef' },
  hubspot: { category: 'business', displayName: 'HubSpot', color: '#ff7a59' },
  slack: { category: 'business', displayName: 'Slack', color: '#4a154b' },
  notion: { category: 'business', displayName: 'Notion', color: '#000000' },
  asana: { category: 'business', displayName: 'Asana', color: '#f06a6a' },
  trello: { category: 'business', displayName: 'Trello', color: '#0079bf' },
  atlassian: { category: 'business', displayName: 'Atlassian', color: '#0052cc' },
  zoom: { category: 'business', displayName: 'Zoom', color: '#2d8cff' },
  dropbox: { category: 'business', displayName: 'Dropbox', color: '#0061ff' },
  mailchimp: { category: 'business', displayName: 'Mailchimp', color: '#ffe01b' },
  shopify: { category: 'business', displayName: 'Shopify', color: '#96bf48' },
  adobe: { category: 'creative', displayName: 'Adobe', color: '#ff0000' },
  canva: { category: 'creative', displayName: 'Canva', color: '#00c4cc' },
  figma: { category: 'creative', displayName: 'Figma', color: '#f24e1e' },
  github: { category: 'tech', displayName: 'GitHub', color: '#333333' },
  gravatar: { category: 'tech', displayName: 'Gravatar', color: '#1e8cbe' },
  wordpress: { category: 'tech', displayName: 'WordPress', color: '#21759b' },
  duolingo: { category: 'education', displayName: 'Duolingo', color: '#58cc02' },
  evernote: { category: 'education', displayName: 'Evernote', color: '#00a82d' },
  spotify: { category: 'entertainment', displayName: 'Spotify', color: '#1db954' },
  peloton: { category: 'fitness', displayName: 'Peloton', color: '#c91c1c' },
  fitbit: { category: 'fitness', displayName: 'Fitbit', color: '#00b0b9' },
  strava: { category: 'fitness', displayName: 'Strava', color: '#fc4c02' },
  myfitnesspal: { category: 'fitness', displayName: 'MyFitnessPal', color: '#0070e0' },
  nike: { category: 'fitness', displayName: 'Nike', color: '#111111' },
  underarmour: { category: 'fitness', displayName: 'Under Armour', color: '#1d1d1d' },
  garmin: { category: 'fitness', displayName: 'Garmin', color: '#007cc3' },
  zwift: { category: 'fitness', displayName: 'Zwift', color: '#f15a22' },
  alltrails: { category: 'fitness', displayName: 'AllTrails', color: '#428a13' },
  komoot: { category: 'fitness', displayName: 'Komoot', color: '#6aa127' },
  runkeeper: { category: 'fitness', displayName: 'Runkeeper', color: '#2dc7d8' },
  tinder: { category: 'dating', displayName: 'Tinder', color: '#fe3c72' },
  bumble: { category: 'dating', displayName: 'Bumble', color: '#ffc629' },
  hinge: { category: 'dating', displayName: 'Hinge', color: '#5c5c5c' },
  okcupid: { category: 'dating', displayName: 'OkCupid', color: '#0500ff' },
  match: { category: 'dating', displayName: 'Match', color: '#f25c66' },
  pof: { category: 'dating', displayName: 'POF', color: '#058cd3' },
  grindr: { category: 'dating', displayName: 'Grindr', color: '#f5c519' },
  badoo: { category: 'dating', displayName: 'Badoo', color: '#783bf9' },
  coffeemeetsbagel: { category: 'dating', displayName: 'Coffee Meets Bagel', color: '#6b4226' },
  zoosk: { category: 'dating', displayName: 'Zoosk', color: '#ff6600' },
  steam: { category: 'gaming', displayName: 'Steam', color: '#1b2838' },
  discord: { category: 'gaming', displayName: 'Discord', color: '#5865f2' },
  epicgames: { category: 'gaming', displayName: 'Epic Games', color: '#2f2d2e' },
  xbox: { category: 'gaming', displayName: 'Xbox', color: '#107c10' },
  playstation: { category: 'gaming', displayName: 'PlayStation', color: '#003087' },
  nintendo: { category: 'gaming', displayName: 'Nintendo', color: '#e60012' },
  twitch: { category: 'gaming', displayName: 'Twitch', color: '#9146ff' },
  riotgames: { category: 'gaming', displayName: 'Riot Games', color: '#d32936' },
  ea: { category: 'gaming', displayName: 'EA', color: '#000000' },
  ubisoft: { category: 'gaming', displayName: 'Ubisoft', color: '#0070ff' },
  blizzard: { category: 'gaming', displayName: 'Blizzard', color: '#00aeff' },
  roblox: { category: 'gaming', displayName: 'Roblox', color: '#e2231a' },
  minecraft: { category: 'gaming', displayName: 'Minecraft', color: '#62b47a' },
  gog: { category: 'gaming', displayName: 'GOG', color: '#86328a' },
  humblebundle: { category: 'gaming', displayName: 'Humble Bundle', color: '#cc2929' },
  ebay: { category: 'ecommerce', displayName: 'eBay', color: '#e53238' },
  etsy: { category: 'ecommerce', displayName: 'Etsy', color: '#f56400' },
  amazon: { category: 'ecommerce', displayName: 'Amazon', color: '#ff9900' },
  paypal: { category: 'ecommerce', displayName: 'PayPal', color: '#003087' },
  venmo: { category: 'ecommerce', displayName: 'Venmo', color: '#3d95ce' },
  alibaba: { category: 'ecommerce', displayName: 'AliExpress', color: '#ff6a00' },
  walmart: { category: 'ecommerce', displayName: 'Walmart', color: '#0071dc' },
  target: { category: 'ecommerce', displayName: 'Target', color: '#cc0000' },
  wish: { category: 'ecommerce', displayName: 'Wish', color: '#2fb7ec' },
  poshmark: { category: 'ecommerce', displayName: 'Poshmark', color: '#7f0353' },
  mercari: { category: 'ecommerce', displayName: 'Mercari', color: '#ff0211' },
  depop: { category: 'ecommerce', displayName: 'Depop', color: '#ff2300' },
  stockx: { category: 'ecommerce', displayName: 'StockX', color: '#006340' },
  goat: { category: 'ecommerce', displayName: 'GOAT', color: '#000000' },
  whatsapp: { category: 'messaging', displayName: 'WhatsApp', color: '#25d366' },
  telegram: { category: 'messaging', displayName: 'Telegram', color: '#0088cc' },
  viber: { category: 'messaging', displayName: 'Viber', color: '#7360f2' },
  signal: { category: 'messaging', displayName: 'Signal', color: '#3a76f0' },
  textnow: { category: 'messaging', displayName: 'TextNow', color: '#00d084' },
  googlevoice: { category: 'messaging', displayName: 'Google Voice', color: '#4285f4' },
  line: { category: 'messaging', displayName: 'Line', color: '#00c300' },
  wechat: { category: 'messaging', displayName: 'WeChat', color: '#7bb32e' },
  snapchat: { category: 'messaging', displayName: 'Snapchat', color: '#fffc00' },
  truecaller: { category: 'messaging', displayName: 'Truecaller', color: '#0099ff' },
};

const categoryConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  messaging: { label: 'Messaging', icon: <Phone className="h-4 w-4" />, color: 'text-green-500' },
  fitness: { label: 'Fitness', icon: <Dumbbell className="h-4 w-4" />, color: 'text-emerald-500' },
  dating: { label: 'Dating', icon: <Heart className="h-4 w-4" />, color: 'text-pink-500' },
  gaming: { label: 'Gaming', icon: <Gamepad2 className="h-4 w-4" />, color: 'text-purple-500' },
  ecommerce: { label: 'E-Commerce', icon: <ShoppingCart className="h-4 w-4" />, color: 'text-orange-500' },
  business: { label: 'Business', icon: <Briefcase className="h-4 w-4" />, color: 'text-blue-500' },
  creative: { label: 'Creative', icon: <Globe className="h-4 w-4" />, color: 'text-red-500' },
  tech: { label: 'Tech', icon: <Globe className="h-4 w-4" />, color: 'text-gray-500' },
  education: { label: 'Education', icon: <Globe className="h-4 w-4" />, color: 'text-yellow-500' },
  entertainment: { label: 'Entertainment', icon: <Globe className="h-4 w-4" />, color: 'text-teal-500' },
  other: { label: 'Other', icon: <Globe className="h-4 w-4" />, color: 'text-muted-foreground' },
};

// OSINT Industries-style Profile Card
const ProfileCard: React.FC<{ result: ModuleResult }> = ({ result }) => {
  const meta = platformMeta[result.platform];
  const displayName = meta?.displayName || result.platform;
  const color = meta?.color || '#666666';
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  
  const [imgError, setImgError] = useState(false);
  
  return (
    <Card className={cn(
      "overflow-hidden transition-all hover:shadow-lg hover:scale-[1.02]",
      result.exists ? "border-emerald-500/30 bg-gradient-to-b from-emerald-500/5 to-transparent" : "opacity-60"
    )}>
      <CardContent className="p-4 flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="relative mb-3">
          {result.avatarUrl && !imgError ? (
            <img
              src={result.avatarUrl}
              alt={`${displayName} profile`}
              className="w-20 h-20 rounded-full object-cover border-3 shadow-lg"
              style={{ borderColor: color }}
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div 
              className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg"
              style={{ backgroundColor: color }}
            >
              {initials}
            </div>
          )}
          
          {/* Status indicator */}
          <div className={cn(
            "absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-background",
            result.exists ? "bg-emerald-500" : "bg-muted"
          )}>
            {result.exists ? (
              <Check className="h-3 w-3 text-white" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
        
        {/* Platform name */}
        <h3 className="font-semibold text-sm">{displayName}</h3>
        
        {/* Username/Display name */}
        {(result.username || result.displayName) && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <User className="h-3 w-3" />
            {result.displayName || `@${result.username}`}
          </p>
        )}
        
        {/* Location */}
        {result.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {result.location}
          </p>
        )}
        
        {/* Join date */}
        {result.joinDate && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(result.joinDate).toLocaleDateString()}
          </p>
        )}
        
        {/* Response time */}
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {result.responseTime}ms
        </div>
        
        {/* View profile button */}
        {result.exists && result.profileUrl && (
          <a
            href={result.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            View Profile
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        
        {result.error && (
          <Badge variant="outline" className="mt-2 bg-yellow-500/10 text-yellow-600 text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

const SummaryStats: React.FC<{ summary: EnrichmentResult['summary'] }> = ({ summary }) => {
  const successRate = Math.round((summary.accountsFound / summary.totalChecked) * 100);
  
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <Card className="bg-muted/30">
        <CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-primary">{summary.totalChecked}</p>
          <p className="text-xs text-muted-foreground">Platforms Checked</p>
        </CardContent>
      </Card>
      
      <Card className="bg-emerald-500/10 border-emerald-500/20">
        <CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-emerald-600">{summary.accountsFound}</p>
          <p className="text-xs text-muted-foreground">Accounts Found</p>
        </CardContent>
      </Card>
      
      <Card className="bg-muted/30">
        <CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-muted-foreground">{successRate}%</p>
          <p className="text-xs text-muted-foreground">Match Rate</p>
        </CardContent>
      </Card>
    </div>
  );
};

export const SelectorEnrichmentResults: React.FC<SelectorEnrichmentResultsProps> = ({ 
  data, 
  isLoading = false 
}) => {
  const [showOnlyFound, setShowOnlyFound] = useState(true);
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4">
            <Zap className="h-8 w-8 text-primary animate-pulse" />
            <p className="text-muted-foreground">Checking platforms...</p>
            <Progress value={33} className="w-48" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Enter an email or phone number to check platform registrations
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const foundResults = data.results.filter(r => r.exists);
  const displayResults = showOnlyFound ? foundResults : data.results;
  
  // Group by category
  const groupedResults = displayResults.reduce((acc, result) => {
    const meta = platformMeta[result.platform];
    const category = meta?.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(result);
    return acc;
  }, {} as Record<string, ModuleResult[]>);
  
  const sortedCategories = Object.entries(groupedResults)
    .sort((a, b) => {
      const aFound = a[1].filter(r => r.exists).length;
      const bFound = b[1].filter(r => r.exists).length;
      return bFound - aFound;
    });
  
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Selector Enrichment
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              {data.selectorType === 'email' ? (
                <><Mail className="h-4 w-4" /> {data.selector}</>
              ) : data.selectorType === 'phone' ? (
                <><Phone className="h-4 w-4" /> {data.selector}</>
              ) : (
                data.selector
              )}
            </p>
          </div>
          
          <button
            onClick={() => setShowOnlyFound(!showOnlyFound)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
              showOnlyFound 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted hover:bg-muted/80"
            )}
          >
            <Filter className="h-4 w-4" />
            {showOnlyFound ? 'Found Only' : 'Show All'}
          </button>
        </div>
      </CardHeader>
      
      <CardContent>
        <SummaryStats summary={data.summary} />
        
        <Tabs defaultValue="grid" className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="grid" className="flex-1">Card Grid</TabsTrigger>
            <TabsTrigger value="category" className="flex-1">By Category</TabsTrigger>
          </TabsList>
          
          <TabsContent value="grid">
            {displayResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No accounts found for this selector
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {displayResults.map((result) => (
                  <ProfileCard key={result.platform} result={result} />
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="category" className="space-y-6">
            {sortedCategories.map(([category, results]) => {
              const config = categoryConfig[category] || categoryConfig.other;
              const foundCount = results.filter(r => r.exists).length;
              
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={config.color}>{config.icon}</span>
                    <h3 className="font-medium">{config.label}</h3>
                    <Badge variant="outline" className="text-xs">
                      {foundCount} found
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {results.map((result) => (
                      <ProfileCard key={result.platform} result={result} />
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
        
        <p className="text-xs text-muted-foreground text-center mt-4">
          Checked at {new Date(data.timestamp).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
};

export default SelectorEnrichmentResults;
