import { 
  Twitter, Facebook, Instagram, Linkedin, Github, 
  Mail, Globe, MessageCircle, Video, Phone,
  ShoppingBag, MapPin, Music, Camera, Briefcase,
  Users, Link as LinkIcon, Gamepad2, BookOpen,
  Wallet, CreditCard, Heart, Star
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlatformLogoProps {
  platform: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showFallbackIcon?: boolean;
}

// Platform brand colors for background styling
const platformColors: Record<string, string> = {
  twitter: "bg-sky-500",
  facebook: "bg-blue-600",
  instagram: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400",
  linkedin: "bg-blue-700",
  github: "bg-gray-900 dark:bg-gray-700",
  snapchat: "bg-yellow-400",
  tiktok: "bg-black",
  reddit: "bg-orange-600",
  discord: "bg-indigo-500",
  spotify: "bg-green-500",
  youtube: "bg-red-600",
  twitch: "bg-purple-600",
  pinterest: "bg-red-600",
  tumblr: "bg-blue-900",
  whatsapp: "bg-green-500",
  telegram: "bg-sky-500",
  soundcloud: "bg-orange-500",
  mixcloud: "bg-blue-400",
  lastfm: "bg-red-600",
  quizlet: "bg-blue-500",
  venmo: "bg-blue-500",
  onlyfans: "bg-sky-400",
  roblox: "bg-red-500",
  chess: "bg-green-700",
  adobe: "bg-red-600",
  apple: "bg-gray-900",
  mastodon: "bg-purple-600",
  wordpress: "bg-blue-600",
  blogger: "bg-orange-500",
  bandlab: "bg-red-500",
  poshmark: "bg-pink-500",
  codecanyon: "bg-green-600",
  fiverr: "bg-green-500",
  gog: "bg-purple-700",
  untappd: "bg-yellow-600",
  tryhackme: "bg-gray-800",
  passes: "bg-purple-600",
  fortnite: "bg-purple-600",
  xvideos: "bg-red-700",
  bible: "bg-amber-700",
  protonmail: "bg-purple-600",
};

const PlatformLogo = ({ platform, size = "md", className, showFallbackIcon = true }: PlatformLogoProps) => {
  const platformLower = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
    xl: "w-8 h-8"
  };

  const imgSizes = {
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32
  };

  // Try to get favicon from platform domain
  const getFaviconUrl = (platformName: string): string | null => {
    const domainMap: Record<string, string> = {
      twitter: "twitter.com",
      x: "x.com",
      facebook: "facebook.com",
      instagram: "instagram.com",
      linkedin: "linkedin.com",
      github: "github.com",
      reddit: "reddit.com",
      discord: "discord.com",
      tiktok: "tiktok.com",
      snapchat: "snapchat.com",
      spotify: "spotify.com",
      youtube: "youtube.com",
      twitch: "twitch.tv",
      pinterest: "pinterest.com",
      tumblr: "tumblr.com",
      whatsapp: "whatsapp.com",
      telegram: "telegram.org",
      soundcloud: "soundcloud.com",
      mixcloud: "mixcloud.com",
      lastfm: "last.fm",
      quizlet: "quizlet.com",
      venmo: "venmo.com",
      onlyfans: "onlyfans.com",
      roblox: "roblox.com",
      chess: "chess.com",
      adobe: "adobe.com",
      apple: "apple.com",
      applemusic: "music.apple.com",
      mastodon: "mastodon.social",
      wordpress: "wordpress.com",
      blogger: "blogger.com",
      bandlab: "bandlab.com",
      poshmark: "poshmark.com",
      codecanyon: "codecanyon.net",
      fiverr: "fiverr.com",
      gog: "gog.com",
      untappd: "untappd.com",
      tryhackme: "tryhackme.com",
      fortnite: "fortnite.com",
      bible: "bible.com",
      protonmail: "proton.me",
      proton: "proton.me",
      ebay: "ebay.com",
      amazon: "amazon.com",
      paypal: "paypal.com",
      steam: "steampowered.com",
      epic: "epicgames.com",
      epicgames: "epicgames.com",
      slack: "slack.com",
      medium: "medium.com",
      dribbble: "dribbble.com",
      behance: "behance.net",
      deviantart: "deviantart.com",
      flickr: "flickr.com",
      vimeo: "vimeo.com",
      dailymotion: "dailymotion.com",
      yelp: "yelp.com",
      tripadvisor: "tripadvisor.com",
      airbnb: "airbnb.com",
      uber: "uber.com",
      lyft: "lyft.com",
      doordash: "doordash.com",
      grubhub: "grubhub.com",
      postmates: "postmates.com",
      netflix: "netflix.com",
      hulu: "hulu.com",
      disneyplus: "disneyplus.com",
      hbomax: "hbomax.com",
      peacock: "peacocktv.com",
      paramount: "paramountplus.com",
      crunchyroll: "crunchyroll.com",
      pandora: "pandora.com",
      deezer: "deezer.com",
      tidal: "tidal.com",
      spankbang: "spankbang.com",
      xvideos: "xvideos.com",
    };

    // Normalize the platform name
    let normalizedName = platformLower;
    for (const [key, domain] of Object.entries(domainMap)) {
      if (platformLower.includes(key)) {
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=${imgSizes[size] * 2}`;
      }
    }

    // Try using the platform name as domain
    if (platformLower.includes('.')) {
      return `https://www.google.com/s2/favicons?domain=${platform}&sz=${imgSizes[size] * 2}`;
    }

    return null;
  };

  const faviconUrl = getFaviconUrl(platform);

  // Fallback to lucide icons
  const getPlatformIcon = () => {
    // Social Media
    if (platformLower.includes('twitter') || platformLower.includes('x')) 
      return { Icon: Twitter, color: "text-sky-500" };
    if (platformLower.includes('facebook')) 
      return { Icon: Facebook, color: "text-blue-600" };
    if (platformLower.includes('instagram')) 
      return { Icon: Instagram, color: "text-pink-600" };
    if (platformLower.includes('linkedin')) 
      return { Icon: Linkedin, color: "text-blue-700" };
    if (platformLower.includes('github')) 
      return { Icon: Github, color: "text-foreground" };
    if (platformLower.includes('snapchat')) 
      return { Icon: Camera, color: "text-yellow-400" };
    if (platformLower.includes('tiktok')) 
      return { Icon: Video, color: "text-foreground" };
    if (platformLower.includes('reddit')) 
      return { Icon: MessageCircle, color: "text-orange-600" };
    if (platformLower.includes('discord')) 
      return { Icon: MessageCircle, color: "text-indigo-500" };
    if (platformLower.includes('youtube')) 
      return { Icon: Video, color: "text-red-600" };
    if (platformLower.includes('twitch')) 
      return { Icon: Video, color: "text-purple-600" };
    
    // Professional
    if (platformLower.includes('gravatar')) 
      return { Icon: Users, color: "text-blue-500" };
    if (platformLower.includes('freelancer')) 
      return { Icon: Briefcase, color: "text-blue-600" };
    
    // Shopping & Services
    if (platformLower.includes('ebay') || platformLower.includes('shop')) 
      return { Icon: ShoppingBag, color: "text-blue-600" };
    if (platformLower.includes('venmo') || platformLower.includes('paypal')) 
      return { Icon: Wallet, color: "text-blue-500" };
    if (platformLower.includes('yelp') || platformLower.includes('map')) 
      return { Icon: MapPin, color: "text-red-600" };
    
    // Entertainment
    if (platformLower.includes('spotify') || platformLower.includes('music') || platformLower.includes('pandora') || platformLower.includes('soundcloud')) 
      return { Icon: Music, color: "text-green-500" };
    if (platformLower.includes('game') || platformLower.includes('steam') || platformLower.includes('roblox') || platformLower.includes('fortnite')) 
      return { Icon: Gamepad2, color: "text-foreground" };
    
    // Communication
    if (platformLower.includes('mail') || platformLower.includes('email') || platformLower.includes('proton')) 
      return { Icon: Mail, color: "text-blue-600" };
    if (platformLower.includes('telegram')) 
      return { Icon: MessageCircle, color: "text-sky-500" };
    
    // Dating
    if (platformLower.includes('tinder') || platformLower.includes('bumble') || platformLower.includes('hinge')) 
      return { Icon: Heart, color: "text-pink-500" };
    
    // Default
    return { Icon: Globe, color: "text-muted-foreground" };
  };

  const { Icon, color } = getPlatformIcon();

  // Render favicon image if available
  if (faviconUrl) {
    return (
      <img 
        src={faviconUrl}
        alt={`${platform} logo`}
        className={cn(sizeClasses[size], "rounded object-contain", className)}
        onError={(e) => {
          // On error, hide image and show nothing (fallback icon will be shown by parent)
          e.currentTarget.style.display = 'none';
          // Replace with fallback icon
          const parent = e.currentTarget.parentElement;
          if (parent && showFallbackIcon) {
            parent.innerHTML = '';
            const iconElement = document.createElement('span');
            iconElement.className = cn(sizeClasses[size], color, className || '');
            parent.appendChild(iconElement);
          }
        }}
      />
    );
  }

  // Fallback to lucide icon
  return <Icon className={cn(sizeClasses[size], color, className)} />;
};

export default PlatformLogo;
