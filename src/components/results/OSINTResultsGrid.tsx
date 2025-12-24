import { ScrollArea } from "@/components/ui/scroll-area";
import { FindingData } from "./types";
import OSINTPlatformCard from "./OSINTPlatformCard";
import ResultsSummaryBar from "./ResultsSummaryBar";
import SourceStatusIndicator from "./SourceStatusIndicator";
import VisualTimeline from "./VisualTimeline";
import RelatedPersonsCard from "./RelatedPersonsCard";
import BusinessRegistryCard from "./BusinessRegistryCard";
import { useMemo } from "react";

interface OSINTResultsGridProps {
  findings: FindingData[];
  targetName?: string;
  inputKeywords?: string[];
  aiSuggestedPersons?: string[];
  onVerify?: (platformUrl: string, status: 'verified' | 'inaccurate') => void;
  onDeepDive?: (platform: string, findingId: string) => void;
  onPivot?: (type: string, value: string) => void;
}

interface ExtractedPlatform {
  platform: string;
  url: string;
  findingId: string;
  username?: string;
  userId?: string;
  profileImage?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  location?: string;
  locationFlag?: string;
  creationDate?: string;
  lastSeen?: string;
  verified?: boolean;
  isPublic?: boolean;
  recentlyActive?: boolean;
}

const OSINTResultsGrid = ({ 
  findings, 
  targetName, 
  inputKeywords = [],
  aiSuggestedPersons = [],
  onVerify, 
  onDeepDive,
  onPivot
}: OSINTResultsGridProps) => {
  // Extract all platforms from findings into OSINT Industries format
  const platforms = useMemo(() => {
    const extracted: ExtractedPlatform[] = [];
    const seenUrls = new Set<string>();

    // Parse location for flag
    const getLocationFlag = (location?: string): string | undefined => {
      if (!location) return undefined;
      const loc = location.toLowerCase();
      if (loc.includes('us') || loc.includes('united states') || loc.includes('usa')) return '🇺🇸';
      if (loc.includes('uk') || loc.includes('united kingdom')) return '🇬🇧';
      if (loc.includes('canada') || loc.includes('ca')) return '🇨🇦';
      if (loc.includes('australia') || loc.includes('au')) return '🇦🇺';
      if (loc.includes('germany') || loc.includes('de')) return '🇩🇪';
      if (loc.includes('france') || loc.includes('fr')) return '🇫🇷';
      if (loc.includes('spain') || loc.includes('es')) return '🇪🇸';
      if (loc.includes('italy') || loc.includes('it')) return '🇮🇹';
      if (loc.includes('brazil') || loc.includes('br')) return '🇧🇷';
      if (loc.includes('japan') || loc.includes('jp')) return '🇯🇵';
      if (loc.includes('india') || loc.includes('in')) return '🇮🇳';
      if (loc.includes('mexico') || loc.includes('mx')) return '🇲🇽';
      if (loc.includes('poland') || loc.includes('pl')) return '🇵🇱';
      if (loc.includes('russia') || loc.includes('ru')) return '🇷🇺';
      if (loc.includes('dominican') || loc.includes('do')) return '🇩🇴';
      return undefined;
    };

    findings.forEach(finding => {
      const data = finding.data;
      const findingId = finding.id;

      // Sherlock results - handle both foundPlatforms and profileLinks formats
      if ((finding.agent_type === 'Sherlock' || finding.agent_type === 'Sherlock_from_email')) {
        const platforms = data.foundPlatforms || data.profileLinks || [];
        platforms.forEach((p: any) => {
          if (!seenUrls.has(p.url)) {
            seenUrls.add(p.url);
            extracted.push({
              platform: p.name || p.platform || 'Unknown',
              url: p.url,
              findingId,
              username: data.username,
              userId: p.id,
              profileImage: p.profileImage,
              verified: p.verificationStatus === 'verified',
              isPublic: true,
              creationDate: p.createdAt || p.created_at,
              location: p.location,
              locationFlag: getLocationFlag(p.location),
              recentlyActive: p.recentlyActive,
              lastSeen: p.lastSeen,
            });
          }
        });
      }

      // Holehe results - handle both allResults and registeredOn formats
      if (finding.agent_type === 'Holehe') {
        const results = data.allResults || data.registeredOn || [];
        results
          .filter((r: any) => r.exists !== false)
          .forEach((r: any) => {
            const url = r.url || `https://${r.domain}`;
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              extracted.push({
                platform: r.name || r.domain,
                url,
                findingId,
                verified: r.verificationStatus === 'verified',
                isPublic: r.isPublic,
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
              extracted.push({
                platform: p.platform,
                url: p.url,
                findingId,
                username: p.username || p.name,
                profileImage: p.profileImage || p.image,
                verified: p.verificationStatus === 'verified',
                isPublic: true,
                firstName: p.firstName,
                lastName: p.lastName,
                fullName: p.fullName,
                location: p.location,
                locationFlag: getLocationFlag(p.location),
              });
            }
          });
      }

      // Instagram results
      if ((finding.agent_type === 'Instagram' || finding.agent_type === 'Toutatis') && data.profile) {
        const profile = data.profile;
        const url = `https://instagram.com/${profile.username}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          extracted.push({
            platform: 'Instagram',
            url,
            findingId,
            username: profile.username,
            fullName: profile.fullName,
            profileImage: profile.profilePicUrl,
            verified: profile.isVerified,
            isPublic: !profile.isPrivate,
          });
        }
      }
    });

    return extracted;
  }, [findings]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-1">
        {/* Summary Stats Bar */}
        <ResultsSummaryBar findings={findings} targetName={targetName} />

        {/* Source Status Indicator */}
        <SourceStatusIndicator findings={findings} />

        {/* Relatives & Associates Section */}
        <RelatedPersonsCard 
          findings={findings}
          inputKeywords={inputKeywords}
          aiSuggestedPersons={aiSuggestedPersons}
          onPivot={onPivot}
        />

        {/* Business Affiliations */}
        <BusinessRegistryCard 
          findings={findings}
          onPivot={onPivot}
        />

        {/* Visual Timeline */}
        <VisualTimeline findings={findings} />

        {/* Platform Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {platforms.map((platform, idx) => (
            <OSINTPlatformCard
              key={`${platform.platform}-${idx}`}
              {...platform}
              onExpand={() => onDeepDive?.(platform.platform, platform.findingId)}
            />
          ))}
        </div>

        {platforms.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-lg">No platform accounts discovered yet</p>
            <p className="text-sm mt-1">Results will appear as the investigation progresses</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default OSINTResultsGrid;
