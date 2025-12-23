import { useState, useEffect } from 'react';
import { RefreshCw, User, Mail, AtSign, Users, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DiscoveredData {
  usernames: string[];
  emails: string[];
  phones: string[];
  relatives: string[];
}

interface EnrichInvestigationProps {
  findings: any[];
  originalSearchData: {
    fullName?: string;
    email?: string;
    phone?: string;
    username?: string;
  };
  onRerun: (enrichedData: {
    fullName?: string;
    email?: string;
    phone?: string;
    username?: string;
    additionalUsernames?: string[];
    additionalEmails?: string[];
  }) => void;
}

const EnrichInvestigation = ({ findings, originalSearchData, onRerun }: EnrichInvestigationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredData>({
    usernames: [],
    emails: [],
    phones: [],
    relatives: [],
  });
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedRelatives, setSelectedRelatives] = useState<string[]>([]);

  // Extract discovered data from findings
  useEffect(() => {
    const usernames = new Set<string>();
    const emails = new Set<string>();
    const phones = new Set<string>();
    const relatives = new Set<string>();

    findings.forEach((finding) => {
      const data = finding.data;

      // Extract from social profiles
      if (data?.profiles) {
        data.profiles.forEach((profile: any) => {
          if (profile.username && profile.username !== originalSearchData.username) {
            usernames.add(profile.username);
          }
        });
      }

      // Extract from sherlock results
      if (data?.foundPlatforms) {
        data.foundPlatforms.forEach((platform: any) => {
          if (platform.username && platform.username !== originalSearchData.username) {
            usernames.add(platform.username);
          }
        });
      }

      // Extract emails from web results
      if (data?.items) {
        data.items.forEach((item: any) => {
          if (item.hasEmail && item.snippet) {
            const emailMatches = item.snippet.match(/[\w.-]+@[\w.-]+\.\w+/g);
            if (emailMatches) {
              emailMatches.forEach((email: string) => {
                if (email !== originalSearchData.email) {
                  emails.add(email.toLowerCase());
                }
              });
            }
          }
        });
      }

      // Extract relatives
      if (data?.potentialRelatives) {
        data.potentialRelatives.forEach((rel: any) => {
          const name = typeof rel === 'string' ? rel : rel.name;
          if (name && name !== originalSearchData.fullName) {
            relatives.add(name);
          }
        });
      }

      // Extract from discovered relatives in web search
      if (data?.discoveredRelatives) {
        data.discoveredRelatives.forEach((rel: string) => {
          if (rel !== originalSearchData.fullName) {
            relatives.add(rel);
          }
        });
      }
    });

    setDiscovered({
      usernames: Array.from(usernames).slice(0, 10),
      emails: Array.from(emails).slice(0, 10),
      phones: Array.from(phones).slice(0, 10),
      relatives: Array.from(relatives).slice(0, 10),
    });
  }, [findings, originalSearchData]);

  const totalDiscovered = 
    discovered.usernames.length + 
    discovered.emails.length + 
    discovered.relatives.length;

  const totalSelected = 
    selectedUsernames.length + 
    selectedEmails.length + 
    selectedRelatives.length;

  if (totalDiscovered === 0) {
    return null;
  }

  const handleRerun = () => {
    onRerun({
      ...originalSearchData,
      additionalUsernames: selectedUsernames,
      additionalEmails: selectedEmails,
      // If a relative is selected, use them as the primary name
      fullName: selectedRelatives.length > 0 
        ? selectedRelatives[0] 
        : originalSearchData.fullName,
    });
  };

  const toggleUsername = (username: string) => {
    setSelectedUsernames(prev => 
      prev.includes(username) 
        ? prev.filter(u => u !== username)
        : [...prev, username]
    );
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  const toggleRelative = (relative: string) => {
    setSelectedRelatives(prev => 
      prev.includes(relative) 
        ? prev.filter(r => r !== relative)
        : [...prev, relative]
    );
  };

  return (
    <Card className="bg-card/80 backdrop-blur border-primary/20 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full flex items-center justify-between p-4 h-auto hover:bg-primary/5"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-medium text-sm">Enrich & Re-run Investigation</h3>
                <p className="text-xs text-muted-foreground">
                  {totalDiscovered} new data points discovered
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {totalDiscovered} found
              </Badge>
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {/* Discovered Usernames */}
            {discovered.usernames.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <AtSign className="w-4 h-4" />
                  <span>Discovered Usernames</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {discovered.usernames.map((username) => (
                    <label 
                      key={username}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedUsernames.includes(username)}
                        onCheckedChange={() => toggleUsername(username)}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs">{username}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered Emails */}
            {discovered.emails.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span>Discovered Emails</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {discovered.emails.map((email) => (
                    <label 
                      key={email}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedEmails.includes(email)}
                        onCheckedChange={() => toggleEmail(email)}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs">{email}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered Relatives */}
            {discovered.relatives.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>Discovered Relatives/Associates</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {discovered.relatives.map((relative) => (
                    <label 
                      key={relative}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedRelatives.includes(relative)}
                        onCheckedChange={() => toggleRelative(relative)}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs">{relative}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Re-run Button */}
            <div className="pt-2 border-t border-border">
              <Button
                onClick={handleRerun}
                disabled={totalSelected === 0}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-run with {totalSelected} Selected Item{totalSelected !== 1 ? 's' : ''}
              </Button>
              {totalSelected === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Select items above to include in re-run
                </p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default EnrichInvestigation;
