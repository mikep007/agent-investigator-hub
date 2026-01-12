import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useOSINTExtension, ScrapeResult } from '@/hooks/useOSINTExtension';
import { 
  Puzzle, 
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  User,
  Phone,
  Mail,
  MapPin,
  Users
} from 'lucide-react';

interface ExtensionScraperProps {
  url: string;
  onResult?: (result: ScrapeResult) => void;
  showPreview?: boolean;
}

export function ExtensionScraper({ url, onResult, showPreview = true }: ExtensionScraperProps) {
  const { status, scrapeUrl, isUrlSupported, getSiteInfo } = useOSINTExtension();
  const [scraping, setScraping] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const siteInfo = getSiteInfo(url);
  const isSupported = isUrlSupported(url);

  const handleScrape = async () => {
    setScraping(true);
    setError(null);
    setResult(null);

    try {
      const scrapeResult = await scrapeUrl(url);
      setResult(scrapeResult);
      
      if (!scrapeResult.success) {
        setError(scrapeResult.error || 'Scraping failed');
      }
      
      onResult?.(scrapeResult);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      setError(errorMsg);
      onResult?.({ success: false, error: errorMsg });
    } finally {
      setScraping(false);
    }
  };

  if (!status.connected) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" disabled className="opacity-50">
              <Puzzle className="w-4 h-4 mr-2" />
              Extension Required
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Install the OSINT Agent Companion extension to scrape this site</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!isSupported) {
    return (
      <Button variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="w-4 h-4 mr-2" />
          Open in Browser
        </a>
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button 
          variant="default" 
          size="sm" 
          onClick={handleScrape}
          disabled={scraping}
        >
          {scraping ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Scraping...
            </>
          ) : result?.success ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Scraped
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Scrape with Extension
            </>
          )}
        </Button>
        
        {siteInfo && (
          <Badge variant="secondary" className="text-xs">
            {siteInfo.name}
          </Badge>
        )}

        <Button variant="ghost" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4" />
          </a>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {showPreview && result?.success && result.data && (
        <ScrapedDataPreview data={result.data} />
      )}
    </div>
  );
}

interface ScrapedDataPreviewProps {
  data: any;
}

function ScrapedDataPreview({ data }: ScrapedDataPreviewProps) {
  if (data.error) {
    return (
      <Card className="bg-destructive/10 border-destructive/30">
        <CardContent className="py-3">
          <p className="text-sm text-destructive">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/50">
      <CardContent className="py-3 space-y-3">
        {/* Source info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="capitalize">{data.source}</span>
          <span>{data.type}</span>
        </div>

        {/* Name */}
        {data.name && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span className="font-medium">{data.name}</span>
            {data.age && (
              <Badge variant="outline" className="text-xs">
                Age {data.age}
              </Badge>
            )}
          </div>
        )}

        {/* Address */}
        {(data.currentAddress || data.address) && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
            <span>{data.currentAddress || data.address}</span>
          </div>
        )}

        {/* Phones */}
        {data.phones && data.phones.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {data.phones.slice(0, 3).map((phone: any, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {typeof phone === 'string' ? phone : phone.number}
                </Badge>
              ))}
              {data.phones.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{data.phones.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Emails */}
        {data.emails && data.emails.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {data.emails.slice(0, 2).map((email: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {email}
                </Badge>
              ))}
              {data.emails.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{data.emails.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Relatives */}
        {data.relatives && data.relatives.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <span className="text-muted-foreground">Relatives: </span>
              {data.relatives.slice(0, 3).map((r: any, i: number) => (
                <span key={i}>
                  {r.name || r}
                  {i < Math.min(data.relatives.length, 3) - 1 && ', '}
                </span>
              ))}
              {data.relatives.length > 3 && (
                <span className="text-muted-foreground"> +{data.relatives.length - 3} more</span>
              )}
            </div>
          </div>
        )}

        {/* Residents (for address pages) */}
        {data.residents && data.residents.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <span className="text-muted-foreground">Residents: </span>
              {data.residents.slice(0, 3).map((r: any, i: number) => (
                <span key={i}>
                  {r.name || r}
                  {i < Math.min(data.residents.length, 3) - 1 && ', '}
                </span>
              ))}
              {data.residents.length > 3 && (
                <span className="text-muted-foreground"> +{data.residents.length - 3} more</span>
              )}
            </div>
          </div>
        )}

        {/* Search results */}
        {data.results && data.results.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Found {data.results.length} results
            </p>
            {data.results.slice(0, 3).map((result: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <User className="w-3 h-3 text-muted-foreground" />
                <span>{result.name}</span>
                {result.age && (
                  <span className="text-muted-foreground text-xs">({result.age})</span>
                )}
                {result.location && (
                  <span className="text-muted-foreground text-xs">• {result.location}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ExtensionScraper;
