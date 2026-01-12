import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useOSINTExtension } from '@/hooks/useOSINTExtension';
import { 
  Puzzle, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ExternalLink,
  Download,
  RefreshCw,
  Globe
} from 'lucide-react';

interface ExtensionStatusCardProps {
  compact?: boolean;
  showConnectInput?: boolean;
}

export function ExtensionStatusCard({ compact = false, showConnectInput = false }: ExtensionStatusCardProps) {
  const { status, supportedSites, isChecking, detectExtension, connectWithId } = useOSINTExtension();
  const [extensionIdInput, setExtensionIdInput] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!extensionIdInput.trim()) return;
    setConnecting(true);
    await connectWithId(extensionIdInput.trim());
    setConnecting(false);
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Puzzle className="w-4 h-4" />
              {isChecking ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : status.connected ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Extension
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  <XCircle className="w-3 h-3 mr-1" />
                  No Extension
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {status.connected ? (
              <div>
                <p className="font-medium">{status.name} v{status.version}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Can scrape: {supportedSites.map(s => s.name).join(', ')}
                </p>
              </div>
            ) : (
              <div>
                <p>Browser extension not detected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Install the OSINT Agent Companion to scrape protected sites
                </p>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Puzzle className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Browser Extension</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={detectExtension} disabled={isChecking}>
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          Scrape protected sites like Whitepages directly from your browser
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <span className="text-sm font-medium">Status</span>
          {isChecking ? (
            <Badge variant="outline">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Detecting...
            </Badge>
          ) : status.connected ? (
            <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <XCircle className="w-3 h-3 mr-1" />
              Not Installed
            </Badge>
          )}
        </div>

        {status.connected ? (
          <>
            {/* Version info */}
            <div className="text-sm text-muted-foreground">
              {status.name} v{status.version}
            </div>

            {/* Supported sites */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Supported Sites</p>
              <div className="flex flex-wrap gap-2">
                {supportedSites.map((site) => (
                  <Badge key={site.domain} variant="secondary" className="text-xs">
                    <Globe className="w-3 h-3 mr-1" />
                    {site.name}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Installation instructions */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Install the OSINT Agent Companion extension to scrape data from protected sites
                that block automated access.
              </p>

              <div className="flex flex-col gap-2">
                <Button variant="outline" className="justify-start" asChild>
                  <a 
                    href="https://github.com/user/osint-extension/releases" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Extension
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                  </a>
                </Button>
              </div>

              {showConnectInput && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Already installed? Enter your extension ID:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Extension ID"
                      value={extensionIdInput}
                      onChange={(e) => setExtensionIdInput(e.target.value)}
                      className="text-sm"
                    />
                    <Button 
                      size="sm" 
                      onClick={handleConnect}
                      disabled={connecting || !extensionIdInput.trim()}
                    >
                      {connecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ExtensionStatusCard;
