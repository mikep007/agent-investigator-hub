import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ExternalLink, 
  Globe, 
  Search, 
  Copy, 
  Check, 
  X, 
  MapPin, 
  Phone, 
  Mail,
  FileDown,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertCircle,
  Sparkles,
  Code,
  Hash,
  BarChart3,
  User,
  Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ConfidenceScoreBadge from "../ConfidenceScoreBadge";
import { exportWebResultsToCSV } from "@/utils/csvExport";
import LinkPreviewTooltip from "./LinkPreviewTooltip";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WebResultItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  confidenceScore?: number;
  isExactMatch?: boolean;
  hasLocation?: boolean;
  matchedLocation?: string;
  hasKeywords?: boolean;
  keywordMatches?: string[];
  hasPhone?: boolean;
  matchedPhone?: string;
  hasEmail?: boolean;
  matchedEmail?: string;
  hasUsername?: boolean;
  matchedUsername?: string;
  hasKnownRelative?: boolean;
  hasRelativeMatch?: boolean;
  matchedRelative?: string;
  corroboratingFactors?: number;
  sourceType?: string;
  queryDescription?: string;
}

interface QueryInfo {
  type: string;
  query: string;
  description: string;
  resultCount?: number;
  category?: string;
}

// Category display configuration
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  core: { label: 'Core Searches', color: '#3b82f6' },
  social_media: { label: 'Social Media', color: '#8b5cf6' },
  professional: { label: 'Professional', color: '#10b981' },
  official_records: { label: 'Official Records', color: '#f59e0b' },
  legal: { label: 'Legal/Court', color: '#ef4444' },
  family: { label: 'Family/Genealogy', color: '#ec4899' },
  property: { label: 'Property', color: '#14b8a6' },
  business: { label: 'Business', color: '#6366f1' },
  contact: { label: 'Contact Info', color: '#22c55e' },
  identity: { label: 'Identity', color: '#f97316' },
  news: { label: 'News/Media', color: '#06b6d4' },
  people_finders: { label: 'People Finders', color: '#a855f7' },
  custom_site: { label: 'Custom Sites', color: '#84cc16' },
};

interface GoogleSearchResultsProps {
  confirmedResults: WebResultItem[];
  possibleResults: WebResultItem[];
  queriesUsed?: QueryInfo[];
  keywordsSearched?: string[];
  targetName?: string;
  onVerify?: (link: string, status: 'verified' | 'inaccurate') => void;
  error?: string | null;
}

const GoogleSearchResults = ({
  confirmedResults,
  possibleResults,
  queriesUsed = [],
  keywordsSearched = [],
  targetName,
  onVerify,
  error
}: GoogleSearchResultsProps) => {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [showPossible, setShowPossible] = useState(true);
  const [showQueries, setShowQueries] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [verifiedLinks, setVerifiedLinks] = useState<Set<string>>(new Set());
  const [inaccurateLinks, setInaccurateLinks] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Calculate category stats for bar chart
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    
    queriesUsed.forEach(q => {
      const category = q.category || 'other';
      stats[category] = (stats[category] || 0) + (q.resultCount || 0);
    });

    return Object.entries(stats)
      .map(([category, count]) => ({
        category,
        label: CATEGORY_CONFIG[category]?.label || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count,
        color: CATEGORY_CONFIG[category]?.color || '#6b7280'
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [queriesUsed]);

  // Calculate corroboration stats for confirmed results
  const corroborationStats = useMemo(() => {
    const stats = {
      phone: 0,
      email: 0,
      username: 0,
      location: 0,
      relative: 0,
      keywords: 0,
      nameMatch: 0,
    };

    confirmedResults.forEach(item => {
      if (item.hasPhone) stats.phone++;
      if (item.hasEmail) stats.email++;
      if (item.hasUsername) stats.username++;
      if (item.hasLocation) stats.location++;
      if (item.hasKnownRelative || item.hasRelativeMatch) stats.relative++;
      if (item.hasKeywords && item.keywordMatches?.length) stats.keywords++;
      if (item.isExactMatch) stats.nameMatch++;
    });

    return stats;
  }, [confirmedResults]);

  const filterResults = (results: WebResultItem[]) => {
    if (!filter.trim()) return results;
    const query = filter.toLowerCase();
    return results.filter(item =>
      item.title?.toLowerCase().includes(query) ||
      item.snippet?.toLowerCase().includes(query) ||
      item.link?.toLowerCase().includes(query) ||
      item.displayLink?.toLowerCase().includes(query)
    );
  };

  const filteredConfirmed = filterResults(confirmedResults);
  const filteredPossible = filterResults(possibleResults);
  const totalResults = confirmedResults.length + possibleResults.length;
  const filteredTotal = filteredConfirmed.length + filteredPossible.length;

  // Combine all visible results for keyboard navigation
  const allVisibleResults = [
    ...filteredConfirmed,
    ...(showPossible ? filteredPossible : [])
  ];

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (allVisibleResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < allVisibleResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : allVisibleResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < allVisibleResults.length) {
          window.open(allVisibleResults[focusedIndex].link, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setFocusedIndex(-1);
        break;
    }
  }, [allVisibleResults, focusedIndex]);

  // Scroll focused result into view
  useEffect(() => {
    if (focusedIndex >= 0 && resultRefs.current[focusedIndex]) {
      resultRefs.current[focusedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [focusedIndex]);

  // Reset focus when filter changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [filter, showPossible]);

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied to clipboard" });
  };

  const handleVisit = (link: string) => {
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const handleVerify = (link: string, status: 'verified' | 'inaccurate') => {
    if (status === 'verified') {
      setVerifiedLinks(prev => new Set([...prev, link]));
      setInaccurateLinks(prev => {
        const next = new Set(prev);
        next.delete(link);
        return next;
      });
    } else {
      setInaccurateLinks(prev => new Set([...prev, link]));
      setVerifiedLinks(prev => {
        const next = new Set(prev);
        next.delete(link);
        return next;
      });
    }
    onVerify?.(link, status);
  };

  const handleExport = () => {
    exportWebResultsToCSV(confirmedResults, possibleResults, targetName);
    toast({
      title: "Export Complete",
      description: `Exported ${totalResults} web results to CSV`,
    });
  };

  const renderResultItem = (item: WebResultItem, index: number, isConfirmed: boolean, globalIndex: number) => {
    const isVerified = verifiedLinks.has(item.link);
    const isInaccurate = inaccurateLinks.has(item.link);
    const isFocused = focusedIndex === globalIndex;

    return (
      <div 
        key={`${item.link}-${index}`}
        ref={(el) => { resultRefs.current[globalIndex] = el; }}
        className={`group relative rounded-xl border transition-all duration-200 ${
          isFocused
            ? 'border-primary ring-2 ring-primary/50 bg-primary/5'
            : isInaccurate 
              ? 'border-destructive/30 bg-destructive/5 opacity-60' 
              : isVerified 
                ? 'border-green-500/30 bg-green-500/5' 
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
        }`}
      >
        {/* Rank indicator */}
        <div className="absolute -left-3 top-4 w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-medium text-muted-foreground">
          {index + 1}
        </div>

        <div className="p-4 pl-6">
          {/* URL row - clickable with preview tooltip */}
          <LinkPreviewTooltip
            url={item.link}
            title={item.title}
            snippet={item.snippet}
            confidence={item.confidenceScore}
            hasLocation={item.hasLocation}
            hasEmail={item.hasEmail}
            hasPhone={item.hasPhone}
          >
            <button
              onClick={() => handleVisit(item.link)}
              className="flex items-center gap-2 text-sm text-left w-full group/url hover:text-primary transition-colors mb-1"
            >
              <div className="w-5 h-5 rounded bg-muted/80 flex items-center justify-center flex-shrink-0">
                <Globe className="h-3 w-3 text-muted-foreground group-hover/url:text-primary transition-colors" />
              </div>
              <span className="text-muted-foreground truncate group-hover/url:text-primary transition-colors">
                {item.displayLink}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover/url:text-primary transition-colors opacity-0 group-hover/url:opacity-100" />
            </button>
          </LinkPreviewTooltip>

          {/* Title - main clickable element with preview tooltip */}
          <LinkPreviewTooltip
            url={item.link}
            title={item.title}
            snippet={item.snippet}
            confidence={item.confidenceScore}
            hasLocation={item.hasLocation}
            hasEmail={item.hasEmail}
            hasPhone={item.hasPhone}
          >
            <button
              onClick={() => handleVisit(item.link)}
              className="text-left w-full mb-2"
            >
              <h3 className="text-lg font-medium text-primary hover:underline line-clamp-2 transition-colors">
                {item.title || 'Untitled Result'}
              </h3>
            </button>
          </LinkPreviewTooltip>

          {/* Snippet */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {item.snippet}
          </p>

          {/* Match indicators - Corroborating factors shown as badges with tooltips */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {item.confidenceScore !== undefined && (
              <ConfidenceScoreBadge score={item.confidenceScore <= 1 ? item.confidenceScore * 100 : item.confidenceScore} />
            )}
            {item.isExactMatch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs gap-1 cursor-help">
                    <Check className="h-3 w-3" />
                    Name Match
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Exact name match found in content</p>
                </TooltipContent>
              </Tooltip>
            )}
            {item.hasPhone && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs gap-1 cursor-help">
                    <Phone className="h-3 w-3" />
                    Phone
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{item.matchedPhone ? `Phone: ${item.matchedPhone}` : 'Phone number matched'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {item.hasEmail && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs gap-1 cursor-help">
                    <Mail className="h-3 w-3" />
                    Email
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{item.matchedEmail ? `Email: ${item.matchedEmail}` : 'Email matched'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {item.hasUsername && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs gap-1 cursor-help">
                    <User className="h-3 w-3" />
                    Username
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{item.matchedUsername ? `Username: ${item.matchedUsername}` : 'Username matched'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {item.hasLocation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 text-xs gap-1 cursor-help">
                    <MapPin className="h-3 w-3" />
                    Location
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{item.matchedLocation ? `Location: ${item.matchedLocation}` : 'Location matched'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {(item.hasKnownRelative || item.hasRelativeMatch) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 text-xs gap-1 cursor-help">
                    <Users className="h-3 w-3" />
                    Relative
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{item.matchedRelative ? `Relative: ${item.matchedRelative}` : 'Known relative matched'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {item.hasKeywords && item.keywordMatches?.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs gap-1 cursor-help">
                    <Search className="h-3 w-3" />
                    {item.keywordMatches.join(', ')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Keywords matched: {item.keywordMatches.join(', ')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {item.queryDescription && (
              <span className="text-xs text-muted-foreground/60 italic">
                via {item.queryDescription}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              className="h-8 px-3 gap-1.5 bg-primary hover:bg-primary/90"
              onClick={() => handleVisit(item.link)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Visit Page
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 gap-1.5"
              onClick={() => handleCopyLink(item.link)}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <div className="flex items-center gap-1 ml-auto">
              <Button
                size="sm"
                variant={isVerified ? 'default' : 'ghost'}
                className={`h-8 px-2 gap-1 ${isVerified ? 'bg-green-600 hover:bg-green-700' : ''}`}
                onClick={() => handleVerify(item.link, 'verified')}
              >
                <Check className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Verified</span>
              </Button>
              <Button
                size="sm"
                variant={isInaccurate ? 'destructive' : 'ghost'}
                className="h-8 px-2 gap-1"
                onClick={() => handleVerify(item.link, 'inaccurate')}
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Wrong</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Check for API configuration error
  const isApiDisabledError = error && (
    error.includes('Custom Search API has not been used') ||
    error.includes('it is disabled') ||
    error.includes('API_KEY_SERVICE_BLOCKED') ||
    error.includes('accessNotConfigured')
  );

  if (isApiDisabledError) {
    return (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-yellow-500" />
          </div>
          <div className="flex-1 space-y-3">
            <h3 className="font-semibold text-lg text-yellow-600 dark:text-yellow-400">
              Google Custom Search API Not Enabled
            </h3>
            <p className="text-sm text-muted-foreground">
              Web search requires the Google Custom Search API to be enabled in your Google Cloud Console. 
              This API provides 100 free searches per day.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">To enable:</p>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Go to the <a href="https://console.cloud.google.com/apis/library/customsearch.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Google Cloud Console</a></li>
                <li>Select your project from the dropdown</li>
                <li>Click "Enable" to activate the Custom Search API</li>
                <li>Wait a few minutes for changes to propagate</li>
                <li>Re-run your investigation</li>
              </ol>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 mt-2"
              onClick={() => window.open('https://console.cloud.google.com/apis/library/customsearch.googleapis.com', '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              Open Google Cloud Console
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-semibold text-destructive">Web Search Error</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (totalResults === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No web results found</p>
        <p className="text-sm mt-1">Try adjusting your search parameters</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div 
      ref={containerRef}
      className="space-y-4 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="listbox"
      aria-label="Web search results"
    >
      {/* Header with stats and controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">
              Google Search Results
            </h3>
          </div>
          <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">
            {confirmedResults.length} confirmed
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {possibleResults.length} possible
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            ↑↓ navigate • Enter to visit
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          className="gap-2"
        >
          <FileDown className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filter input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter results by keyword..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9 h-10"
        />
        {filter && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => setFilter("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filter && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredTotal} of {totalResults} results for "{filter}"
        </p>
      )}

      {/* Category Bar Chart */}
      {categoryStats.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowChart(!showChart)}
            className="w-full flex items-center justify-between gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Results by Category</span>
              <Badge variant="secondary" className="text-xs">
                {categoryStats.length} categories
              </Badge>
            </div>
            {showChart ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          {showChart && (
            <div className="p-4 bg-background/50">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={categoryStats} 
                    layout="vertical" 
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis 
                      type="category" 
                      dataKey="label" 
                      tick={{ fontSize: 12 }}
                      width={90}
                    />
                    <RechartsTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                              <p className="font-medium text-sm">{data.label}</p>
                              <p className="text-muted-foreground text-xs mt-1">
                                {data.count} results found
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {categoryStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
                {categoryStats.map((cat) => (
                  <div key={cat.category} className="flex items-center gap-1.5 text-xs">
                    <div 
                      className="w-3 h-3 rounded-sm" 
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-muted-foreground">{cat.label}</span>
                    <span className="font-medium">({cat.count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Queries Executed - Expandable */}
      {queriesUsed.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowQueries(!showQueries)}
            className="w-full flex items-center justify-between gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Queries Executed</span>
              <Badge variant="secondary" className="text-xs">
                {queriesUsed.length} queries
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {queriesUsed.reduce((sum, q) => sum + (q.resultCount || 0), 0)} raw results
              </Badge>
            </div>
            {showQueries ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          {showQueries && (
            <div className="p-3 space-y-3 bg-background/50">
              {/* Keywords searched */}
              {keywordsSearched.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
                  <span className="text-xs text-muted-foreground font-medium">Keywords:</span>
                  {keywordsSearched.map((k, i) => (
                    <Badge key={i} variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs">
                      {k}
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Query list with result counts */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {queriesUsed.map((q, i) => (
                  <div 
                    key={i} 
                    className={`flex items-start gap-3 p-2 rounded-md text-sm ${
                      (q.resultCount || 0) > 0 
                        ? 'bg-green-500/5 border border-green-500/20' 
                        : 'bg-muted/30 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-shrink-0 min-w-[100px]">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>
                      <Badge 
                        variant={q.resultCount && q.resultCount > 0 ? "default" : "secondary"}
                        className={`text-xs ${
                          q.resultCount && q.resultCount > 0 
                            ? 'bg-green-600 hover:bg-green-700' 
                            : ''
                        }`}
                      >
                        {q.resultCount ?? 0} results
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {q.description || q.type}
                        </Badge>
                      </div>
                      <code className="text-xs text-muted-foreground break-all font-mono leading-relaxed">
                        {q.query}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmed Results */}
      {filteredConfirmed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            <h4 className="font-medium text-green-600 dark:text-green-400">
              Confirmed Matches ({filteredConfirmed.length})
            </h4>
          </div>
          
          {/* Corroboration Summary with Pie Chart */}
          {(() => {
            const pieData = [
              { name: 'Name', value: corroborationStats.nameMatch, color: '#3b82f6' },
              { name: 'Phone', value: corroborationStats.phone, color: '#f97316' },
              { name: 'Email', value: corroborationStats.email, color: '#06b6d4' },
              { name: 'Username', value: corroborationStats.username, color: '#6366f1' },
              { name: 'Location', value: corroborationStats.location, color: '#22c55e' },
              { name: 'Relative', value: corroborationStats.relative, color: '#ec4899' },
              { name: 'Keywords', value: corroborationStats.keywords, color: '#a855f7' },
            ].filter(item => item.value > 0);
            
            const totalFactors = pieData.reduce((sum, item) => sum + item.value, 0);
            
            return totalFactors > 0 ? (
              <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                <div className="flex items-start gap-6">
                  {/* Pie Chart */}
                  <div className="flex-shrink-0 w-32 h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                                  <p className="text-sm font-medium">{data.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {data.value} results ({Math.round((data.value / totalFactors) * 100)}%)
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Legend and Stats */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        Corroborating Factors Distribution
                      </span>
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-xs">
                        {totalFactors} total matches
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {corroborationStats.nameMatch > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/10">
                          <div className="w-3 h-3 rounded-full bg-blue-500" />
                          <Check className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs text-muted-foreground">{corroborationStats.nameMatch} name</span>
                        </div>
                      )}
                      {corroborationStats.phone > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-orange-500/10">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <Phone className="h-3.5 w-3.5 text-orange-500" />
                          <span className="text-xs text-muted-foreground">{corroborationStats.phone} phone</span>
                        </div>
                      )}
                      {corroborationStats.email > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-cyan-500/10">
                          <div className="w-3 h-3 rounded-full bg-cyan-500" />
                          <Mail className="h-3.5 w-3.5 text-cyan-500" />
                          <span className="text-xs text-muted-foreground">{corroborationStats.email} email</span>
                        </div>
                      )}
                      {corroborationStats.username > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-indigo-500/10">
                          <div className="w-3 h-3 rounded-full bg-indigo-500" />
                          <User className="h-3.5 w-3.5 text-indigo-500" />
                          <span className="text-xs text-muted-foreground">{corroborationStats.username} username</span>
                        </div>
                      )}
                      {corroborationStats.location > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <MapPin className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-xs text-muted-foreground">{corroborationStats.location} location</span>
                        </div>
                      )}
                      {corroborationStats.relative > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-pink-500/10">
                          <div className="w-3 h-3 rounded-full bg-pink-500" />
                          <Users className="h-3.5 w-3.5 text-pink-500" />
                          <span className="text-xs text-muted-foreground">{corroborationStats.relative} relative</span>
                        </div>
                      )}
                      {corroborationStats.keywords > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-purple-500/10">
                          <div className="w-3 h-3 rounded-full bg-purple-500" />
                          <Search className="h-3.5 w-3.5 text-purple-500" />
                          <span className="text-xs text-muted-foreground">{corroborationStats.keywords} keywords</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null;
          })()}
          
          <div className="space-y-3 pl-4">
            {filteredConfirmed.map((item, idx) => renderResultItem(item, idx, true, idx))}
          </div>
        </div>
      )}

      {/* Possible Results - Collapsible */}
      {filteredPossible.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowPossible(!showPossible)}
            className="flex items-center gap-2 w-full text-left hover:text-primary transition-colors"
          >
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <h4 className="font-medium text-yellow-600 dark:text-yellow-400">
              Possible Matches ({filteredPossible.length})
            </h4>
            <span className="text-xs text-muted-foreground ml-1">— Requires verification</span>
            {showPossible ? (
              <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
            )}
          </button>
          
          {showPossible && (
            <div className="space-y-3 pl-4 opacity-90">
              {filteredPossible.map((item, idx) => renderResultItem(item, idx, false, filteredConfirmed.length + idx))}
            </div>
          )}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

export default GoogleSearchResults;
