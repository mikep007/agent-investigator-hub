import { MapPin } from "lucide-react";
import { Badge } from "./ui/badge";

interface AddressResultsProps {
  data: any;
  confidenceScore?: number;
}

const AddressResults = ({ data, confidenceScore }: AddressResultsProps) => {
  if (!data || !data.found) {
    return (
      <div className="text-muted-foreground text-sm">
        No address information found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Street View Photo */}
      {data.streetViewUrl && (
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Street View
          </h4>
          <img
            src={data.streetViewUrl}
            alt="Street View"
            className="w-full rounded-lg border border-border shadow-md"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

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
