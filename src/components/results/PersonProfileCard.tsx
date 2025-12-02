import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  User, Mail, Phone, MapPin, AtSign, Users, 
  Globe, Shield, AlertTriangle, CheckCircle2 
} from "lucide-react";
import { FindingData, ProfileData } from "./types";
import ConfidenceScoreBadge from "../ConfidenceScoreBadge";

interface PersonProfileCardProps {
  findings: FindingData[];
  targetName?: string;
}

const PersonProfileCard = ({ findings, targetName }: PersonProfileCardProps) => {
  // Extract profile data from findings
  const extractProfileData = (): ProfileData => {
    const profile: ProfileData = {
      name: targetName || 'Unknown Subject',
      locations: [],
      emails: [],
      phones: [],
      usernames: [],
      relatives: [],
    };

    findings.forEach(finding => {
      const data = finding.data;
      
      // Extract from people search
      if (finding.agent_type === 'People_search' && data.results) {
        data.results.forEach((result: any) => {
          if (result.phones) profile.phones.push(...result.phones.map((p: any) => p.number || p));
          if (result.emails) profile.emails.push(...result.emails);
          if (result.relatives) profile.relatives.push(...result.relatives.map((r: any) => r.name || r));
          if (result.addresses) {
            result.addresses.forEach((addr: any) => {
              const loc = typeof addr === 'string' ? addr : addr.full || `${addr.street}, ${addr.city}, ${addr.state}`;
              if (loc) profile.locations?.push(loc);
            });
          }
          if (result.age) profile.age = result.age;
          if (result.photo) profile.photo = result.photo;
        });
      }

      // Extract from address search
      if (finding.agent_type === 'Address' && data.location) {
        const addr = data.location.formatted_address;
        if (addr && !profile.locations?.includes(addr)) {
          profile.locations?.push(addr);
        }
      }

      // Extract usernames from Sherlock
      if (finding.agent_type === 'Sherlock' && data.username) {
        if (!profile.usernames?.includes(data.username)) {
          profile.usernames?.push(data.username);
        }
      }

      // Extract email
      if (finding.agent_type === 'Holehe' && data.email) {
        if (!profile.emails?.includes(data.email)) {
          profile.emails?.push(data.email);
        }
      }
    });

    // Deduplicate
    profile.emails = [...new Set(profile.emails)];
    profile.phones = [...new Set(profile.phones)];
    profile.locations = [...new Set(profile.locations)];
    profile.usernames = [...new Set(profile.usernames)];
    profile.relatives = [...new Set(profile.relatives)];

    return profile;
  };

  const profile = extractProfileData();

  // Calculate overall confidence
  const avgConfidence = findings.length > 0
    ? findings.reduce((sum, f) => sum + (f.confidence_score || 0), 0) / findings.length
    : 0;

  // Count verified findings
  const verifiedCount = findings.filter(f => f.verification_status === 'verified').length;
  const totalPlatforms = findings.filter(f => 
    f.agent_type === 'Sherlock' || f.agent_type === 'Holehe' || f.agent_type === 'Social'
  ).reduce((count, f) => {
    if (f.data?.foundPlatforms) return count + f.data.foundPlatforms.length;
    if (f.data?.accountsFound) return count + f.data.accountsFound;
    return count;
  }, 0);

  const breachCount = findings
    .filter(f => f.agent_type === 'Breach' || f.source?.includes('LeakCheck'))
    .reduce((count, f) => count + (f.data?.found || f.data?.sources?.length || 0), 0);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-1">
        {/* Hero Card */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                <AvatarImage src={profile.photo} />
                <AvatarFallback className="text-2xl bg-primary/20">
                  {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{profile.name}</h2>
                  {profile.age && (
                    <Badge variant="secondary">{profile.age} years old</Badge>
                  )}
                </div>
                
                {profile.locations && profile.locations.length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{profile.locations[0]}</span>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <ConfidenceScoreBadge score={avgConfidence} size="lg" />
                    <span className="text-sm text-muted-foreground">Avg Confidence</span>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="text-center">
                    <div className="text-xl font-bold text-primary">{totalPlatforms}</div>
                    <div className="text-xs text-muted-foreground">Platforms</div>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">{verifiedCount}</div>
                    <div className="text-xs text-muted-foreground">Verified</div>
                  </div>
                  {breachCount > 0 && (
                    <>
                      <Separator orientation="vertical" className="h-6" />
                      <div className="text-center">
                        <div className="text-xl font-bold text-destructive">{breachCount}</div>
                        <div className="text-xs text-muted-foreground">Breaches</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Emails */}
          {profile.emails && profile.emails.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Email Addresses</h3>
                  <Badge variant="secondary" className="ml-auto">{profile.emails.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.emails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-mono">{email}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Phone Numbers */}
          {profile.phones && profile.phones.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Phone Numbers</h3>
                  <Badge variant="secondary" className="ml-auto">{profile.phones.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.phones.map((phone, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-mono">{phone}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Usernames */}
          {profile.usernames && profile.usernames.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AtSign className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Known Usernames</h3>
                  <Badge variant="secondary" className="ml-auto">{profile.usernames.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.usernames.map((username, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-mono">@{username}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Locations */}
          {profile.locations && profile.locations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Known Locations</h3>
                  <Badge variant="secondary" className="ml-auto">{profile.locations.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.locations.map((location, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <span className="text-sm">{location}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Relatives */}
        {profile.relatives && profile.relatives.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Related Persons</h3>
                <Badge variant="secondary" className="ml-auto">{profile.relatives.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {profile.relatives.map((relative, idx) => (
                  <Badge key={idx} variant="outline" className="text-sm">
                    {relative}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Quality Summary */}
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>{verifiedCount} verified findings</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-500" />
                <span>{totalPlatforms} platforms discovered</span>
              </div>
              {breachCount > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>{breachCount} breach records</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
};

export default PersonProfileCard;
