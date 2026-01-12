import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Vote, CheckCircle2, XCircle, MapPin, Building, 
  Calendar, ExternalLink, Users, Flag, AlertCircle
} from "lucide-react";
import { FindingData } from "./types";

interface VoterRegistrationCardProps {
  findings: FindingData[];
  targetName?: string;
}

interface VoterData {
  found: boolean;
  name?: string;
  partyAffiliation?: string;
  pollingPlace?: string;
  county?: string;
  registrationStatus?: string;
  registrationDate?: string;
  lastVoted?: string;
  district?: string;
  precinct?: string;
  congressionalDistrict?: string;
  legislativeDistrict?: string;
  senateDistrict?: string;
}

const VoterRegistrationCard = ({ findings, targetName }: VoterRegistrationCardProps) => {
  // Extract PA voter lookup data from findings
  const voterFindings = findings.filter(f => 
    f.agent_type === 'PA_voter' || 
    f.source?.includes('pavoterservices') ||
    f.agent_type?.toLowerCase().includes('voter')
  );

  if (voterFindings.length === 0) return null;

  const voterData = voterFindings.map(f => ({
    finding: f,
    data: f.data?.data || f.data as VoterData,
    url: f.data?.url || 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
    method: f.data?.method || 'unknown',
  }));

  const successfulLookups = voterData.filter(v => v.data?.found);
  const manualRequired = voterData.filter(v => v.method === 'manual_verification_required');

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Vote className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Voter Registration</CardTitle>
              <p className="text-sm text-muted-foreground">Pennsylvania Voter Services</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            <Flag className="h-3 w-3" />
            PA
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {successfulLookups.length > 0 ? (
          successfulLookups.map((lookup, idx) => (
            <div key={idx} className="space-y-3 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium">
                  {lookup.data.name || targetName || 'Registered Voter Found'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Party Affiliation */}
                {lookup.data.partyAffiliation && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Party:</span>
                    <Badge 
                      variant="secondary"
                      className={
                        lookup.data.partyAffiliation.toLowerCase().includes('democrat') 
                          ? 'bg-blue-500/10 text-blue-700 border-blue-500/20'
                          : lookup.data.partyAffiliation.toLowerCase().includes('republican')
                            ? 'bg-red-500/10 text-red-700 border-red-500/20'
                            : ''
                      }
                    >
                      {lookup.data.partyAffiliation}
                    </Badge>
                  </div>
                )}

                {/* Registration Status */}
                {lookup.data.registrationStatus && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Status:</span>
                    <Badge 
                      variant={lookup.data.registrationStatus.toLowerCase() === 'active' ? 'default' : 'secondary'}
                      className={lookup.data.registrationStatus.toLowerCase() === 'active' ? 'bg-green-600' : ''}
                    >
                      {lookup.data.registrationStatus}
                    </Badge>
                  </div>
                )}

                {/* County */}
                {lookup.data.county && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">County:</span>
                    <span className="font-medium">{lookup.data.county}</span>
                  </div>
                )}

                {/* Polling Place */}
                {lookup.data.pollingPlace && (
                  <div className="flex items-center gap-2 col-span-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Polling Place:</span>
                    <span className="font-medium">{lookup.data.pollingPlace}</span>
                  </div>
                )}

                {/* District Info */}
                {lookup.data.district && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">District:</span>
                    <span className="font-medium">{lookup.data.district}</span>
                  </div>
                )}

                {/* Precinct */}
                {lookup.data.precinct && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Precinct:</span>
                    <span className="font-medium">{lookup.data.precinct}</span>
                  </div>
                )}

                {/* Congressional District */}
                {lookup.data.congressionalDistrict && (
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-muted-foreground">Congressional District:</span>
                    <span className="font-medium">{lookup.data.congressionalDistrict}</span>
                  </div>
                )}

                {/* State Legislative */}
                {lookup.data.legislativeDistrict && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">State House:</span>
                    <span className="font-medium">{lookup.data.legislativeDistrict}</span>
                  </div>
                )}

                {lookup.data.senateDistrict && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">State Senate:</span>
                    <span className="font-medium">{lookup.data.senateDistrict}</span>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => window.open(lookup.url, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Verify on PA Voter Services
              </Button>
            </div>
          ))
        ) : manualRequired.length > 0 ? (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="space-y-2">
                <p className="font-medium text-yellow-700">Manual Verification Required</p>
                <p className="text-sm text-muted-foreground">
                  Automated lookup was unable to complete. Please verify voter registration manually.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open PA Voter Services
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              <span>No voter registration found for {targetName || 'this person'}</span>
            </div>
          </div>
        )}

        {/* Quick lookup link */}
        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <span>Source: PA Department of State</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => window.open('https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx', '_blank')}
          >
            pavoterservices.pa.gov
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default VoterRegistrationCard;
