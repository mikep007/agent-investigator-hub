import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Info, Loader2, Calendar, UserCheck, Hash, 
  MapPin, Briefcase, ExternalLink, AlertCircle, Building2 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InstagramAboutModalProps {
  username: string;
}

interface AboutData {
  username: string;
  userId?: string;
  fullName?: string;
  biography?: string;
  profilePicUrl?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
  dateJoined?: string;
  dateJoinedRaw?: string;
  accountCountry?: string;
  formerUsernamesCount?: number;
  formerUsernames?: string[];
  accountType?: 'personal' | 'business' | 'creator';
  businessCategory?: string;
  businessEmail?: string;
  businessPhone?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  adLibraryUrl?: string;
  success: boolean;
  error?: string;
}

interface IntelligenceResponse {
  username: string;
  tool: string;
  aboutData: AboutData;
  formattedOutput: string;
  profileUrl: string;
  dataAvailable: {
    dateJoined: boolean;
    formerUsernames: boolean;
    accountCountry: boolean;
    businessInfo: boolean;
    adsTransparency: boolean;
  };
  manualVerificationLinks: Array<{
    name: string;
    url: string;
    description: string;
  }>;
  tips: string[];
}

const InstagramAboutModal = ({ username }: InstagramAboutModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAboutData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data: response, error: fetchError } = await supabase.functions.invoke(
        'osint-instagram-about',
        { body: { target: username } }
      );

      if (fetchError) throw fetchError;
      
      setData(response as IntelligenceResponse);
      toast.success('About Account data retrieved');
    } catch (err) {
      console.error('Error fetching Instagram About data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      toast.error('Failed to fetch About Account data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpen = (open: boolean) => {
    setIsOpen(open);
    if (open && !data) {
      fetchAboutData();
    }
  };

  const about = data?.aboutData;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2 gap-1"
        >
          <Info className="h-3 w-3" />
          About Account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-pink-500">📷</span>
            About @{username}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Fetching account transparency data...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchAboutData}>
                Try Again
              </Button>
            </div>
          ) : about ? (
            <div className="space-y-4">
              {/* Profile Header */}
              <div className="flex items-start gap-3">
                {about.profilePicUrl && (
                  <img 
                    src={about.profilePicUrl} 
                    alt={username}
                    className="h-16 w-16 rounded-full object-cover border-2 border-border"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-lg">@{username}</span>
                    {about.isVerified && (
                      <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">
                        <UserCheck className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  {about.fullName && (
                    <p className="text-foreground">{about.fullName}</p>
                  )}
                  {about.biography && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{about.biography}</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* About This Account Section */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  About This Account
                </h4>

                {/* Date Joined */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Date Joined</p>
                    <p className="text-sm text-muted-foreground">
                      {about.dateJoined || 'Not available (requires app access)'}
                    </p>
                  </div>
                </div>

                {/* Former Usernames */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Hash className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Former Usernames</p>
                    <p className="text-sm text-muted-foreground">
                      {about.formerUsernames?.length 
                        ? about.formerUsernames.join(', ')
                        : about.formerUsernamesCount !== undefined
                          ? `${about.formerUsernamesCount} username change(s)`
                          : 'Not available (view in Instagram app)'}
                    </p>
                  </div>
                </div>

                {/* Account Country */}
                {about.accountCountry && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <MapPin className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Account Based In</p>
                      <p className="text-sm text-muted-foreground">{about.accountCountry}</p>
                    </div>
                  </div>
                )}

                {/* Account Type */}
                {about.accountType && about.accountType !== 'personal' && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Briefcase className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {about.accountType === 'business' ? 'Business Account' : 'Creator Account'}
                      </p>
                      {about.businessCategory && (
                        <p className="text-sm text-muted-foreground">{about.businessCategory}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Stats */}
              {(about.followersCount !== undefined || about.postsCount !== undefined) && (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {about.postsCount !== undefined && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-lg font-bold">{about.postsCount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Posts</p>
                      </div>
                    )}
                    {about.followersCount !== undefined && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-lg font-bold">{about.followersCount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Followers</p>
                      </div>
                    )}
                    {about.followingCount !== undefined && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-lg font-bold">{about.followingCount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Following</p>
                      </div>
                    )}
                  </div>
                  <Separator />
                </>
              )}

              {/* Manual Verification Links */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  Verification Links
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {data?.manualVerificationLinks?.slice(0, 4).map((link, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 justify-start"
                      onClick={() => window.open(link.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1.5" />
                      {link.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tips */}
              {data?.tips && data.tips.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                      Tips
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {data.tips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary">•</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default InstagramAboutModal;
