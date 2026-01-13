import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ScanFace, Upload, ExternalLink, AlertCircle, 
  CheckCircle2, Image, Camera, Search, Bot,
  Send, Loader2, Eye, Shield, Users, Video,
  Newspaper, Globe, ChevronDown, ChevronUp, X
} from "lucide-react";
import { FindingData } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FacialRecognitionCardProps {
  findings: FindingData[];
  investigationId?: string | null;
  targetName?: string;
}

interface ManualVerificationLink {
  source: string;
  url: string;
  description: string;
  capabilities: string[];
}

interface FaceSearchResult {
  source: string;
  url: string;
  thumbnail?: string;
  similarity?: number;
  sourceType: 'social_media' | 'mugshot' | 'news' | 'video' | 'other';
  title?: string;
  description?: string;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  'PimEyes': <Eye className="h-4 w-4" />,
  'FaceCheck.ID': <Shield className="h-4 w-4" />,
  'Yandex Images': <Globe className="h-4 w-4" />,
  'Search4faces': <Users className="h-4 w-4" />,
  'TelegramFaceSearch': <Send className="h-4 w-4" />,
  'GetContact': <Send className="h-4 w-4" />,
  'EyeOfGod': <Bot className="h-4 w-4" />,
  'Himera': <Bot className="h-4 w-4" />,
};

const SOURCE_COLORS: Record<string, string> = {
  'PimEyes': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'FaceCheck.ID': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'Yandex Images': 'bg-red-500/10 text-red-600 border-red-500/20',
  'Search4faces': 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  'TelegramFaceSearch': 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  'GetContact': 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  'EyeOfGod': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  'Himera': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  'mugshots': <Shield className="h-3 w-3" />,
  'social_media': <Users className="h-3 w-3" />,
  'news': <Newspaper className="h-3 w-3" />,
  'video': <Video className="h-3 w-3" />,
  'registries': <Shield className="h-3 w-3" />,
  'russian_platforms': <Globe className="h-3 w-3" />,
  'telegram_users': <Send className="h-3 w-3" />,
  'phone_lookup': <Search className="h-3 w-3" />,
};

const FacialRecognitionCard = ({ findings, investigationId, targetName }: FacialRecognitionCardProps) => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    results: FaceSearchResult[];
    manualVerificationLinks: ManualVerificationLink[];
  } | null>(null);
  const [showTelegramBots, setShowTelegramBots] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Extract face search data from findings
  const faceFindings = findings.filter(f => 
    f.agent_type?.toLowerCase().includes('face') ||
    f.source?.toLowerCase().includes('face')
  );

  const existingResults = faceFindings.length > 0 ? faceFindings[0].data : null;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setUploadedImage(base64);
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSearch = async () => {
    if (!uploadedImage) {
      toast({
        title: "No image uploaded",
        description: "Please upload a photo first",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('osint-face-search', {
        body: {
          investigationId,
          imageBase64: uploadedImage,
        }
      });

      if (error) throw error;

      setSearchResults({
        results: data.results || [],
        manualVerificationLinks: data.manualVerificationLinks || [],
      });

      toast({
        title: "Face Search Complete",
        description: data.results?.length > 0 
          ? `Found ${data.results.length} potential matches`
          : "Manual verification links ready",
      });
    } catch (error: any) {
      console.error('Face search error:', error);
      toast({
        title: "Search Failed",
        description: error.message || "Failed to perform face search",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const clearImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    setSearchResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayLinks = searchResults?.manualVerificationLinks || existingResults?.manualVerificationLinks || [];
  const displayResults = searchResults?.results || existingResults?.results || [];

  const webSources = displayLinks.filter(l => !l.url.includes('t.me'));
  const telegramBots = displayLinks.filter(l => l.url.includes('t.me'));

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <ScanFace className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Facial Recognition Search</CardTitle>
              <p className="text-sm text-muted-foreground">
                {displayLinks.length} sources available
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
            <Camera className="h-3 w-3" />
            Beta
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Image Upload Area */}
        <div className="relative">
          {imagePreview ? (
            <div className="relative rounded-lg overflow-hidden border border-border/50">
              <img 
                src={imagePreview} 
                alt="Uploaded face" 
                className="w-full max-h-48 object-contain bg-muted/30"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 bg-background/80 hover:bg-background"
                onClick={clearImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div 
              className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">Upload a Photo</p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG up to 10MB - Click or drag to upload
              </p>
            </div>
          )}
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>

        {/* Search Button */}
        {uploadedImage && (
          <Button 
            onClick={handleSearch} 
            disabled={isSearching}
            className="w-full gap-2"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Search for Face Matches
              </>
            )}
          </Button>
        )}

        {/* Automated Results */}
        {displayResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Automated Results ({displayResults.length})
            </h4>
            <div className="space-y-2">
              {displayResults.map((result, idx) => (
                <a
                  key={idx}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  {result.thumbnail ? (
                    <img src={result.thumbnail} alt="" className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                      <Image className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{result.title || result.source}</p>
                    <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                    {result.similarity && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        {Math.round(result.similarity * 100)}% match
                      </Badge>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Manual Verification Links - Web Sources */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>Manual Verification Sources</span>
          </div>
          
          <div className="grid gap-2">
            {webSources.map((link, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="justify-between h-auto py-3 px-4"
                onClick={() => window.open(link.url, '_blank')}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${SOURCE_COLORS[link.source] || 'bg-muted'}`}>
                    {SOURCE_ICONS[link.source] || <Globe className="h-4 w-4" />}
                  </div>
                  <div className="text-left">
                    <p className="font-medium">{link.source}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {link.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {link.capabilities?.slice(0, 3).map((cap, i) => (
                      <Badge key={i} variant="secondary" className="text-xs px-1.5">
                        {CAPABILITY_ICONS[cap] || cap}
                      </Badge>
                    ))}
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Telegram Bots Section */}
        {telegramBots.length > 0 && (
          <Collapsible open={showTelegramBots} onOpenChange={setShowTelegramBots}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  <span>Telegram OSINT Bots ({telegramBots.length})</span>
                </div>
                {showTelegramBots ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              <p className="text-xs text-muted-foreground px-2">
                These Telegram bots provide additional OSINT capabilities including face search, phone lookups, and more.
              </p>
              <div className="grid gap-2">
                {telegramBots.map((link, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="justify-between h-auto py-2 px-3"
                    onClick={() => window.open(link.url, '_blank')}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${SOURCE_COLORS[link.source] || 'bg-sky-500/10'}`}>
                        {SOURCE_ICONS[link.source] || <Bot className="h-3 w-3" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium">{link.source}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {link.description}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Info Notice */}
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
          <div className="flex gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              <span className="font-medium text-amber-700">Privacy Notice:</span>{' '}
              Facial recognition services may require uploading the photo directly to their platforms. 
              Results quality depends on the service's database coverage.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FacialRecognitionCard;
