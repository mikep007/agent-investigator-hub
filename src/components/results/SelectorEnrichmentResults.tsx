import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Check, 
  X, 
  Clock, 
  AlertCircle, 
  ChevronDown,
  Dumbbell,
  Heart,
  Gamepad2,
  ShoppingCart,
  Briefcase,
  Globe,
  Mail,
  Phone,
  Zap,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface SelectorEnrichmentResultsProps {
  data: EnrichmentResult | null;
  isLoading?: boolean;
}

// Platform metadata with logos and categories
const platformMeta: Record<string, { category: string; displayName: string; icon?: string; color: string }> = {
  // Productivity & Business
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
  
  // Creative & Design
  adobe: { category: 'creative', displayName: 'Adobe', color: '#ff0000' },
  canva: { category: 'creative', displayName: 'Canva', color: '#00c4cc' },
  figma: { category: 'creative', displayName: 'Figma', color: '#f24e1e' },
  
  // Developer & Tech
  github: { category: 'tech', displayName: 'GitHub', color: '#333333' },
  gravatar: { category: 'tech', displayName: 'Gravatar', color: '#1e8cbe' },
  wordpress: { category: 'tech', displayName: 'WordPress', color: '#21759b' },
  
  // Education & Learning
  duolingo: { category: 'education', displayName: 'Duolingo', color: '#58cc02' },
  evernote: { category: 'education', displayName: 'Evernote', color: '#00a82d' },
  
  // Music & Entertainment
  spotify: { category: 'entertainment', displayName: 'Spotify', color: '#1db954' },
  
  // Fitness Apps
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
  
  // Dating Apps
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
  
  // Gaming Platforms
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
  
  // E-Commerce
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
};

const categoryConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  fitness: { label: 'Fitness', icon: <Dumbbell className="h-4 w-4" />, color: 'text-green-500' },
  dating: { label: 'Dating', icon: <Heart className="h-4 w-4" />, color: 'text-pink-500' },
  gaming: { label: 'Gaming', icon: <Gamepad2 className="h-4 w-4" />, color: 'text-purple-500' },
  ecommerce: { label: 'E-Commerce', icon: <ShoppingCart className="h-4 w-4" />, color: 'text-orange-500' },
  business: { label: 'Business', icon: <Briefcase className="h-4 w-4" />, color: 'text-blue-500' },
  creative: { label: 'Creative', icon: <Globe className="h-4 w-4" />, color: 'text-red-500' },
  tech: { label: 'Tech', icon: <Globe className="h-4 w-4" />, color: 'text-gray-500' },
  education: { label: 'Education', icon: <Globe className="h-4 w-4" />, color: 'text-yellow-500' },
  entertainment: { label: 'Entertainment', icon: <Globe className="h-4 w-4" />, color: 'text-emerald-500' },
  other: { label: 'Other', icon: <Globe className="h-4 w-4" />, color: 'text-muted-foreground' },
};

const PlatformLogo: React.FC<{ platform: string; size?: number }> = ({ platform, size = 24 }) => {
  const meta = platformMeta[platform];
  const displayName = meta?.displayName || platform;
  const color = meta?.color || '#666666';
  
  // Generate initials for the logo
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  
  return (
    <div 
      className="rounded-lg flex items-center justify-center font-bold text-white shadow-sm"
      style={{ 
        backgroundColor: color, 
        width: size, 
        height: size,
        fontSize: size * 0.4
      }}
    >
      {initials}
    </div>
  );
};

const ResultBadge: React.FC<{ result: ModuleResult }> = ({ result }) => {
  if (result.error) {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
        <AlertCircle className="h-3 w-3 mr-1" />
        Error
      </Badge>
    );
  }
  
  if (result.exists) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30" variant="outline">
        <Check className="h-3 w-3 mr-1" />
        Found
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground">
      <X className="h-3 w-3 mr-1" />
      Not Found
    </Badge>
  );
};

const ResponseTimeIndicator: React.FC<{ ms: number }> = ({ ms }) => {
  const getColor = () => {
    if (ms < 500) return 'text-emerald-500';
    if (ms < 1500) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  return (
    <span className={cn("text-xs flex items-center gap-1", getColor())}>
      <Clock className="h-3 w-3" />
      {ms}ms
    </span>
  );
};

const PlatformResultRow: React.FC<{ result: ModuleResult }> = ({ result }) => {
  const meta = platformMeta[result.platform];
  const [isOpen, setIsOpen] = useState(false);
  const hasDetails = Object.keys(result.details).length > 0;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors",
        result.exists ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/30 border-border/50",
        result.error && "bg-yellow-500/5 border-yellow-500/20"
      )}>
        <div className="flex items-center gap-3">
          <PlatformLogo platform={result.platform} />
          <div>
            <p className="font-medium text-sm">
              {meta?.displayName || result.platform}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {meta?.category || 'Other'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <ResponseTimeIndicator ms={result.responseTime} />
          <ResultBadge result={result} />
          {hasDetails && (
            <CollapsibleTrigger asChild>
              <button className="p-1 hover:bg-muted rounded">
                <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
          )}
        </div>
      </div>
      
      {hasDetails && (
        <CollapsibleContent>
          <div className="mt-2 ml-10 p-3 bg-muted/30 rounded-lg text-xs">
            <p className="font-medium mb-2">Additional Details:</p>
            <pre className="text-muted-foreground overflow-x-auto">
              {JSON.stringify(result.details, null, 2)}
            </pre>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

const CategorySection: React.FC<{ 
  category: string; 
  results: ModuleResult[];
  defaultOpen?: boolean;
}> = ({ category, results, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const config = categoryConfig[category] || categoryConfig.other;
  const foundCount = results.filter(r => r.exists).length;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <span className={config.color}>{config.icon}</span>
            <span className="font-medium">{config.label}</span>
            <Badge variant="outline" className="text-xs">
              {results.length} platforms
            </Badge>
          </div>
          
          <div className="flex items-center gap-3">
            {foundCount > 0 && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30" variant="outline">
                {foundCount} found
              </Badge>
            )}
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
          </div>
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="space-y-2 mt-3 pl-2">
          {results.map((result) => (
            <PlatformResultRow key={result.platform} result={result} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
  const [showOnlyFound, setShowOnlyFound] = useState(false);
  
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
  
  // Group results by category
  const groupedResults = data.results.reduce((acc, result) => {
    const meta = platformMeta[result.platform];
    const category = meta?.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(result);
    return acc;
  }, {} as Record<string, ModuleResult[]>);
  
  // Filter if needed
  const filteredGroups = showOnlyFound
    ? Object.entries(groupedResults).reduce((acc, [cat, results]) => {
        const found = results.filter(r => r.exists);
        if (found.length > 0) acc[cat] = found;
        return acc;
      }, {} as Record<string, ModuleResult[]>)
    : groupedResults;
  
  // Sort categories by number of found accounts
  const sortedCategories = Object.entries(filteredGroups)
    .sort((a, b) => {
      const aFound = a[1].filter(r => r.exists).length;
      const bFound = b[1].filter(r => r.exists).length;
      return bFound - aFound;
    });
  
  const foundResults = data.results.filter(r => r.exists);
  
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
            {showOnlyFound ? 'Showing Found' : 'Show All'}
          </button>
        </div>
      </CardHeader>
      
      <CardContent>
        <SummaryStats summary={data.summary} />
        
        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="categories" className="flex-1">By Category</TabsTrigger>
            <TabsTrigger value="found" className="flex-1">
              Found Only ({foundResults.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="flex-1">All Results</TabsTrigger>
          </TabsList>
          
          <TabsContent value="categories" className="space-y-3">
            {sortedCategories.map(([category, results]) => (
              <CategorySection 
                key={category} 
                category={category} 
                results={results}
                defaultOpen={results.some(r => r.exists)}
              />
            ))}
          </TabsContent>
          
          <TabsContent value="found" className="space-y-2">
            {foundResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No accounts found for this selector
              </div>
            ) : (
              foundResults.map((result) => (
                <PlatformResultRow key={result.platform} result={result} />
              ))
            )}
          </TabsContent>
          
          <TabsContent value="all" className="space-y-2 max-h-[600px] overflow-y-auto">
            {data.results.map((result) => (
              <PlatformResultRow key={result.platform} result={result} />
            ))}
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
