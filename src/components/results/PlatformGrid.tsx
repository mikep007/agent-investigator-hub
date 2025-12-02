import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ExternalLink, CheckCircle2, XCircle, HelpCircle, 
  Download, Image, Video, FileText, BookmarkPlus
} from "lucide-react";
import { FindingData, PlatformAccount } from "./types";
import PlatformLogo from "../PlatformLogo";
import SaveToCaseButton from "./SaveToCaseButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PlatformGridProps {
  findings: FindingData[];
  onVerify?: (platformUrl: string, status: 'verified' | 'inaccurate') => void;
  onDeepDive?: (platform: string, findingId: string) => void;
}

const PlatformGrid = ({ findings, onVerify, onDeepDive }: PlatformGridProps) => {
  // Extract all platform accounts from findings
  const extractPlatforms = (): PlatformAccount[] => {
    const platforms: PlatformAccount[] = [];
    const seenUrls = new Set<string>();

    findings.forEach(finding => {
      const data = finding.data;

      // Sherlock results
      if (finding.agent_type === 'Sherlock' && data.foundPlatforms) {
        data.foundPlatforms.forEach((p: any) => {
          if (!seenUrls.has(p.url)) {
            seenUrls.add(p.url);
            platforms.push({
              platform: p.name,
              url: p.url,
              username: data.username,
              verified: true,
              verificationStatus: p.verificationStatus,
            });
          }
        });
      }

      // Holehe results
      if (finding.agent_type === 'Holehe' && data.allResults) {
        data.allResults
          .filter((r: any) => r.exists)
          .forEach((r: any) => {
            const url = `https://${r.domain}`;
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              platforms.push({
                platform: r.name || r.domain,
                url,
                verified: true,
                verificationStatus: r.verificationStatus,
              });
            }
          });
      }

      // Social search results
      if ((finding.agent_type === 'Social' || finding.agent_type === 'Social_name' || finding.agent_type === 'Idcrawl') && data.profiles) {
        data.profiles
          .filter((p: any) => p.exists)
          .forEach((p: any) => {
            if (!seenUrls.has(p.url)) {
              seenUrls.add(p.url);
              platforms.push({
                platform: p.platform,
                url: p.url,
                profileImage: p.profileImage,
                verified: true,
                verificationStatus: p.verificationStatus,
              });
            }
          });
      }
    });

    return platforms;
  };

  const platforms = extractPlatforms();

  // Group by verification status
  const verifiedPlatforms = platforms.filter(p => p.verificationStatus === 'verified');
  const unverifiedPlatforms = platforms.filter(p => p.verificationStatus !== 'verified' && p.verificationStatus !== 'inaccurate');
  const inaccuratePlatforms = platforms.filter(p => p.verificationStatus === 'inaccurate');

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'inaccurate':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <HelpCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const PlatformCard = ({ platform }: { platform: PlatformAccount }) => (
    <Card className="group hover:shadow-md transition-all hover:border-primary/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            <PlatformLogo platform={platform.platform} size="lg" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{platform.platform}</span>
              {getStatusIcon(platform.verificationStatus)}
            </div>
            {platform.username && (
              <p className="text-sm text-muted-foreground truncate">@{platform.username}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(platform.url, '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Opens in new tab - verify manually</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onDeepDive && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeepDive(platform.platform, platform.url)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Deep dive - extract profile data</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <SaveToCaseButton
            item={{
              item_type: 'platform',
              title: `${platform.platform} - ${platform.username || 'Profile'}`,
              content: {
                platform: platform.platform,
                url: platform.url,
                username: platform.username,
                verified: platform.verificationStatus === 'verified',
              },
              source_url: platform.url,
              tags: [platform.platform.toLowerCase()],
            }}
            size="sm"
            variant="ghost"
          />
        </div>

        {/* Verification buttons */}
        {onVerify && platform.verificationStatus !== 'verified' && (
          <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => onVerify(platform.url, 'verified')}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Verify
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => onVerify(platform.url, 'inaccurate')}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-1">
        {/* Summary Stats */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{platforms.length}</div>
            <div className="text-xs text-muted-foreground">Total Platforms</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{verifiedPlatforms.length}</div>
            <div className="text-xs text-muted-foreground">Verified</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">{unverifiedPlatforms.length}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          {inaccuratePlatforms.length > 0 && (
            <>
              <div className="h-10 w-px bg-border" />
              <div className="text-center">
                <div className="text-3xl font-bold text-destructive">{inaccuratePlatforms.length}</div>
                <div className="text-xs text-muted-foreground">Dismissed</div>
              </div>
            </>
          )}
        </div>

        {/* Verified Platforms */}
        {verifiedPlatforms.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h3 className="font-semibold">Verified Accounts</h3>
              <Badge variant="secondary">{verifiedPlatforms.length}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {verifiedPlatforms.map((platform, idx) => (
                <PlatformCard key={`verified-${idx}`} platform={platform} />
              ))}
            </div>
          </div>
        )}

        {/* Unverified Platforms */}
        {unverifiedPlatforms.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-yellow-500" />
              <h3 className="font-semibold">Pending Verification</h3>
              <Badge variant="secondary">{unverifiedPlatforms.length}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {unverifiedPlatforms.map((platform, idx) => (
                <PlatformCard key={`unverified-${idx}`} platform={platform} />
              ))}
            </div>
          </div>
        )}

        {/* Dismissed Platforms - collapsed by default */}
        {inaccuratePlatforms.length > 0 && (
          <div className="space-y-3 opacity-60">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold">Dismissed</h3>
              <Badge variant="secondary">{inaccuratePlatforms.length}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {inaccuratePlatforms.map((platform, idx) => (
                <PlatformCard key={`inaccurate-${idx}`} platform={platform} />
              ))}
            </div>
          </div>
        )}

        {platforms.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-4xl mb-2">🔍</div>
            <p>No platform accounts discovered yet</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default PlatformGrid;
