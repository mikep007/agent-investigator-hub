import { 
  Twitter, Facebook, Instagram, Linkedin, Github, 
  Mail, Globe, MessageCircle, Video, Phone,
  ShoppingBag, MapPin, Music, Camera, Briefcase,
  Users, Link as LinkIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlatformLogoProps {
  platform: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const PlatformLogo = ({ platform, size = "md", className }: PlatformLogoProps) => {
  const platformLower = platform.toLowerCase();
  
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6"
  };

  const getPlatformIcon = () => {
    // Social Media
    if (platformLower.includes('twitter') || platformLower.includes('x.com')) 
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
    
    // Professional
    if (platformLower.includes('gravatar')) 
      return { Icon: Users, color: "text-blue-500" };
    if (platformLower.includes('freelancer')) 
      return { Icon: Briefcase, color: "text-blue-600" };
    if (platformLower.includes('asana')) 
      return { Icon: Briefcase, color: "text-pink-500" };
    
    // Shopping & Services
    if (platformLower.includes('ebay')) 
      return { Icon: ShoppingBag, color: "text-blue-600" };
    if (platformLower.includes('alibaba')) 
      return { Icon: ShoppingBag, color: "text-orange-600" };
    if (platformLower.includes('zillow')) 
      return { Icon: MapPin, color: "text-blue-600" };
    if (platformLower.includes('deliveroo')) 
      return { Icon: ShoppingBag, color: "text-teal-500" };
    if (platformLower.includes('venmo')) 
      return { Icon: Phone, color: "text-blue-500" };
    if (platformLower.includes('yelp')) 
      return { Icon: MapPin, color: "text-red-600" };
    
    // Entertainment
    if (platformLower.includes('pandora')) 
      return { Icon: Music, color: "text-blue-600" };
    if (platformLower.includes('spotify')) 
      return { Icon: Music, color: "text-green-500" };
    if (platformLower.includes('wattpad')) 
      return { Icon: Users, color: "text-orange-600" };
    if (platformLower.includes('archive')) 
      return { Icon: Globe, color: "text-gray-600" };
    if (platformLower.includes('foursquare')) 
      return { Icon: MapPin, color: "text-pink-500" };
    if (platformLower.includes('vivino')) 
      return { Icon: ShoppingBag, color: "text-red-600" };
    
    // Tech & Gaming
    if (platformLower.includes('epic') || platformLower.includes('games')) 
      return { Icon: Video, color: "text-foreground" };
    if (platformLower.includes('firefox')) 
      return { Icon: Globe, color: "text-orange-600" };
    
    // Communication
    if (platformLower.includes('mail') || platformLower.includes('email')) 
      return { Icon: Mail, color: "text-blue-600" };
    if (platformLower.includes('google')) 
      return { Icon: Mail, color: "text-blue-600" };
    if (platformLower.includes('airtel')) 
      return { Icon: Phone, color: "text-red-600" };
    if (platformLower.includes('hackerrank')) 
      return { Icon: Github, color: "text-green-600" };
    
    // Default
    return { Icon: LinkIcon, color: "text-muted-foreground" };
  };

  const { Icon, color } = getPlatformIcon();

  return (
    <Icon className={cn(sizeClasses[size], color, className)} />
  );
};

export default PlatformLogo;
