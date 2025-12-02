import { MapPin, CheckCircle2, AlertCircle, Shield, Database, Layers } from "lucide-react";
import { Badge } from "./ui/badge";
import StreetViewPanorama from "./StreetViewPanorama";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import AddressHistory from "./AddressHistory";

interface AddressResultsProps {
  data: any;
  confidenceScore?: number;
}

interface VerificationDisplay {
  level: string;
  sources: string[];
  color: string;
  bgColor: string;
  label: string;
  message: string;
  confidence: number;
  distance?: number;
}

const getVerificationStatus = (data: any): VerificationDisplay => {
  // Use the new verification object from dual-source geocoding
  const verification = data.verification;
  
  if (verification) {
    const statusMap: Record<string, { color: string; bgColor: string; label: string }> = {
      'verified': { color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Multi-Source Verified' },
      'partial': { color: 'text-amber-500', bgColor: 'bg-amber-500/10', label: 'Partial Match' },
      'discrepancy': { color: 'text-orange-500', bgColor: 'bg-orange-500/10', label: 'Sources Disagree' },
      'single_source': { color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Single Source' },
      'unverified': { color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Unverified' },
      'error': { color: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Error' }
    };
    
    const display = statusMap[verification.status] || statusMap['unverified'];
    
    return {
      level: verification.status,
      sources: verification.sources || [],
      color: display.color,
      bgColor: display.bgColor,
      label: display.label,
      message: verification.message || '',
      confidence: verification.confidence || 0,
      distance: verification.distance
    };
  }
  
  // Fallback for legacy data format
  const sources: string[] = [];
  if (data.geocodingSource?.toLowerCase().includes('google')) sources.push('Google');
  if (data.geocodingSource?.toLowerCase().includes('nominatim')) sources.push('Nominatim');
  
  if (sources.length >= 2) return { level: 'verified', sources, color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Multi-Source Verified', message: '', confidence: 0.9 };
  if (sources.length === 1) return { level: 'single', sources, color: 'text-amber-500', bgColor: 'bg-amber-500/10', label: 'Single Source', message: '', confidence: 0.6 };
  return { level: 'unverified', sources: ['Unknown'], color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Unverified', message: '', confidence: 0 };
};

const AddressResults = ({ data, confidenceScore }: AddressResultsProps) => {
  if (!data || !data.found) {
    return (
      <div className="text-muted-foreground text-sm">
        No address information found
      </div>
    );
  }

  const verification = getVerificationStatus(data);

  return (
    <div className="space-y-4">
      {/* Verification Status Banner */}
      <div className={`flex items-center justify-between p-3 rounded-lg border ${verification.bgColor} border-border`}>
        <div className="flex items-center gap-3">
          {verification.level === 'verified' ? (
            <CheckCircle2 className={`h-5 w-5 ${verification.color}`} />
          ) : verification.level === 'partial' ? (
            <Layers className={`h-5 w-5 ${verification.color}`} />
          ) : verification.level === 'discrepancy' ? (
            <AlertCircle className={`h-5 w-5 ${verification.color}`} />
          ) : verification.level === 'single_source' ? (
            <Shield className={`h-5 w-5 ${verification.color}`} />
          ) : (
            <AlertCircle className={`h-5 w-5 ${verification.color}`} />
          )}
          <div>
            <p className={`text-sm font-medium ${verification.color}`}>{verification.label}</p>
            <p className="text-xs text-muted-foreground">
              {verification.message || `Sources: ${verification.sources.join(', ')}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {verification.confidence > 0 && (
            <Badge variant="secondary" className="text-xs">
              {Math.round(verification.confidence * 100)}% confidence
            </Badge>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs">
                  <Database className="h-3 w-3 mr-1" />
                  {verification.sources.length} source{verification.sources.length !== 1 ? 's' : ''}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="space-y-1">
                  <p className="text-xs font-medium">Geocoding Sources:</p>
                  {verification.sources.map((src, i) => (
                    <p key={i} className="text-xs">• {src}</p>
                  ))}
                  {verification.distance !== undefined && (
                    <p className="text-xs mt-2 text-muted-foreground">
                      Source variance: {verification.distance.toFixed(0)}m
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Interactive Street View */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Street View
        </h4>
        {data.locations?.[0] && (
          <StreetViewPanorama
            latitude={data.locations[0].latitude}
            longitude={data.locations[0].longitude}
            staticImageUrl={data.streetViewUrl}
          />
        )}
      </div>

      {/* Location Details */}
      {data.locations?.map((location: any, idx: number) => (
        <div key={idx} className="border border-border rounded-lg p-4 space-y-2 overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground mb-1 break-words">
                {location.displayName}
              </h4>
              {confidenceScore !== undefined && (
                <Badge variant="outline" className="text-xs">
                  Confidence: {confidenceScore}%
                </Badge>
              )}
            </div>
          </div>

          {location.address && (
            <div className="text-sm space-y-1 text-muted-foreground break-words">
              {location.address.houseNumber && location.address.road && (
                <div>{location.address.houseNumber} {location.address.road}</div>
              )}
              {!location.address.houseNumber && location.address.road && (
                <div>{location.address.road}</div>
              )}
              <div>
                {location.address.city && `${location.address.city}, `}
                {location.address.state && `${location.address.state} `}
                {location.address.postcode}
              </div>
              {location.address.country && (
                <div>{location.address.country}</div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
            <span>Lat: {location.latitude.toFixed(6)}</span>
            <span>•</span>
            <span>Lon: {location.longitude.toFixed(6)}</span>
          </div>

          <div className="flex gap-2 pt-2">
            <a
              href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              View on Google Maps
            </a>
          </div>
        </div>
      ))}

      {/* Address History & Property Records */}
      <div className="mt-6 pt-4 border-t border-border">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          Property History & Records
        </h4>
        <AddressHistory
          residents={data.residents}
          propertyRecords={data.propertyRecords}
          manualVerificationLinks={data.propertyLinks}
        />
      </div>
    </div>
  );
};

export default AddressResults;
