import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ExternalLink, CheckCircle2, Copy, ChevronDown, 
  MapPin, Calendar, User, Hash, Eye, Flag
} from "lucide-react";
import PlatformLogo from "../PlatformLogo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import InstagramAboutModal from "./InstagramAboutModal";

interface OSINTPlatformCardProps {
  platform: string;
  url: string;
  username?: string;
  userId?: string;
  profileImage?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  location?: string;
  locationFlag?: string;
  creationDate?: string;
  lastSeen?: string;
  verified?: boolean;
  isPublic?: boolean;
  recentlyActive?: boolean;
  onExpand?: () => void;
}

const OSINTPlatformCard = ({
  platform,
  url,
  username,
  userId,
  profileImage,
  firstName,
  lastName,
  fullName,
  location,
  locationFlag,
  creationDate,
  lastSeen,
  verified = false,
  isPublic = false,
  recentlyActive = false,
  onExpand,
}: OSINTPlatformCardProps) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const displayName = fullName || (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName);

  return (
    <Card className="group hover:shadow-lg transition-all border border-border hover:border-primary/30 overflow-hidden">
      <CardContent className="p-0">
        {/* Header with platform branding */}
        <div className="flex items-start gap-3 p-4">
          {/* Platform Logo */}
          <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 border border-border">
            <PlatformLogo platform={platform} size="lg" />
          </div>

          {/* Platform Name and Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">{platform}</h3>
              {recentlyActive && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px] px-1.5 py-0">
                  RECENTLY ACTIVE
                </Badge>
              )}
              {lastSeen && (
                <span className="text-xs text-muted-foreground">
                  Last Seen {formatDate(lastSeen) || lastSeen}
                </span>
              )}
            </div>
          </div>

          {/* Profile Image */}
          {profileImage && (
            <div className="h-16 w-16 rounded-lg overflow-hidden border border-border shrink-0">
              <img 
                src={profileImage} 
                alt={`${platform} profile`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* Details Grid */}
        <div className="px-4 pb-3 space-y-2">
          {/* User ID */}
          {userId && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground min-w-[80px]">Id</span>
              <span className="font-mono text-foreground">{userId}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                onClick={() => copyToClipboard(userId, 'User ID')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Name */}
          {username && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground min-w-[80px]">Name</span>
              <span className="text-foreground">{username}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                onClick={() => copyToClipboard(username, 'Username')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* First Name */}
          {firstName && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground min-w-[80px]">First Name</span>
              <span className="text-foreground">{firstName}</span>
            </div>
          )}

          {/* Last Name */}
          {lastName && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground min-w-[80px]">Last Name</span>
              <span className="text-foreground">{lastName}</span>
            </div>
          )}

          {/* Creation Date */}
          {creationDate && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground min-w-[80px]">Creation Date</span>
              <span className="text-foreground">{formatDate(creationDate) || creationDate}</span>
              {creationDate && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {new Date(creationDate).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Badge>
              )}
            </div>
          )}

          {/* Location */}
          {location && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground min-w-[80px]">Location</span>
              <span className="text-foreground">{location}</span>
              {locationFlag && (
                <span className="text-lg">{locationFlag}</span>
              )}
            </div>
          )}
        </div>

        {/* Status Tags */}
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {verified && (
            <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-500/30">
              <CheckCircle2 className="h-3 w-3" />
              VERIFIED ACCOUNT
            </Badge>
          )}
          {isPublic && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Eye className="h-3 w-3" />
              PUBLIC ACCOUNT
            </Badge>
          )}
          {locationFlag && (
            <Badge variant="outline" className="text-[10px]">
              <Flag className="h-3 w-3 mr-1" />
              {location || 'LOCATION'}
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 p-3 border-t border-border bg-muted/30">
          <Button
            variant="link"
            size="sm"
            className="text-xs h-7 px-2 text-primary"
            onClick={() => window.open(url, '_blank')}
          >
            View Account
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>

          {/* Instagram About Account Button */}
          {platform.toLowerCase() === 'instagram' && username && (
            <InstagramAboutModal username={username} />
          )}
          
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-3 ml-auto"
            onClick={onExpand}
          >
            Expand Result
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default OSINTPlatformCard;
