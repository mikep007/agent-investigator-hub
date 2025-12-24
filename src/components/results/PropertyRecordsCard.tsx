import { Building, Home, DollarSign, Calendar, ExternalLink, User, FileText, MapPin, Download, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface PropertyRecord {
  type: string;
  source: string;
  url: string;
  title: string;
  snippet: string;
  ownerName?: string;
  propertyValue?: string;
  saleDate?: string;
  salePrice?: string;
  propertyType?: string;
  yearBuilt?: string;
  squareFeet?: string;
  bedrooms?: number;
  bathrooms?: number;
  confidence: number;
}

interface PropertyRecordsData {
  address: string;
  found: boolean;
  ownershipRecords: PropertyRecord[];
  taxRecords: PropertyRecord[];
  salesHistory: PropertyRecord[];
  propertyDetails: PropertyRecord[];
  assessorRecords: PropertyRecord[];
  relatedNames: string[];
}

interface PropertyRecordsCardProps {
  data: PropertyRecordsData;
  targetName?: string;
}

const getRecordTypeIcon = (type: string) => {
  switch (type) {
    case 'zillow_listing':
    case 'realtor_listing':
    case 'redfin_listing':
      return <Home className="h-4 w-4" />;
    case 'tax_record':
      return <DollarSign className="h-4 w-4" />;
    case 'deed_record':
    case 'legal_record':
      return <FileText className="h-4 w-4" />;
    case 'assessor_record':
      return <Building className="h-4 w-4" />;
    default:
      return <MapPin className="h-4 w-4" />;
  }
};

const getRecordTypeBadge = (type: string) => {
  const typeMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    'zillow_listing': { label: 'Zillow', variant: 'default' },
    'realtor_listing': { label: 'Realtor', variant: 'default' },
    'redfin_listing': { label: 'Redfin', variant: 'default' },
    'tax_record': { label: 'Tax Record', variant: 'secondary' },
    'deed_record': { label: 'Deed', variant: 'secondary' },
    'legal_record': { label: 'Legal', variant: 'outline' },
    'assessor_record': { label: 'Assessor', variant: 'secondary' },
    'ownership_info': { label: 'Ownership', variant: 'outline' },
    'resident_lookup': { label: 'Resident', variant: 'outline' },
  };
  
  return typeMap[type] || { label: type.replace(/_/g, ' '), variant: 'outline' as const };
};

const PropertyRecordItem = ({ record }: { record: PropertyRecord }) => {
  const typeInfo = getRecordTypeBadge(record.type);
  
  return (
    <div className="p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getRecordTypeIcon(record.type)}
          <a 
            href={record.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-medium text-sm text-foreground hover:text-primary truncate"
          >
            {record.title}
          </a>
        </div>
        <Badge variant={typeInfo.variant} className="text-xs shrink-0">
          {typeInfo.label}
        </Badge>
      </div>
      
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
        {record.snippet}
      </p>
      
      <div className="flex flex-wrap gap-2 text-xs">
        {record.propertyValue && (
          <Badge variant="outline" className="gap-1">
            <DollarSign className="h-3 w-3" />
            {record.propertyValue}
          </Badge>
        )}
        {record.saleDate && (
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            {record.saleDate}
          </Badge>
        )}
        {record.yearBuilt && (
          <Badge variant="outline" className="gap-1">
            Built {record.yearBuilt}
          </Badge>
        )}
        {record.bedrooms && (
          <Badge variant="outline">
            {record.bedrooms} bed
          </Badge>
        )}
        {record.bathrooms && (
          <Badge variant="outline">
            {record.bathrooms} bath
          </Badge>
        )}
        {record.squareFeet && (
          <Badge variant="outline">
            {parseInt(record.squareFeet).toLocaleString()} sqft
          </Badge>
        )}
      </div>
      
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
        <span className="text-xs text-muted-foreground">{record.source}</span>
        <a 
          href={record.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
};

const PropertyRecordsCard = ({ data, targetName }: PropertyRecordsCardProps) => {
  const { toast } = useToast();
  
  if (!data || !data.found) {
    return null;
  }
  
  const totalRecords = 
    (data.ownershipRecords?.length || 0) + 
    (data.taxRecords?.length || 0) + 
    (data.salesHistory?.length || 0) + 
    (data.propertyDetails?.length || 0) +
    (data.assessorRecords?.length || 0);
  
  if (totalRecords === 0) {
    return null;
  }

  const exportToCSV = () => {
    try {
      const allRecords = [
        ...(data.ownershipRecords || []).map(r => ({ ...r, category: 'Ownership' })),
        ...(data.taxRecords || []).map(r => ({ ...r, category: 'Tax' })),
        ...(data.salesHistory || []).map(r => ({ ...r, category: 'Sales' })),
        ...(data.propertyDetails || []).map(r => ({ ...r, category: 'Property Details' })),
        ...(data.assessorRecords || []).map(r => ({ ...r, category: 'Assessor' })),
      ];

      const headers = ['Category', 'Type', 'Title', 'Source', 'URL', 'Value', 'Sale Date', 'Year Built', 'Bedrooms', 'Bathrooms', 'Square Feet'];
      const rows = allRecords.map(r => [
        r.category,
        r.type,
        `"${(r.title || '').replace(/"/g, '""')}"`,
        r.source,
        r.url,
        r.propertyValue || '',
        r.saleDate || '',
        r.yearBuilt || '',
        r.bedrooms?.toString() || '',
        r.bathrooms?.toString() || '',
        r.squareFeet || '',
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `property-records-${targetName || data.address || 'export'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({ title: "Exported", description: "Property records exported to CSV" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to export CSV", variant: "destructive" });
    }
  };
  
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            Property Records
            <Badge variant="secondary" className="ml-2">
              {totalRecords} records
            </Badge>
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportToCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {data.address && (
          <p className="text-sm text-muted-foreground mt-1">{data.address}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {/* Related Names */}
        {data.relatedNames && data.relatedNames.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Related Names Found</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {data.relatedNames.slice(0, 8).map((name, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))}
              {data.relatedNames.length > 8 && (
                <Badge variant="secondary" className="text-xs">
                  +{data.relatedNames.length - 8} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <Accordion type="multiple" defaultValue={['property-details', 'ownership']} className="w-full">
          {/* Property Details from Real Estate Sites */}
          {data.propertyDetails && data.propertyDetails.length > 0 && (
            <AccordionItem value="property-details">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  <span>Property Listings</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {data.propertyDetails.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  {data.propertyDetails.map((record, idx) => (
                    <PropertyRecordItem key={idx} record={record} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Ownership Records */}
          {data.ownershipRecords && data.ownershipRecords.length > 0 && (
            <AccordionItem value="ownership">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <span>Ownership & Residents</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {data.ownershipRecords.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  {data.ownershipRecords.map((record, idx) => (
                    <PropertyRecordItem key={idx} record={record} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Tax Records */}
          {data.taxRecords && data.taxRecords.length > 0 && (
            <AccordionItem value="tax">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span>Tax Records</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {data.taxRecords.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  {data.taxRecords.map((record, idx) => (
                    <PropertyRecordItem key={idx} record={record} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Sales History */}
          {data.salesHistory && data.salesHistory.length > 0 && (
            <AccordionItem value="sales">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>Sales History</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {data.salesHistory.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  {data.salesHistory.map((record, idx) => (
                    <PropertyRecordItem key={idx} record={record} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Assessor Records */}
          {data.assessorRecords && data.assessorRecords.length > 0 && (
            <AccordionItem value="assessor">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  <span>Assessor Records</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {data.assessorRecords.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  {data.assessorRecords.map((record, idx) => (
                    <PropertyRecordItem key={idx} record={record} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
};

export default PropertyRecordsCard;
