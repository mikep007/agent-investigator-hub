import { MapPin, CheckCircle2, AlertCircle, Shield, Database } from "lucide-react";
import { Badge } from "./ui/badge";
import StreetViewPanorama from "./StreetViewPanorama";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface AddressResultsProps {
  data: any;
  confidenceScore?: number;
}

const getVerificationStatus = (data: any) => {
  const sources = [];
  if (data.geocodingSource?.toLowerCase().includes('google')) sources.push('Google');
  if (data.geocodingSource?.toLowerCase().includes('nominatim')) sources.push('Nominatim');
  if (data.geocodingSource?.toLowerCase().includes('osm')) sources.push('OpenStreetMap');
  
  // Determine verification level
  if (sources.length >= 2) return { level: 'verified', sources, color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Multi-Source Verified' };
  if (sources.length === 1) return { level: 'single', sources, color: 'text-amber-500', bgColor: 'bg-amber-500/10', label: 'Single Source' };
  return { level: 'unverified', sources: ['Unknown'], color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Unverified' };
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
          ) : verification.level === 'single' ? (
            <Shield className={`h-5 w-5 ${verification.color}`} />
          ) : (
            <AlertCircle className={`h-5 w-5 ${verification.color}`} />
          )}
          <div>
            <p className={`text-sm font-medium ${verification.color}`}>{verification.label}</p>
            <p className="text-xs text-muted-foreground">
              Sources: {verification.sources.join(', ')}
            </p>
          </div>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-xs">
                <Database className="h-3 w-3 mr-1" />
                {verification.sources.length} source{verification.sources.length !== 1 ? 's' : ''}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Address validated via {verification.sources.join(' and ')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
        <div key={idx} className="border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-foreground mb-1">
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
            <div className="text-sm space-y-1 text-muted-foreground">
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

          <div className="flex gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
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
    </div>
  );
};

export default AddressResults;
