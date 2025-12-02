import { History, Users, Home, Calendar, ExternalLink, Building2, FileText } from "lucide-react";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";

interface Resident {
  name: string;
  relationship?: string;
  yearsAtAddress?: string;
  age?: number;
}

interface PropertyRecord {
  type: string;
  date?: string;
  value?: string;
  details?: string;
  source?: string;
  url?: string;
}

interface AddressHistoryProps {
  residents?: Resident[];
  propertyRecords?: PropertyRecord[];
  manualVerificationLinks?: { name: string; url: string; icon?: string }[];
  loading?: boolean;
}

const AddressHistory = ({ residents, propertyRecords, manualVerificationLinks, loading }: AddressHistoryProps) => {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 bg-muted animate-pulse rounded-lg" />
        <div className="h-20 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  const hasData = (residents && residents.length > 0) || (propertyRecords && propertyRecords.length > 0);

  return (
    <div className="space-y-4">
      {/* Previous Residents Section */}
      {residents && residents.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Previous Residents
              <Badge variant="secondary" className="ml-auto text-xs">
                {residents.length} found
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {residents.map((resident, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {resident.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{resident.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {resident.relationship && <span>{resident.relationship}</span>}
                        {resident.age && <span>• Age {resident.age}</span>}
                      </div>
                    </div>
                  </div>
                  {resident.yearsAtAddress && (
                    <Badge variant="outline" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {resident.yearsAtAddress}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Property Records Section */}
      {propertyRecords && propertyRecords.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Property Records
              <Badge variant="secondary" className="ml-auto text-xs">
                {propertyRecords.length} records
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Accordion type="single" collapsible className="w-full">
              {propertyRecords.map((record, idx) => (
                <AccordionItem key={idx} value={`record-${idx}`} className="border-border/50">
                  <AccordionTrigger className="py-2 text-sm hover:no-underline">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{record.type}</span>
                      {record.date && (
                        <Badge variant="outline" className="text-xs ml-2">
                          {record.date}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="space-y-2 text-sm">
                      {record.value && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Value:</span>
                          <span className="font-medium text-foreground">{record.value}</span>
                        </div>
                      )}
                      {record.details && (
                        <p className="text-muted-foreground">{record.details}</p>
                      )}
                      {record.url && (
                        <a
                          href={record.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View Source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Manual Verification Links */}
      {manualVerificationLinks && manualVerificationLinks.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Property & Resident Lookup Sources
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2">
              {manualVerificationLinks.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border/50 hover:bg-muted transition-colors text-sm"
                >
                  <Home className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground truncate">{link.name}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {!hasData && (!manualVerificationLinks || manualVerificationLinks.length === 0) && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No property history data available</p>
          <p className="text-xs mt-1">Try the verification links below to search manually</p>
        </div>
      )}
    </div>
  );
};

export default AddressHistory;
