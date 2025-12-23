import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Activity, User, Mail, Phone, MapPin, Tag, CheckCircle2, XCircle, Info, Building2, ClipboardPaste, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SearchHelpModal } from "./SearchHelpModal";
import AddressAutocomplete from "./AddressAutocomplete";
import { Badge } from "@/components/ui/badge";

// US States for dropdown
const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "Washington D.C." },
];

type SearchMode = 'comprehensive' | 'location_only';

interface SearchData {
  fullName?: string;
  address?: string;
  email?: string;
  phone?: string;
  username?: string;
  keywords?: string;
  city?: string;
  state?: string;
}

// Parse bulk input (comma, newline, semicolon separated)
const parseBulkInput = (input: string): string[] => {
  return input
    .split(/[,;\n\r\t]+/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
};

interface ValidationState {
  email: 'valid' | 'invalid' | 'empty';
  phone: 'valid' | 'invalid' | 'empty';
  username: 'valid' | 'invalid' | 'empty';
}

interface ComprehensiveSearchFormProps {
  onStartInvestigation: (searchData: SearchData) => void;
  loading: boolean;
  pivotData?: Partial<SearchData> | null;
  onPivotConsumed?: () => void;
}

const ComprehensiveSearchForm = ({ onStartInvestigation, loading, pivotData, onPivotConsumed }: ComprehensiveSearchFormProps) => {
  const [searchMode, setSearchMode] = useState<SearchMode>('comprehensive');
  const [searchData, setSearchData] = useState<SearchData>({
    fullName: "",
    address: "",
    email: "",
    phone: "",
    username: "",
    keywords: "",
    city: "",
    state: "",
  });
  
  const [validation, setValidation] = useState<ValidationState>({
    email: 'empty',
    phone: 'empty',
    username: 'empty',
  });

  // Bulk entries for emails and usernames
  const [bulkEmails, setBulkEmails] = useState<string[]>([]);
  const [bulkUsernames, setBulkUsernames] = useState<string[]>([]);
  
  const { toast } = useToast();

  // Handle pivot data injection
  useEffect(() => {
    if (pivotData) {
      setSearchData(prev => ({
        ...prev,
        ...pivotData,
      }));
      
      // Update validation for any pivot fields
      if (pivotData.email) {
        setValidation(prev => ({ ...prev, email: validateEmail(pivotData.email!) }));
      }
      if (pivotData.phone) {
        setValidation(prev => ({ ...prev, phone: validatePhone(pivotData.phone!) }));
      }
      if (pivotData.username) {
        setValidation(prev => ({ ...prev, username: validateUsername(pivotData.username!) }));
      }
      
      // Notify parent that pivot has been consumed
      onPivotConsumed?.();
    }
  }, [pivotData, onPivotConsumed]);

  const validateEmail = (email: string): 'valid' | 'invalid' | 'empty' => {
    if (!email.trim()) return 'empty';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim()) ? 'valid' : 'invalid';
  };

  const validatePhone = (phone: string): 'valid' | 'invalid' | 'empty' => {
    if (!phone.trim()) return 'empty';
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    return phoneRegex.test(phone.trim()) ? 'valid' : 'invalid';
  };

  const validateUsername = (username: string): 'valid' | 'invalid' | 'empty' => {
    if (!username.trim()) return 'empty';
    const usernameRegex = /^[a-zA-Z0-9._-]+$/;
    if (!usernameRegex.test(username.trim())) return 'invalid';
    if (username.trim().length < 3 || username.trim().length > 30) return 'invalid';
    return 'valid';
  };

  const handleChange = (field: keyof SearchData, value: string) => {
    setSearchData(prev => ({ ...prev, [field]: value }));
    
    // Update validation state for validated fields
    if (field === 'email') {
      setValidation(prev => ({ ...prev, email: validateEmail(value) }));
    } else if (field === 'phone') {
      setValidation(prev => ({ ...prev, phone: validatePhone(value) }));
    } else if (field === 'username') {
      setValidation(prev => ({ ...prev, username: validateUsername(value) }));
    }
  };

  // Handle bulk paste for emails
  const handleEmailPaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    const values = parseBulkInput(pastedText);
    
    if (values.length > 1) {
      e.preventDefault();
      const validEmails = values.filter(v => validateEmail(v) === 'valid');
      const uniqueEmails = validEmails.filter(
        email => !bulkEmails.includes(email.toLowerCase()) && 
                 email.toLowerCase() !== searchData.email?.toLowerCase()
      );
      
      if (uniqueEmails.length > 0) {
        setBulkEmails(prev => [...prev, ...uniqueEmails.map(e => e.toLowerCase())]);
        toast({
          title: "Emails Added",
          description: `Added ${uniqueEmails.length} email${uniqueEmails.length > 1 ? 's' : ''} to search`,
        });
      }
    }
  };

  // Handle bulk paste for usernames
  const handleUsernamePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    const values = parseBulkInput(pastedText);
    
    if (values.length > 1) {
      e.preventDefault();
      const validUsernames = values.filter(v => validateUsername(v) === 'valid');
      const uniqueUsernames = validUsernames.filter(
        username => !bulkUsernames.includes(username.toLowerCase()) && 
                    username.toLowerCase() !== searchData.username?.toLowerCase()
      );
      
      if (uniqueUsernames.length > 0) {
        setBulkUsernames(prev => [...prev, ...uniqueUsernames]);
        toast({
          title: "Usernames Added",
          description: `Added ${uniqueUsernames.length} username${uniqueUsernames.length > 1 ? 's' : ''} to search`,
        });
      }
    }
  };

  const removeBulkEmail = (email: string) => {
    setBulkEmails(prev => prev.filter(e => e !== email));
  };

  const removeBulkUsername = (username: string) => {
    setBulkUsernames(prev => prev.filter(u => u !== username));
  };

  const validateAndSubmit = () => {
    // Different validation based on search mode
    if (searchMode === 'location_only') {
      // Location-only mode requires city and state
      if (!searchData.city?.trim() || !searchData.state?.trim()) {
        toast({
          title: "Validation Error",
          description: "Both city and state are required for location-only search",
          variant: "destructive",
        });
        return;
      }
      
      // Construct address from city/state for the search
      const locationAddress = `${searchData.city.trim()}, ${searchData.state}`;
      
      toast({
        title: "Location Search Started",
        description: `Searching in ${locationAddress}`,
      });
      
      onStartInvestigation({
        ...searchData,
        address: locationAddress,
      });
      return;
    }

    // Comprehensive mode - at least one field is required
    const hasAtLeastOneField = 
      searchData.fullName?.trim() || 
      searchData.email?.trim() || 
      searchData.phone?.trim() || 
      searchData.username?.trim() || 
      searchData.address?.trim() ||
      bulkEmails.length > 0 ||
      bulkUsernames.length > 0 ||
      (searchData.city?.trim() && searchData.state?.trim());

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

    // Count filled fields including city/state
    const filledFields = [
      searchData.fullName,
      searchData.address || (searchData.city && searchData.state ? `${searchData.city}, ${searchData.state}` : ''),
      searchData.email,
      searchData.phone,
      searchData.username,
      searchData.keywords
    ].filter(field => field?.trim()).length + bulkEmails.length + bulkUsernames.length;

    toast({
      title: "Investigation Started",
      description: `Searching with ${filledFields} data point${filledFields > 1 ? 's' : ''}`,
    });

    // If city/state provided but not address, construct address
    // Include bulk entries in the search data
    const allEmails = [searchData.email, ...bulkEmails].filter(Boolean).join(', ');
    const allUsernames = [searchData.username, ...bulkUsernames].filter(Boolean);
    
    const finalSearchData = {
      ...searchData,
      email: allEmails || searchData.email,
      username: allUsernames[0] || searchData.username, // Primary username
      address: searchData.address || (searchData.city && searchData.state ? `${searchData.city.trim()}, ${searchData.state}` : ''),
      // Pass additional usernames via keywords if needed
      keywords: allUsernames.length > 1 
        ? `${searchData.keywords || ''} ${allUsernames.slice(1).join(' ')}`.trim()
        : searchData.keywords,
    };

    onStartInvestigation(finalSearchData);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      validateAndSubmit();
    }
  };

  return (
    <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
      <TooltipProvider>
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                {searchMode === 'location_only' ? 'Location Search' : 'Comprehensive Person Investigation'}
              </h2>
              <SearchHelpModal />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchMode === 'location_only' 
                ? 'Search by city and state when you only know the location.'
                : 'Enter at least one search parameter. More data points = higher accuracy and confidence scores.'}
            </p>
          </div>

          {/* Search Mode Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Search Mode
            </Label>
            <Select 
              value={searchMode} 
              onValueChange={(value: SearchMode) => setSearchMode(value)}
              disabled={loading}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select search mode" />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="comprehensive">Full Investigation (Person Search)</SelectItem>
                <SelectItem value="location_only">Location Only (City & State)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location-Only Mode Fields */}
          {searchMode === 'location_only' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-border bg-muted/20">
              <div className="space-y-2">
                <Label htmlFor="city" className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  City <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="city"
                  placeholder="e.g., Philadelphia"
                  value={searchData.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="bg-background/50"
                  maxLength={100}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  State <span className="text-destructive">*</span>
                </Label>
                <Select 
                  value={searchData.state} 
                  onValueChange={(value) => handleChange("state", value)}
                  disabled={loading}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border z-50 max-h-[300px]">
                    {US_STATES.map((state) => (
                      <SelectItem key={state.code} value={state.code}>
                        {state.name} ({state.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Optional name for location search */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="locationName" className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Name (Optional)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-popover border border-border">
                      <p className="text-sm">
                        Adding a name helps narrow results to a specific person in this location.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  id="locationName"
                  placeholder="John Smith (optional)"
                  value={searchData.fullName}
                  onChange={(e) => handleChange("fullName", e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="bg-background/50"
                  maxLength={100}
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Comprehensive Mode Fields */}
          {searchMode === 'comprehensive' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name - Optional */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fullName" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Full Name
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      Our system automatically uses advanced Google Dork techniques including exact phrase matching and location correlation to find highly relevant results. Just enter the name normally - no quotes needed!
                    </p>
                  </TooltipContent>
                </Tooltip>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <ClipboardPaste className="w-3.5 h-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-popover border border-border">
                  <p className="text-xs">Paste multiple emails (comma or newline separated)</p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                placeholder="john@example.com (or paste multiple)"
                value={searchData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                onKeyDown={handleKeyPress}
                onPaste={handleEmailPaste}
                className={`bg-background/50 pr-10 ${
                  validation.email === 'invalid' ? 'border-destructive' : 
                  validation.email === 'valid' ? 'border-green-500' : ''
                }`}
                maxLength={255}
                disabled={loading}
              />
              {validation.email === 'valid' && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
              )}
              {validation.email === 'invalid' && (
                <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive" />
              )}
            </div>
            {bulkEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {bulkEmails.map((email, idx) => (
                  <Badge 
                    key={`${email}-${idx}`} 
                    variant="secondary" 
                    className="text-xs flex items-center gap-1 pr-1"
                  >
                    {email}
                    <button
                      onClick={() => removeBulkEmail(email)}
                      className="ml-0.5 p-0.5 rounded-full hover:bg-destructive/20"
                      disabled={loading}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Format: username@domain.com • Paste multiple separated by commas or newlines
            </p>
          </div>

          {/* Phone - Optional */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              Phone Number
            </Label>
            <div className="relative">
              <Input
                id="phone"
                type="tel"
                placeholder="+1 555-0123"
                value={searchData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                onKeyDown={handleKeyPress}
                className={`bg-background/50 pr-10 ${
                  validation.phone === 'invalid' ? 'border-destructive' : 
                  validation.phone === 'valid' ? 'border-green-500' : ''
                }`}
                maxLength={20}
                disabled={loading}
              />
              {validation.phone === 'valid' && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
              )}
              {validation.phone === 'invalid' && (
                <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum 10 digits. May include +, -, (), and spaces
            </p>
          </div>

          {/* Username - Optional */}
          <div className="space-y-2">
            <Label htmlFor="username" className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              Username
              <Tooltip>
                <TooltipTrigger asChild>
                  <ClipboardPaste className="w-3.5 h-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-popover border border-border">
                  <p className="text-xs">Paste multiple usernames (comma or newline separated)</p>
                </TooltipContent>
              </Tooltip>
            </Label>
            <div className="relative">
              <Input
                id="username"
                placeholder="johnsmith007 (or paste multiple)"
                value={searchData.username}
                onChange={(e) => handleChange("username", e.target.value)}
                onKeyDown={handleKeyPress}
                onPaste={handleUsernamePaste}
                className={`bg-background/50 pr-10 ${
                  validation.username === 'invalid' ? 'border-destructive' : 
                  validation.username === 'valid' ? 'border-green-500' : ''
                }`}
                maxLength={30}
                disabled={loading}
              />
              {validation.username === 'valid' && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
              )}
              {validation.username === 'invalid' && (
                <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive" />
              )}
            </div>
            {bulkUsernames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {bulkUsernames.map((username, idx) => (
                  <Badge 
                    key={`${username}-${idx}`} 
                    variant="secondary" 
                    className="text-xs flex items-center gap-1 pr-1"
                  >
                    @{username}
                    <button
                      onClick={() => removeBulkUsername(username)}
                      className="ml-0.5 p-0.5 rounded-full hover:bg-destructive/20"
                      disabled={loading}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                3-30 chars • Paste multiple separated by commas or newlines
              </p>
              <p className={`text-xs ${
                searchData.username.length > 25 ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {searchData.username.length}/30
              </p>
            </div>
          </div>

          {/* Address - Optional */}
          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Address / Location
            </Label>
            <AddressAutocomplete
              value={searchData.address}
              onChange={(value) => handleChange("address", value)}
              onKeyDown={handleKeyPress}
              placeholder="Start typing an address..."
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
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Add keywords to improve matching accuracy and boost confidence scores when found across platforms
              </p>
              <p className={`text-xs ${
                searchData.keywords.length > 450 ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {searchData.keywords.length}/500
              </p>
            </div>
          </div>
          </div>
          )}

          <Button
            onClick={validateAndSubmit}
            disabled={loading}
            className="w-full cyber-glow"
            size="lg"
          >
            {loading ? (
              <>
                <Activity className="w-4 h-4 mr-2 animate-spin" />
                {searchMode === 'location_only' ? 'Searching Location...' : 'Investigating...'}
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                {searchMode === 'location_only' ? 'Search Location' : 'Start Comprehensive Investigation'}
              </>
            )}
          </Button>

          <div className="text-xs text-muted-foreground text-center">
            <span className="text-destructive">*</span> Required field • All other fields optional but recommended for better accuracy
          </div>
        </div>
      </TooltipProvider>
    </Card>
  );
};

export default ComprehensiveSearchForm;
