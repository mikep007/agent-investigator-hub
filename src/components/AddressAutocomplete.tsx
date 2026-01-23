/// <reference types="google.maps" />
import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    google: typeof google;
  }
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

interface SelectedLocation {
  lat: number;
  lng: number;
  address: string;
}

const AddressAutocomplete = ({
  value,
  onChange,
  onKeyDown,
  disabled,
  placeholder,
  maxLength
}: AddressAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load Google Maps if not already loaded
    const initGoogleServices = () => {
      if (window.google && window.google.maps && window.google.maps.places) {
        autocompleteService.current = new google.maps.places.AutocompleteService();
        const dummyDiv = document.createElement('div');
        placesService.current = new google.maps.places.PlacesService(dummyDiv);
      }
    };

    if (window.google && window.google.maps) {
      initGoogleServices();
      return;
    }

    // Check if script is already loading
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(checkLoaded);
          initGoogleServices();
        }
      }, 100);
      setTimeout(() => clearInterval(checkLoaded), 10000);
      return;
    }

    // Load the script dynamically
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("VITE_GOOGLE_MAPS_API_KEY not configured");
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = initGoogleServices;
    script.onerror = () => console.error("Failed to load Google Maps script");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    // Close suggestions when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear selected location when value is manually cleared
  useEffect(() => {
    if (!value.trim()) {
      setSelectedLocation(null);
      setMapUrl(null);
    }
  }, [value]);

  // Fetch static map URL from server when location is selected
  const fetchStaticMapUrl = useCallback(async (lat: number, lng: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('sign-maps-url', {
        body: { lat, lng, width: 200, height: 120, zoom: 15 }
      });
      if (error) {
        console.error('Error fetching static map:', error);
        return;
      }
      setMapUrl(data.signedUrl);
    } catch (err) {
      console.error('Error fetching static map:', err);
    }
  }, []);

  // Update map when location changes
  useEffect(() => {
    if (selectedLocation) {
      fetchStaticMapUrl(selectedLocation.lat, selectedLocation.lng);
    } else {
      setMapUrl(null);
    }
  }, [selectedLocation, fetchStaticMapUrl]);

  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);
    setSelectedLocation(null); // Clear map when typing

    if (!inputValue.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Fetch suggestions from Google Places API
    if (autocompleteService.current) {
      autocompleteService.current.getPlacePredictions(
        {
          input: inputValue,
          types: ['address']
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSuggestions(predictions);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        }
      );
    }
  };

  const handleSuggestionClick = (suggestion: google.maps.places.AutocompletePrediction) => {
    onChange(suggestion.description);
    setSuggestions([]);
    setShowSuggestions(false);

    // Get place details to get coordinates
    if (placesService.current) {
      placesService.current.getDetails(
        {
          placeId: suggestion.place_id,
          fields: ['geometry', 'formatted_address']
        },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
            setSelectedLocation({
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              address: place.formatted_address || suggestion.description
            });
          }
        }
      );
    }
  };

  const clearLocation = () => {
    onChange("");
    setSelectedLocation(null);
    setMapUrl(null);
    setSuggestions([]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Input
            id="address"
            placeholder={placeholder || "Start typing an address..."}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="bg-background/50"
            maxLength={maxLength}
            disabled={disabled}
          />
          {value && (
            <button
              type="button"
              onClick={clearLocation}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Map Preview Thumbnail */}
        {selectedLocation && mapUrl && (
          <div className="relative w-[100px] h-[60px] rounded-md overflow-hidden border border-border shrink-0">
            <img
              src={mapUrl}
              alt="Location preview"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
          </div>
        )}

        {/* Loading state when location selected but no map yet */}
        {selectedLocation && !mapUrl && (
          <div className="w-[100px] h-[60px] rounded-md border border-border flex items-center justify-center bg-muted/30 shrink-0">
            <MapPin className="w-4 h-4 text-muted-foreground animate-pulse" />
          </div>
        )}

        {/* Placeholder when no location selected */}
        {!selectedLocation && value && (
          <div className="w-[100px] h-[60px] rounded-md border border-dashed border-border/50 flex items-center justify-center bg-muted/30 shrink-0">
            <MapPin className="w-4 h-4 text-muted-foreground/50" />
          </div>
        )}
      </div>
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3 border-b border-border/50 last:border-0"
            >
              <MapPin className="w-4 h-4 mt-1 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {suggestion.structured_formatting.main_text}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {suggestion.structured_formatting.secondary_text}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
