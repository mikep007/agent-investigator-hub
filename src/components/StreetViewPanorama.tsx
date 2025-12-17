import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Maximize2, Image as ImageIcon } from "lucide-react";

interface StreetViewPanoramaProps {
  latitude: number;
  longitude: number;
  staticImageUrl?: string;
}

// Declare global google object for TypeScript
declare global {
  interface Window {
    google: typeof google;
    initStreetView: () => void;
  }
}

const StreetViewPanorama = ({ latitude, longitude, staticImageUrl }: StreetViewPanoramaProps) => {
  // Validate coordinates
  const hasValidCoords = typeof latitude === 'number' && 
                         typeof longitude === 'number' && 
                         !isNaN(latitude) && 
                         !isNaN(longitude) &&
                         latitude >= -90 && latitude <= 90 &&
                         longitude >= -180 && longitude <= 180;
  
  console.log("StreetViewPanorama rendered with:", { latitude, longitude, staticImageUrl, hasValidCoords });
  
  const panoramaRef = useRef<HTMLDivElement>(null);
  // Default to interactive 360° view since Static API may not be enabled
  const [isInteractive, setIsInteractive] = useState(true);
  const [panoramaInstance, setPanoramaInstance] = useState<google.maps.StreetViewPanorama | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true
  const [error, setError] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [staticError, setStaticError] = useState(false);

  // If coordinates are invalid, show error state immediately
  if (!hasValidCoords) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
        <p>Invalid or missing coordinates for Street View.</p>
        <p className="text-xs mt-1">Lat: {latitude}, Lon: {longitude}</p>
      </div>
    );
  }

  const loadGoogleMapsScript = () => {
    // Check if Google Maps is already loaded (from index.html)
    if (window.google && window.google.maps) {
      console.log("Google Maps already loaded, using existing instance");
      setScriptLoaded(true);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      console.log("Google Maps script found, waiting for load...");
      // Wait for the existing script to load
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(checkLoaded);
          setScriptLoaded(true);
        }
      }, 100);
      // Timeout after 10 seconds
      setTimeout(() => clearInterval(checkLoaded), 10000);
      return;
    }

    // Only load if not already present
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyAbmCozXMINQ_7Z6avw9dfjbRXOkhcAOIs`;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      setError(true);
    };
    document.head.appendChild(script);
  };

  // Calculate heading from panorama location to target address
  const calculateHeading = (fromLat: number, fromLng: number, toLat: number, toLng: number): number => {
    const dLng = (toLng - fromLng) * Math.PI / 180;
    const fromLatRad = fromLat * Math.PI / 180;
    const toLatRad = toLat * Math.PI / 180;
    
    const x = Math.sin(dLng) * Math.cos(toLatRad);
    const y = Math.cos(fromLatRad) * Math.sin(toLatRad) - 
              Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLng);
    
    let heading = Math.atan2(x, y) * 180 / Math.PI;
    return (heading + 360) % 360; // Normalize to 0-360
  };

  // Calculate distance between two points in meters
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const initializePanorama = () => {
    console.log("initializePanorama called", { 
      hasRef: !!panoramaRef.current, 
      hasGoogle: !!(window.google && window.google.maps),
      latitude,
      longitude
    });
    
    if (!panoramaRef.current || !window.google || !window.google.maps) {
      console.log("Missing requirements for panorama initialization");
      return;
    }

    setLoading(true);
    setError(false);

    try {
      console.log("Creating StreetViewPanorama at", latitude, longitude);
      
      // Check if Street View is available at this location with a small radius first
      const streetViewService = new google.maps.StreetViewService();
      
      // Try with smaller radius first (50m) for more accurate match
      streetViewService.getPanorama(
        { location: { lat: latitude, lng: longitude }, radius: 50 },
        (data, status) => {
          console.log("StreetViewService response (50m radius):", status);
          
          if (status === google.maps.StreetViewStatus.OK && data?.location?.latLng) {
            const panoramaLat = data.location.latLng.lat();
            const panoramaLng = data.location.latLng.lng();
            const distance = calculateDistance(latitude, longitude, panoramaLat, panoramaLng);
            
            console.log("Panorama found at distance:", distance.toFixed(0), "m from target");
            console.log("Panorama location:", panoramaLat, panoramaLng);
            console.log("Target location:", latitude, longitude);
            
            // Calculate heading to face the target address
            const heading = calculateHeading(panoramaLat, panoramaLng, latitude, longitude);
            console.log("Calculated heading to target:", heading);
            
            const panorama = new google.maps.StreetViewPanorama(panoramaRef.current!, {
              pano: data.location.pano,
              pov: { 
                heading: heading, // Face toward the target address
                pitch: 0 
              },
              zoom: 1,
              addressControl: true,
              linksControl: true,
              panControl: true,
              enableCloseButton: false,
              zoomControl: true,
              fullscreenControl: true,
            });
            
            setPanoramaInstance(panorama);
            setLoading(false);
          } else {
            // Try with larger radius as fallback
            console.log("No panorama at 50m, trying 100m radius...");
            streetViewService.getPanorama(
              { location: { lat: latitude, lng: longitude }, radius: 100 },
              (data2, status2) => {
                if (status2 === google.maps.StreetViewStatus.OK && data2?.location?.latLng) {
                  const panoramaLat = data2.location.latLng.lat();
                  const panoramaLng = data2.location.latLng.lng();
                  const distance = calculateDistance(latitude, longitude, panoramaLat, panoramaLng);
                  
                  console.log("Panorama found at distance (100m):", distance.toFixed(0), "m from target");
                  
                  // Calculate heading to face the target address
                  const heading = calculateHeading(panoramaLat, panoramaLng, latitude, longitude);
                  
                  const panorama = new google.maps.StreetViewPanorama(panoramaRef.current!, {
                    pano: data2.location.pano,
                    pov: { 
                      heading: heading,
                      pitch: 0 
                    },
                    zoom: 1,
                    addressControl: true,
                    linksControl: true,
                    panControl: true,
                    enableCloseButton: false,
                    zoomControl: true,
                    fullscreenControl: true,
                  });
                  
                  setPanoramaInstance(panorama);
                  setLoading(false);
                } else {
                  console.error("Street View not available within 100m of this location:", status2);
                  setError(true);
                  setLoading(false);
                }
              }
            );
          }
        }
      );
    } catch (err) {
      console.error("Error loading Street View:", err);
      setError(true);
      setLoading(false);
    }
  };

  // Load script immediately since we default to interactive
  useEffect(() => {
    // Check if already loaded
    if (window.google && window.google.maps) {
      console.log("Google Maps already available on mount");
      setScriptLoaded(true);
      return;
    }
    
    if (!scriptLoaded) {
      loadGoogleMapsScript();
    }
  }, []);

  useEffect(() => {
    console.log("Street View useEffect triggered:", { isInteractive, scriptLoaded, hasPanorama: !!panoramaInstance, latitude, longitude });
    if (isInteractive && scriptLoaded && latitude && longitude) {
      initializePanorama();
    }
  }, [isInteractive, scriptLoaded, latitude, longitude]);

  const toggleView = () => {
    setIsInteractive(!isInteractive);
  };

  if (!isInteractive) {
    return (
      <div className="relative">
        {staticImageUrl && !staticError ? (
          <>
            <img
              src={staticImageUrl}
              alt="Street View of investigated address"
              className="w-full rounded-lg border border-border shadow-md"
              loading="lazy"
              onError={() => {
                setStaticError(true);
                // Auto-switch to 360° view on static image error
                setIsInteractive(true);
              }}
            />
            <Button
              onClick={toggleView}
              size="sm"
              className="absolute bottom-3 right-3 gap-2"
              variant="secondary"
            >
              <Maximize2 className="h-4 w-4" />
              360° View
            </Button>
          </>
        ) : (
          <div className="p-4 rounded-lg border border-border bg-muted text-sm text-muted-foreground flex items-center justify-between">
            <span>Static image not available.</span>
            <Button onClick={toggleView} size="sm" variant="outline" className="ml-2">
              <Maximize2 className="h-4 w-4 mr-2" />
              Try 360° View
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={panoramaRef}
        className="w-full h-[400px] rounded-lg border border-border shadow-md"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-lg">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading 360° view...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-lg">
          <div className="text-center p-4">
            <p className="text-sm text-muted-foreground mb-2">Street View not available for this location</p>
            <p className="text-xs text-muted-foreground mb-3">Google doesn't have Street View imagery at this address</p>
            <div className="flex gap-2 justify-center">
              <a
                href={`https://www.google.com/maps/@${latitude},${longitude},17z`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                <Maximize2 className="h-4 w-4" />
                View on Google Maps
              </a>
            </div>
          </div>
        </div>
      )}
      {!loading && !error && (
        <Button
          onClick={toggleView}
          size="sm"
          className="absolute bottom-3 right-3 gap-2"
          variant="secondary"
        >
          <ImageIcon className="h-4 w-4" />
          Static View
        </Button>
      )}
    </div>
  );
};

export default StreetViewPanorama;
