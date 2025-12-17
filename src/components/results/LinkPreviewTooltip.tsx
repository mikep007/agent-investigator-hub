import React, { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Globe, ExternalLink, MapPin, Mail, Phone, Shield } from 'lucide-react';

interface LinkPreviewTooltipProps {
  url: string;
  title: string;
  snippet?: string;
  confidence?: number;
  hasLocation?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  children: React.ReactNode;
}

const LinkPreviewTooltip: React.FC<LinkPreviewTooltipProps> = ({
  url,
  title,
  snippet,
  confidence,
  hasLocation,
  hasEmail,
  hasPhone,
  children,
}) => {
  const [imageError, setImageError] = useState(false);
  
  // Extract domain for favicon
  const getDomain = (urlString: string) => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname;
    } catch {
      return '';
    }
  };

  const domain = getDomain(url);
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
  
  // Generate a screenshot preview URL using a free service
  const screenshotUrl = `https://image.thum.io/get/width/300/crop/200/${encodeURIComponent(url)}`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent 
          side="right" 
          align="start"
          className="w-80 p-0 bg-popover border border-border shadow-xl rounded-lg overflow-hidden"
        >
          {/* Screenshot Preview */}
          <div className="relative w-full h-36 bg-muted">
            {!imageError ? (
              <img
                src={screenshotUrl}
                alt="Page preview"
                className="w-full h-full object-cover object-top"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Globe className="h-12 w-12 text-muted-foreground/50" />
              </div>
            )}
            {/* Confidence Badge Overlay */}
            {confidence !== undefined && (
              <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
                <Shield className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">{Math.round(confidence * 100)}%</span>
              </div>
            )}
          </div>
          
          {/* Content */}
          <div className="p-3 space-y-2">
            {/* Domain & Favicon */}
            <div className="flex items-center gap-2">
              {faviconUrl && (
                <img 
                  src={faviconUrl} 
                  alt="" 
                  className="w-4 h-4"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
              <span className="text-xs text-muted-foreground truncate">{domain}</span>
            </div>
            
            {/* Title */}
            <h4 className="font-medium text-sm line-clamp-2 text-foreground">{title}</h4>
            
            {/* Snippet */}
            {snippet && (
              <p className="text-xs text-muted-foreground line-clamp-3">{snippet}</p>
            )}
            
            {/* Match Indicators */}
            {(hasLocation || hasEmail || hasPhone) && (
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                {hasLocation && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <MapPin className="h-3 w-3" />
                    <span>Location</span>
                  </div>
                )}
                {hasEmail && (
                  <div className="flex items-center gap-1 text-xs text-blue-600">
                    <Mail className="h-3 w-3" />
                    <span>Email</span>
                  </div>
                )}
                {hasPhone && (
                  <div className="flex items-center gap-1 text-xs text-purple-600">
                    <Phone className="h-3 w-3" />
                    <span>Phone</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Action Hint */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
              <ExternalLink className="h-3 w-3" />
              <span>Click to visit page</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default LinkPreviewTooltip;
