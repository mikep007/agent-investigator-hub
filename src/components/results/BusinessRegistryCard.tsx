import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  ExternalLink, 
  User, 
  MapPin, 
  Calendar, 
  FileText,
  Shield,
  Users,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  CheckSquare
} from "lucide-react";
import { FindingData } from "./types";
import { useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  exportBusinessRegistryToCSV, 
  exportBusinessRegistryToPDF,
  BusinessResult 
} from "@/utils/businessRegistryExport";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SunbizVerificationModal from "./SunbizVerificationModal";

interface BusinessRegistryCardProps {
  findings: FindingData[];
  targetName?: string;
  investigationId?: string;
  onPivot?: (type: string, value: string) => void;
}

const BusinessRegistryCard = ({ findings, targetName, investigationId, onPivot }: BusinessRegistryCardProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);

  // Extract business registry results from findings
  const businessResults = useMemo(() => {
    const results: BusinessResult[] = [];
    const seenEntities = new Set<string>();

    findings.forEach(finding => {
      const data = finding.data;
      
      // Sunbiz results (Florida)
      if (finding.agent_type === 'Sunbiz' || finding.agent_type === 'Sunbiz_officer' || finding.source?.includes('sunbiz')) {
        const sunbizResults = data.results || [];
        sunbizResults.forEach((r: any) => {
          const key = r.documentNumber || r.entityNumber || r.entityName;
          if (key && !seenEntities.has(key)) {
            seenEntities.add(key);
            results.push({
              ...r,
              entityNumber: r.documentNumber || r.entityNumber,
              entityType: r.filingType || r.entityType,
              jurisdiction: 'Florida',
              state: 'FL',
            });
          }
        });
      }

      // State business search results (CA, NY, TX)
      if (finding.agent_type?.startsWith('State_business') || 
          finding.source?.includes('state-business') ||
          finding.source?.includes('state_business')) {
        const stateResults = data.results || [];
        stateResults.forEach((r: any) => {
          const key = r.entityNumber || r.documentNumber || r.entityName;
          if (key && !seenEntities.has(key)) {
            seenEntities.add(key);
            results.push(r);
          }
        });
      }
    });

    // Sort by confidence
    return results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }, [findings]);

  if (businessResults.length === 0) {
    return null;
  }

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('active')) return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (s.includes('inactive') || s.includes('dissolved')) return 'bg-red-500/10 text-red-600 border-red-500/20';
    if (s.includes('revoked')) return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    return 'bg-muted text-muted-foreground';
  };

  const getStateFlag = (state: string) => {
    const flags: Record<string, string> = {
      FL: '🌴',
      CA: '☀️',
      NY: '🗽',
      TX: '⭐',
    };
    return flags[state] || '🏢';
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (!confidence) return null;
    const pct = Math.round(confidence * 100);
    const color = pct >= 80 ? 'bg-green-500/10 text-green-600' : 
                  pct >= 60 ? 'bg-yellow-500/10 text-yellow-600' : 
                  'bg-muted text-muted-foreground';
    return (
      <Badge variant="outline" className={`${color} text-xs`}>
        {pct}% match
      </Badge>
    );
  };

  const handleExportCSV = () => {
    try {
      exportBusinessRegistryToCSV(businessResults, targetName);
      toast.success(`Exported ${businessResults.length} business records to CSV`);
    } catch (error) {
      toast.error('Failed to export CSV');
      console.error('CSV export error:', error);
    }
  };

  const handleExportPDF = () => {
    try {
      exportBusinessRegistryToPDF(businessResults, targetName);
      toast.success(`Exported ${businessResults.length} business records to PDF`);
    } catch (error) {
      toast.error('Failed to export PDF');
      console.error('PDF export error:', error);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity flex-1">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Business Affiliations
                    <Badge variant="secondary" className="ml-1">
                      {businessResults.length} found
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    State business registry records
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {businessResults.some(r => r.detailUrl?.includes('sunbiz.org')) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8"
                  onClick={() => setVerificationModalOpen(true)}
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                  Verify
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCSV}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <FileText className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {businessResults.map((business, idx) => (
              <div 
                key={business.entityNumber || idx}
                className="p-4 rounded-lg bg-background/50 border border-border/50 space-y-3"
              >
                {/* Header with entity name and status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{getStateFlag(business.state || '')}</span>
                      <h4 className="font-semibold text-sm truncate">
                        {business.entityName}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className={getStatusColor(business.status)}>
                        {business.status || 'Unknown'}
                      </Badge>
                      {business.entityType && (
                        <Badge variant="outline" className="text-xs">
                          {business.entityType}
                        </Badge>
                      )}
                      {business.jurisdiction && (
                        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">
                          {business.jurisdiction}
                        </Badge>
                      )}
                      {getConfidenceBadge(business.confidence)}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => window.open(business.detailUrl, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                </div>

                {/* Entity details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {/* Entity Number */}
                  {business.entityNumber && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        <span className="text-foreground font-medium">
                          {business.entityNumber}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Formation/Filing Date */}
                  {(business.formationDate || business.dateField) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Filed: {business.formationDate || business.dateField}
                      </span>
                    </div>
                  )}

                  {/* Principal Address */}
                  {(business.principalAddress || business.address) && (
                    <div className="flex items-start gap-2 text-muted-foreground col-span-full">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span 
                        className="truncate hover:text-primary cursor-pointer"
                        onClick={() => onPivot?.('address', business.principalAddress || business.address || '')}
                      >
                        {business.principalAddress || business.address}
                      </span>
                    </div>
                  )}

                  {/* Registered Agent */}
                  {(business.registeredAgent || business.agent) && (
                    <div className="flex items-center gap-2 text-muted-foreground col-span-full">
                      <Shield className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        <span className="text-xs">Registered Agent:</span>{' '}
                        <span 
                          className="text-foreground hover:text-primary cursor-pointer"
                          onClick={() => onPivot?.('name', business.registeredAgent || business.agent || '')}
                        >
                          {business.registeredAgent || business.agent}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Officers */}
                {business.officers && business.officers.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Users className="h-3.5 w-3.5" />
                      <span>Officers & Directors</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {business.officers.map((officer, i) => (
                        <Badge 
                          key={i}
                          variant="secondary"
                          className="cursor-pointer hover:bg-primary/20 transition-colors"
                          onClick={() => onPivot?.('name', officer.name)}
                        >
                          <User className="h-3 w-3 mr-1" />
                          {officer.name}
                          {officer.title && (
                            <span className="ml-1 text-muted-foreground">
                              ({officer.title})
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Match type indicator */}
                {business.matchType && (
                  <div className="text-xs text-muted-foreground pt-1">
                    Found via: {business.matchType === 'officer' ? 'Officer/Agent Search' : 
                               business.matchType === 'address' ? 'Address Search' : 
                               business.matchType === 'name' ? 'Name Search' : business.matchType}
                  </div>
                )}
              </div>
            ))}

            {/* Manual search links */}
            <div className="pt-2 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => window.open('https://search.sunbiz.org/Inquiry/CorporationSearch/ByName', '_blank')}
              >
                Search Florida (Sunbiz)
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => window.open('https://bizfileonline.sos.ca.gov/search/business', '_blank')}
              >
                Search California
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => window.open('https://appext20.dos.ny.gov/corp_public/corpsearch.entity_search_entry', '_blank')}
              >
                Search New York
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => window.open('https://direct.sos.state.tx.us/corp_search/', '_blank')}
              >
                Search Texas
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <SunbizVerificationModal
        open={verificationModalOpen}
        onOpenChange={setVerificationModalOpen}
        results={businessResults}
        targetName={targetName}
        investigationId={investigationId}
        onVerify={(entityNumber, verified) => {
          // Toast is now handled inside the modal
        }}
      />
    </Card>
  );
};

export default BusinessRegistryCard;
