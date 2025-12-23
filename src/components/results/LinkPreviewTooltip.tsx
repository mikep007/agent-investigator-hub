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
  
  // Domains that block screenshot/embed services (X-Frame-Options: DENY or CSP restrictions)
  const blockedDomains = [
    // Meta platforms
    'facebook.com', 'fb.com', 'messenger.com',
    'instagram.com', 'threads.net',
    'whatsapp.com', 'wa.me',
    // Twitter/X
    'twitter.com', 'x.com', 't.co',
    // Microsoft/LinkedIn
    'linkedin.com',
    // TikTok/ByteDance
    'tiktok.com', 'douyin.com',
    // Reddit
    'reddit.com', 'redd.it',
    // Pinterest
    'pinterest.com', 'pin.it',
    // Snapchat
    'snapchat.com', 'snap.com',
    // Discord
    'discord.com', 'discord.gg', 'discordapp.com',
    // Telegram
    'telegram.org', 't.me', 'web.telegram.org',
    // YouTube/Google
    'youtube.com', 'youtu.be',
    // Other platforms with strict embedding policies
    'tumblr.com',
    'quora.com',
    'medium.com',
    'substack.com',
    'patreon.com',
    'onlyfans.com',
    'twitch.tv',
  ];
  
  // Extract domain for favicon
  const getDomain = (urlString: string) => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  };

  const domain = getDomain(url);
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
  
  // Check if domain blocks screenshots (normalize both sides for comparison)
  const isBlockedDomain = blockedDomains.some(blocked => {
    const normalizedBlocked = blocked.replace(/^www\./, '').toLowerCase();
    return domain === normalizedBlocked || domain.endsWith('.' + normalizedBlocked);
  });
  
  // Never attempt screenshots for blocked domains - they will fail with CORS/X-Frame-Options errors
  const screenshotUrl = isBlockedDomain ? null : `https://image.thum.io/get/width/300/crop/200/${encodeURIComponent(url)}`;

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
            {!imageError && screenshotUrl ? (
              <img
                src={screenshotUrl}
                alt="Page preview"
                className="w-full h-full object-cover object-top"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted gap-2">
                {faviconUrl ? (
                  <img 
                    src={faviconUrl} 
                    alt="" 
                    className="w-10 h-10"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                ) : (
                  <Globe className="h-12 w-12 text-muted-foreground/50" />
                )}
                {isBlockedDomain && (
                  <span className="text-xs text-muted-foreground">Preview blocked by site</span>
                )}
              </div>
            )}
            {/* Confidence Badge Overlay */}
            {confidence !== undefined && confidence > 0 && (
              <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
                <Shield className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">{Math.round(confidence <= 1 ? confidence * 100 : confidence)}%</span>
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
