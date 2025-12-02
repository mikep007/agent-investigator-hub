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
  const panoramaRef = useRef<HTMLDivElement>(null);
  // Default to interactive 360° view since Static API may not be enabled
  const [isInteractive, setIsInteractive] = useState(true);
  const [panoramaInstance, setPanoramaInstance] = useState<google.maps.StreetViewPanorama | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [staticError, setStaticError] = useState(false);

  const loadGoogleMapsScript = () => {
    if (window.google && window.google.maps) {
      setScriptLoaded(true);
      return;
    }

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

  const initializePanorama = () => {
    if (!panoramaRef.current || !window.google || !window.google.maps) return;

    setLoading(true);
    setError(false);

    try {
      const panorama = new google.maps.StreetViewPanorama(panoramaRef.current, {
        position: { lat: latitude, lng: longitude },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: true,
        linksControl: true,
        panControl: true,
        enableCloseButton: false,
        zoomControl: true,
        fullscreenControl: true,
      });

      // Check if Street View is available at this location
      const streetViewService = new google.maps.StreetViewService();
      streetViewService.getPanorama(
        { location: { lat: latitude, lng: longitude }, radius: 50 },
        (data, status) => {
          if (status === google.maps.StreetViewStatus.OK) {
            setPanoramaInstance(panorama);
            setLoading(false);
          } else {
            setError(true);
            setLoading(false);
            console.error("Street View not available at this location");
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
    if (!scriptLoaded) {
      loadGoogleMapsScript();
    }
  }, []);

  useEffect(() => {
    if (isInteractive && scriptLoaded && !panoramaInstance) {
      initializePanorama();
    }
  }, [isInteractive, scriptLoaded]);

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
            <p className="text-sm text-muted-foreground mb-2">Street View not available</p>
            <p className="text-xs text-muted-foreground mb-3">API key may need domain authorization in Google Cloud Console</p>
            <div className="flex gap-2 justify-center">
              <a
                href={`https://www.google.com/maps/@${latitude},${longitude},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s!2e0!7i16384!8i8192`}
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
