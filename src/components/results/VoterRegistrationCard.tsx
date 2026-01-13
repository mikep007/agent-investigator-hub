import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Vote, CheckCircle2, XCircle, MapPin, Building, 
  Calendar, ExternalLink, Users, Flag, AlertCircle, Globe
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
  stateHouseDistrict?: string;
  stateSenateDistrict?: string;
  assemblyDistrict?: string;
  electionDistrict?: string;
  voterId?: string;
  schoolDistrict?: string;
}

interface StateConfig {
  name: string;
  abbrev: string;
  url: string;
  source: string;
  color: string;
}

const STATE_CONFIGS: Record<string, StateConfig> = {
  PA: {
    name: 'Pennsylvania',
    abbrev: 'PA',
    url: 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
    source: 'PA Department of State',
    color: 'bg-blue-500/10 text-blue-600',
  },
  NY: {
    name: 'New York',
    abbrev: 'NY',
    url: 'https://voterlookup.elections.ny.gov/',
    source: 'NY Board of Elections',
    color: 'bg-purple-500/10 text-purple-600',
  },
  FL: {
    name: 'Florida',
    abbrev: 'FL',
    url: 'https://registration.elections.myflorida.com/CheckVoterStatus',
    source: 'FL Division of Elections',
    color: 'bg-orange-500/10 text-orange-600',
  },
  OH: {
    name: 'Ohio',
    abbrev: 'OH',
    url: 'https://voterlookup.ohiosos.gov/voterlookup.aspx',
    source: 'OH Secretary of State',
    color: 'bg-red-500/10 text-red-600',
  },
  TX: {
    name: 'Texas',
    abbrev: 'TX',
    url: 'https://teamrv-mvp.sos.texas.gov/MVP/mvp.do',
    source: 'TX Secretary of State',
    color: 'bg-amber-500/10 text-amber-600',
  },
  CA: {
    name: 'California',
    abbrev: 'CA',
    url: 'https://voterstatus.sos.ca.gov/',
    source: 'CA Secretary of State',
    color: 'bg-yellow-500/10 text-yellow-600',
  },
  GA: {
    name: 'Georgia',
    abbrev: 'GA',
    url: 'https://mvp.sos.ga.gov/s/',
    source: 'GA Secretary of State',
    color: 'bg-rose-500/10 text-rose-600',
  },
  NC: {
    name: 'North Carolina',
    abbrev: 'NC',
    url: 'https://vt.ncsbe.gov/RegLkup/',
    source: 'NC State Board of Elections',
    color: 'bg-cyan-500/10 text-cyan-600',
  },
};

const VoterRegistrationCard = ({ findings, targetName }: VoterRegistrationCardProps) => {
  // Extract voter lookup data from findings for all supported states
  const voterFindings = findings.filter(f => {
    const agentType = f.agent_type?.toLowerCase() || '';
    const source = f.source?.toLowerCase() || '';
    
    return (
      agentType.includes('voter') ||
      agentType === 'pa_voter' ||
      agentType === 'ny_voter' ||
      agentType === 'fl_voter' ||
      agentType === 'oh_voter' ||
      agentType === 'tx_voter' ||
      agentType === 'ca_voter' ||
      agentType === 'ga_voter' ||
      agentType === 'nc_voter' ||
      source.includes('pavoterservices') ||
      source.includes('voterlookup.elections.ny') ||
      source.includes('elections.myflorida') ||
      source.includes('voterlookup.ohiosos') ||
      source.includes('sos.texas.gov') ||
      source.includes('voterstatus.sos.ca.gov') ||
      source.includes('mvp.sos.ga.gov') ||
      source.includes('vt.ncsbe.gov')
    );
  });

  console.log('[VoterRegistrationCard] All findings agent_types:', findings.map(f => f.agent_type));
  console.log('[VoterRegistrationCard] Voter findings:', voterFindings);

  // Parse findings and determine state
  const voterData = voterFindings.map(f => {
    const data = f.data?.data || f.data as VoterData;
    const source = f.source?.toLowerCase() || '';
    const agentType = f.agent_type?.toLowerCase() || '';
    
    // Determine state from agent_type or source
    let state = 'PA'; // Default
    if (agentType.includes('ny') || source.includes('ny')) state = 'NY';
    else if (agentType.includes('fl') || source.includes('florida') || source.includes('myflorida')) state = 'FL';
    else if (agentType.includes('oh') || source.includes('ohio')) state = 'OH';
    else if (agentType.includes('tx') || source.includes('texas')) state = 'TX';
    else if (agentType.includes('ca') || source.includes('voterstatus.sos.ca')) state = 'CA';
    else if (agentType.includes('ga') || source.includes('mvp.sos.ga')) state = 'GA';
    else if (agentType.includes('nc') || source.includes('ncsbe')) state = 'NC';
    else if (f.data?.state) state = f.data.state;
    
    return {
      finding: f,
      data,
      state,
      url: f.data?.url || STATE_CONFIGS[state]?.url || '',
      method: f.data?.method || 'unknown',
    };
  });

  // Group by state
  const byState = voterData.reduce((acc, v) => {
    if (!acc[v.state]) acc[v.state] = [];
    acc[v.state].push(v);
    return acc;
  }, {} as Record<string, typeof voterData>);

  // Also add manual lookup options for states not yet searched
  const searchedStates = Object.keys(byState);
  const allStates = Object.keys(STATE_CONFIGS);

  if (voterFindings.length === 0) {
    // Show manual lookup card for all states
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
                <p className="text-sm text-muted-foreground">Multi-State Voter Lookup</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <Globe className="h-3 w-3" />
              8 States
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Check voter registration status across multiple states:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {allStates.map(state => {
              const config = STATE_CONFIGS[state];
              return (
                <Button
                  key={state}
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => window.open(config.url, '_blank')}
                >
                  <Badge variant="secondary" className={config.color}>
                    {config.abbrev}
                  </Badge>
                  <span className="truncate">{config.name}</span>
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

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
              <p className="text-sm text-muted-foreground">
                {searchedStates.length === 1 
                  ? `${STATE_CONFIGS[searchedStates[0]]?.name || searchedStates[0]} Voter Services`
                  : `${searchedStates.length} States Checked`
                }
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {searchedStates.map(state => (
              <Badge key={state} variant="outline" className={`gap-1 ${STATE_CONFIGS[state]?.color || ''}`}>
                <Flag className="h-3 w-3" />
                {state}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(byState).map(([state, lookups]) => {
          const config = STATE_CONFIGS[state];
          const successfulLookups = lookups.filter(v => v.data?.found);
          const manualRequired = lookups.filter(v => v.method === 'manual_verification_required');

          return (
            <div key={state} className="space-y-3">
              {/* State Header */}
              <div className="flex items-center gap-2 text-sm font-medium">
                <Badge variant="secondary" className={config?.color || ''}>
                  {state}
                </Badge>
                <span>{config?.name || state}</span>
              </div>

              {successfulLookups.length > 0 ? (
                successfulLookups.map((lookup, idx) => (
                  <div key={idx} className="space-y-3 p-4 rounded-lg bg-muted/50 ml-4">
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

                      {/* Voter ID */}
                      {lookup.data.voterId && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Voter ID:</span>
                          <span className="font-medium font-mono text-xs">{lookup.data.voterId}</span>
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
                      {(lookup.data.district || lookup.data.precinct) && (
                        <>
                          {lookup.data.district && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">District:</span>
                              <span className="font-medium">{lookup.data.district}</span>
                            </div>
                          )}
                          {lookup.data.precinct && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Precinct:</span>
                              <span className="font-medium">{lookup.data.precinct}</span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Congressional District */}
                      {lookup.data.congressionalDistrict && (
                        <div className="flex items-center gap-2 col-span-2">
                          <span className="text-muted-foreground">Congressional District:</span>
                          <span className="font-medium">{lookup.data.congressionalDistrict}</span>
                        </div>
                      )}

                      {/* State Legislative */}
                      {(lookup.data.legislativeDistrict || lookup.data.stateHouseDistrict || lookup.data.assemblyDistrict) && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">State House:</span>
                          <span className="font-medium">
                            {lookup.data.legislativeDistrict || lookup.data.stateHouseDistrict || lookup.data.assemblyDistrict}
                          </span>
                        </div>
                      )}

                      {(lookup.data.senateDistrict || lookup.data.stateSenateDistrict) && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">State Senate:</span>
                          <span className="font-medium">
                            {lookup.data.senateDistrict || lookup.data.stateSenateDistrict}
                          </span>
                        </div>
                      )}

                      {/* School District (OH specific) */}
                      {lookup.data.schoolDistrict && (
                        <div className="flex items-center gap-2 col-span-2">
                          <span className="text-muted-foreground">School District:</span>
                          <span className="font-medium">{lookup.data.schoolDistrict}</span>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => window.open(lookup.url || config?.url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Verify on {config?.source || `${state} Voter Services`}
                    </Button>
                  </div>
                ))
              ) : manualRequired.length > 0 ? (
                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 ml-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-medium text-yellow-700">Manual Verification Required</p>
                      <p className="text-sm text-muted-foreground">
                        Automated lookup was unable to complete for {config?.name || state}. Please verify voter registration manually.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(config?.url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open {config?.source || `${state} Voter Services`}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-muted/50 ml-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="h-5 w-5" />
                    <span>No voter registration found in {config?.name || state} for {targetName || 'this person'}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Quick lookup links for other states */}
        {searchedStates.length < allStates.length && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Check other states:</p>
            <div className="flex flex-wrap gap-2">
              {allStates.filter(s => !searchedStates.includes(s)).map(state => {
                const config = STATE_CONFIGS[state];
                return (
                  <Button
                    key={state}
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => window.open(config.url, '_blank')}
                  >
                    <Badge variant="secondary" className={`${config.color} text-xs px-1 py-0`}>
                      {config.abbrev}
                    </Badge>
                    {config.name}
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Source footer */}
        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <span>Sources: {searchedStates.map(s => STATE_CONFIGS[s]?.source || s).join(', ')}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default VoterRegistrationCard;
