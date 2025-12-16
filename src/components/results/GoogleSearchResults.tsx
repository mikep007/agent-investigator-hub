import { useState } from "react";
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
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ConfidenceScoreBadge from "../ConfidenceScoreBadge";
import { exportWebResultsToCSV } from "@/utils/csvExport";

interface WebResultItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  confidenceScore?: number;
  isExactMatch?: boolean;
  hasLocation?: boolean;
  hasKeywords?: boolean;
  keywordMatches?: string[];
  hasPhone?: boolean;
  hasEmail?: boolean;
  sourceType?: string;
  queryDescription?: string;
}

interface GoogleSearchResultsProps {
  confirmedResults: WebResultItem[];
  possibleResults: WebResultItem[];
  queriesUsed?: { type: string; query: string; description: string }[];
  keywordsSearched?: string[];
  targetName?: string;
  onVerify?: (link: string, status: 'verified' | 'inaccurate') => void;
}

const GoogleSearchResults = ({
  confirmedResults,
  possibleResults,
  queriesUsed = [],
  keywordsSearched = [],
  targetName,
  onVerify
}: GoogleSearchResultsProps) => {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [showPossible, setShowPossible] = useState(true);
  const [verifiedLinks, setVerifiedLinks] = useState<Set<string>>(new Set());
  const [inaccurateLinks, setInaccurateLinks] = useState<Set<string>>(new Set());

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

  const renderResultItem = (item: WebResultItem, index: number, isConfirmed: boolean) => {
    const isVerified = verifiedLinks.has(item.link);
    const isInaccurate = inaccurateLinks.has(item.link);

    return (
      <div 
        key={`${item.link}-${index}`}
        className={`group relative rounded-xl border transition-all duration-200 ${
          isInaccurate 
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
          {/* URL row - clickable */}
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

          {/* Title - main clickable element */}
          <button
            onClick={() => handleVisit(item.link)}
            className="text-left w-full mb-2"
          >
            <h3 className="text-lg font-medium text-primary hover:underline line-clamp-2 transition-colors">
              {item.title || 'Untitled Result'}
            </h3>
          </button>

          {/* Snippet */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {item.snippet}
          </p>

          {/* Match indicators */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {item.confidenceScore !== undefined && (
              <ConfidenceScoreBadge score={item.confidenceScore} />
            )}
            {item.isExactMatch && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs gap-1">
                <Check className="h-3 w-3" />
                Name Match
              </Badge>
            )}
            {item.hasLocation && (
              <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 text-xs gap-1">
                <MapPin className="h-3 w-3" />
                Location
              </Badge>
            )}
            {item.hasKeywords && item.keywordMatches?.length > 0 && (
              <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs gap-1">
                <Search className="h-3 w-3" />
                {item.keywordMatches.join(', ')}
              </Badge>
            )}
            {item.hasPhone && (
              <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs gap-1">
                <Phone className="h-3 w-3" />
                Phone
              </Badge>
            )}
            {item.hasEmail && (
              <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs gap-1">
                <Mail className="h-3 w-3" />
                Email
              </Badge>
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
    <div className="space-y-4">
      {/* Header with stats and controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
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

      {/* Queries used */}
      {queriesUsed.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Dork Queries Executed</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {queriesUsed.map((q, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {q.description || q.type}
              </Badge>
            ))}
          </div>
          {keywordsSearched.length > 0 && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Keywords:</span>
              {keywordsSearched.map((k, i) => (
                <Badge key={i} variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs">
                  {k}
                </Badge>
              ))}
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
          <div className="space-y-3 pl-4">
            {filteredConfirmed.map((item, idx) => renderResultItem(item, idx, true))}
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
              {filteredPossible.map((item, idx) => renderResultItem(item, idx, false))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoogleSearchResults;
