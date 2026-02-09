import { useState } from "react";
import ActiveInvestigationBanner from "@/components/ActiveInvestigationBanner";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Mail, Phone, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import SelectorEnrichmentResults from "@/components/results/SelectorEnrichmentResults";

interface ModuleResult {
  platform: string;
  exists: boolean;
  responseTime: number;
  username?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  bio?: string | null;
  joinDate?: string | null;
  location?: string | null;
  details: Record<string, unknown>;
  error: string | null;
}

interface EnrichmentData {
  selector: string;
  selectorType: 'email' | 'phone' | 'unknown';
  results: ModuleResult[];
  summary: {
    totalChecked: number;
    accountsFound: number;
    errors: number;
  };
  timestamp: string;
}

export default function SelectorEnrichment() {
  const [selectorType, setSelectorType] = useState<"email" | "phone">("email");
  const [selector, setSelector] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [enrichmentData, setEnrichmentData] = useState<EnrichmentData | null>(null);
  const [searchedSelector, setSearchedSelector] = useState("");

  const handleSearch = async () => {
    if (!selector.trim()) {
      toast.error("Please enter an email or phone number");
      return;
    }

    // Basic validation
    if (selectorType === "email" && !selector.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (selectorType === "phone" && !/^\+?[\d\s-]{7,}$/.test(selector)) {
      toast.error("Please enter a valid phone number");
      return;
    }

    setIsSearching(true);
    setEnrichmentData(null);
    setSearchedSelector(selector);

    try {
      const { data, error } = await supabase.functions.invoke("osint-selector-enrichment", {
        body: {
          selector: selector.trim(),
          selectorType,
        },
      });

      if (error) throw error;

      if (data?.results) {
        const foundCount = data.results.filter((r: ModuleResult) => r.exists).length;
        setEnrichmentData({
          selector: selector.trim(),
          selectorType,
          results: data.results,
          summary: {
            totalChecked: data.results.length,
            accountsFound: foundCount,
            errors: data.results.filter((r: ModuleResult) => r.error).length,
          },
          timestamp: new Date().toISOString(),
        });
        toast.success(`Found ${foundCount} accounts across ${data.results.length} platforms`);
      }
    } catch (error) {
      console.error("Enrichment error:", error);
      toast.error("Failed to run enrichment check");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSearching) {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">Selector Enrichment</h1>
              </div>
            </div>
            <Badge variant="secondary" className="hidden sm:flex">
              80+ Platforms
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 pt-4">
        <ActiveInvestigationBanner />
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search Card */}
        <Card className="max-w-2xl mx-auto mb-8">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Check Any Email or Phone</CardTitle>
            <CardDescription>
              Instantly check if an email or phone number exists across 80+ platforms including 
              social media, messaging apps, gaming, dating, e-commerce, and more.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Selector Type Tabs */}
            <Tabs value={selectorType} onValueChange={(v) => setSelectorType(v as "email" | "phone")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="phone" className="gap-2">
                  <Phone className="h-4 w-4" />
                  Phone
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="email" className="mt-4">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Enter email address..."
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSearching}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={isSearching}>
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Search</span>
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="phone" className="mt-4">
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="Enter phone number (e.g., +1234567890)..."
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSearching}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={isSearching}>
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Search</span>
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {/* Platform Categories Preview */}
            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2">Platforms checked include:</p>
              <div className="flex flex-wrap gap-1">
                {["Social", "Messaging", "Fitness", "Dating", "Gaming", "E-commerce", "Business"].map((cat) => (
                  <Badge key={cat} variant="outline" className="text-xs">
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isSearching && (
          <Card className="max-w-4xl mx-auto">
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Checking 80+ Platforms...</h3>
              <p className="text-muted-foreground">
                Searching for <span className="font-mono text-foreground">{selector}</span>
              </p>
              <div className="mt-4 flex justify-center gap-2">
                {["Microsoft", "GitHub", "Spotify", "Discord", "Steam", "PayPal"].map((p, i) => (
                  <Badge 
                    key={p} 
                    variant="secondary" 
                    className="animate-pulse"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {!isSearching && enrichmentData && (
          <div className="max-w-7xl mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Results for <span className="font-mono text-primary">{searchedSelector}</span>
              </h2>
              <Button variant="outline" size="sm" onClick={() => setEnrichmentData(null)}>
                New Search
              </Button>
            </div>
            <SelectorEnrichmentResults data={enrichmentData} />
          </div>
        )}

        {/* Empty State */}
        {!isSearching && !enrichmentData && (
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Enter a Selector to Begin</h3>
            <p className="text-muted-foreground">
              Enter an email address or phone number above to check its presence across 80+ online platforms.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
