import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Activity, User, Mail, Phone, MapPin, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SearchData {
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
  keywords?: string;
}

interface ComprehensiveSearchFormProps {
  onStartInvestigation: (searchData: SearchData) => void;
  loading: boolean;
}

const ComprehensiveSearchForm = ({ onStartInvestigation, loading }: ComprehensiveSearchFormProps) => {
  const [searchData, setSearchData] = useState<SearchData>({
    fullName: "",
    address: "",
    email: "",
    phone: "",
    username: "",
    keywords: "",
  });
  const { toast } = useToast();

  const handleChange = (field: keyof SearchData, value: string) => {
    setSearchData(prev => ({ ...prev, [field]: value }));
  };

  const validateAndSubmit = () => {
    // At least one field is required
    const hasAtLeastOneField = 
      searchData.fullName?.trim() || 
      searchData.email?.trim() || 
      searchData.phone?.trim() || 
      searchData.username?.trim() || 
      searchData.address?.trim();

    if (!hasAtLeastOneField) {
      toast({
        title: "Validation Error",
        description: "At least one search parameter is required",
        variant: "destructive",
      });
      return;
    }

    // Validate email format if provided
    if (searchData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(searchData.email.trim())) {
        toast({
          title: "Invalid Email",
          description: "Please enter a valid email address or leave it blank",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate phone format if provided
    if (searchData.phone.trim()) {
      const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
      if (!phoneRegex.test(searchData.phone.trim())) {
        toast({
          title: "Invalid Phone",
          description: "Please enter a valid phone number (at least 10 digits) or leave it blank",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate username format if provided (platform-compliant)
    if (searchData.username.trim()) {
      const usernameRegex = /^[a-zA-Z0-9._-]+$/;
      if (!usernameRegex.test(searchData.username.trim())) {
        toast({
          title: "Invalid Username",
          description: "Username can only contain letters, numbers, dots, underscores, and hyphens",
          variant: "destructive",
        });
        return;
      }

      if (searchData.username.trim().length < 3) {
        toast({
          title: "Invalid Username",
          description: "Username must be at least 3 characters long",
          variant: "destructive",
        });
        return;
      }

      if (searchData.username.trim().length > 30) {
        toast({
          title: "Invalid Username",
          description: "Username must be 30 characters or less",
          variant: "destructive",
        });
        return;
      }
    }

    // Count filled fields
    const filledFields = [
      searchData.fullName,
      searchData.address,
      searchData.email,
      searchData.phone,
      searchData.username,
      searchData.keywords
    ].filter(field => field?.trim()).length;

    toast({
      title: "Investigation Started",
      description: `Searching with ${filledFields} data point${filledFields > 1 ? 's' : ''}`,
    });

    onStartInvestigation(searchData);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      validateAndSubmit();
    }
  };

  return (
    <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
            <Search className="w-5 h-5 text-primary" />
            Comprehensive Person Investigation
          </h2>
          <p className="text-sm text-muted-foreground">
            Enter at least one search parameter. More data points = higher accuracy and confidence scores.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Full Name - Optional */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="fullName" className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              Full Name
            </Label>
            <Input
              id="fullName"
              placeholder="John Smith"
              value={searchData.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
              onKeyDown={handleKeyPress}
              className="bg-background/50"
              maxLength={100}
              disabled={loading}
            />
          </div>

          {/* Email - Optional */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={searchData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              onKeyDown={handleKeyPress}
              className="bg-background/50"
              maxLength={255}
              disabled={loading}
            />
          </div>

          {/* Phone - Optional */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              Phone Number
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 555-0123"
              value={searchData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              onKeyDown={handleKeyPress}
              className="bg-background/50"
              maxLength={20}
              disabled={loading}
            />
          </div>

          {/* Username - Optional */}
          <div className="space-y-2">
            <Label htmlFor="username" className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              Username
            </Label>
            <Input
              id="username"
              placeholder="johnsmith007"
              value={searchData.username}
              onChange={(e) => handleChange("username", e.target.value)}
              onKeyDown={handleKeyPress}
              className="bg-background/50"
              maxLength={30}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              3-30 characters: letters, numbers, dots, underscores, hyphens only
            </p>
          </div>

          {/* Address - Optional */}
          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Address / Location
            </Label>
            <Input
              id="address"
              placeholder="123 Main St, City, State"
              value={searchData.address}
              onChange={(e) => handleChange("address", e.target.value)}
              onKeyDown={handleKeyPress}
              className="bg-background/50"
              maxLength={255}
              disabled={loading}
            />
          </div>

          {/* Keywords - Optional */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="keywords" className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              Keywords / Associated Terms
            </Label>
            <Textarea
              id="keywords"
              placeholder="Company name, nicknames, interests, hobbies, affiliations... (comma-separated)"
              value={searchData.keywords}
              onChange={(e) => handleChange("keywords", e.target.value)}
              className="bg-background/50 min-h-[80px]"
              maxLength={500}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Add keywords to improve matching accuracy and boost confidence scores when found across platforms
            </p>
          </div>
        </div>

        <Button
          onClick={validateAndSubmit}
          disabled={loading || !searchData.fullName.trim()}
          className="w-full cyber-glow"
          size="lg"
        >
          {loading ? (
            <>
              <Activity className="w-4 h-4 mr-2 animate-spin" />
              Investigating...
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" />
              Start Comprehensive Investigation
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground text-center">
          <span className="text-destructive">*</span> Required field • All other fields optional but recommended for better accuracy
        </div>
      </div>
    </Card>
  );
};

export default ComprehensiveSearchForm;
