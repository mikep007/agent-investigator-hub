import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCircle, Search, Target, TrendingUp, Shield, Zap } from "lucide-react";

export const SearchHelpModal = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <HelpCircle className="w-4 h-4" />
          Search Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            OSINT Investigation Guide
          </DialogTitle>
          <DialogDescription>
            Learn how to get the most accurate results from your investigations
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
            <TabsTrigger value="techniques">Techniques</TabsTrigger>
            <TabsTrigger value="confidence">Confidence</TabsTrigger>
            <TabsTrigger value="tips">Best Practices</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] w-full pr-4">
            <TabsContent value="overview" className="space-y-4 mt-4">
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  How OSINT Investigations Work
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Our system performs comprehensive Open Source Intelligence (OSINT) investigations 
                  by searching across multiple data sources simultaneously and correlating findings 
                  to build a complete digital profile.
                </p>
                
                <div className="space-y-3">
                  <div className="border-l-2 border-primary pl-4">
                    <h4 className="font-medium">Multi-Agent Architecture</h4>
                    <p className="text-sm text-muted-foreground">
                      Each investigation deploys specialized agents that search different sources:
                      web searches, social media platforms, breach databases, email verification, 
                      username enumeration, and phone lookups.
                    </p>
                  </div>

                  <div className="border-l-2 border-primary pl-4">
                    <h4 className="font-medium">Cross-Referencing</h4>
                    <p className="text-sm text-muted-foreground">
                      Results are cross-referenced across multiple data points. When the same 
                      information appears in multiple sources, confidence scores increase automatically.
                    </p>
                  </div>

                  <div className="border-l-2 border-primary pl-4">
                    <h4 className="font-medium">Real-Time Processing</h4>
                    <p className="text-sm text-muted-foreground">
                      All searches run in parallel for maximum speed. Results appear as they're 
                      discovered, and you can view findings while the investigation is still running.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="parameters" className="space-y-4 mt-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Search Parameters Explained</h3>
                
                <div className="space-y-4">
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Full Name</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      The target's full name triggers web searches, social media profile discovery, 
                      and address searches. Our system automatically uses exact phrase matching.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Example:</strong> "John Smith" searches for that exact phrase
                    </p>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Email Address</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Searches breach databases (LeakCheck), verifies account registrations across 
                      120+ platforms (Holehe), performs web searches, and derives username from local-part.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Triggers:</strong> Holehe, LeakCheck, Web Search, Sherlock (on derived username)
                    </p>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Phone Number</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Analyzes phone format, estimates carrier/country, checks breach databases, 
                      and identifies VoIP/toll-free numbers.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Format:</strong> Minimum 10 digits, supports +, -, (), and spaces
                    </p>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Username</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Searches for username across 400+ social media platforms and websites using 
                      Sherlock and checks breach databases.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Requirements:</strong> 3-30 characters, letters/numbers/dots/underscores/hyphens only
                    </p>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Address / Location</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Performs address-specific searches and boosts confidence when location co-occurs 
                      with name in search results (+30% confidence boost).
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Tip:</strong> Include city and state for best results
                    </p>
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">Keywords / Associated Terms</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Additional context like company names, nicknames, hobbies, or affiliations 
                      that help filter and verify results.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Example:</strong> "marathon runner, Spartan Race, Nike employee"
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="techniques" className="space-y-4 mt-4">
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Advanced Search Techniques
                </h3>

                <div className="space-y-4">
                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold mb-2">Google Dork Queries</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Full names are automatically wrapped in quotes for exact phrase matching. 
                      When address data is provided, we add location context using OR operators.
                    </p>
                    <div className="bg-background/50 p-2 rounded text-xs font-mono">
                      "John Smith" ("New York" OR "NY")
                    </div>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold mb-2">Username Enumeration</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Sherlock checks 400+ platforms for username availability. Social media searches 
                      verify active profiles by checking profile URLs.
                    </p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold mb-2">Email Account Discovery</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Holehe verifies registration across 120+ platforms (Discord, Instagram, Netflix, 
                      Amazon, etc.) without triggering account notifications.
                    </p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold mb-2">Breach Database Checking</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      LeakCheck searches for emails, usernames, and phone numbers in data breaches, 
                      showing which services were compromised and when.
                    </p>
                  </div>

                  <div className="border-l-4 border-primary pl-4">
                    <h4 className="font-semibold mb-2">Location Correlation</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      When name and location appear together in results, confidence scores receive 
                      a significant boost (+30%) indicating higher reliability.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="confidence" className="space-y-4 mt-4">
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Understanding Confidence Scores
                </h3>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Confidence scores are algorithmic calculations based on cross-referencing 
                      and data correlation. They're different from manual verification status.
                    </p>
                  </div>

                  <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                      High Confidence (70-100%)
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Multiple data points align (e.g., name + location in same result, or 
                      same email found in multiple breaches). These findings are highly reliable.
                    </p>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
                    <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
                      Medium Confidence (40-69%)
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Single data point matches or partial correlation. Results may be accurate 
                      but require additional verification.
                    </p>
                  </div>

                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg">
                    <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                      Low Confidence (0-39%)
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Weak or no correlation with provided data points. May be false positives 
                      or require manual review to determine relevance.
                    </p>
                  </div>

                  <div className="border-l-4 border-primary pl-4 mt-6">
                    <h4 className="font-semibold mb-2">Confidence Boosters</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Name + Location co-occurrence: +30%</li>
                      <li>• Name match only: +10%</li>
                      <li>• Multiple keyword matches: Variable boost</li>
                      <li>• Found in multiple sources: Cumulative boost</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tips" className="space-y-4 mt-4">
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Best Practices & Tips
                </h3>

                <div className="space-y-4">
                  <div className="bg-primary/10 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">✓ Provide Multiple Data Points</h4>
                    <p className="text-sm text-muted-foreground">
                      The more parameters you provide, the more accurate the results. Combining 
                      name + email + location yields much better results than name alone.
                    </p>
                  </div>

                  <div className="bg-primary/10 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">✓ Use Full, Accurate Names</h4>
                    <p className="text-sm text-muted-foreground">
                      Enter complete names (first and last) for best results. Nicknames or partial 
                      names may work but will return less accurate matches.
                    </p>
                  </div>

                  <div className="bg-primary/10 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">✓ Add Location Context</h4>
                    <p className="text-sm text-muted-foreground">
                      Include city and state in the address field. This significantly boosts 
                      confidence when results show name + location together.
                    </p>
                  </div>

                  <div className="bg-primary/10 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">✓ Use Keywords Strategically</h4>
                    <p className="text-sm text-muted-foreground">
                      Add company names, hobbies, interests, or affiliations. These help filter 
                      out false positives and confirm correct target identification.
                    </p>
                  </div>

                  <div className="bg-primary/10 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">✓ Verify High-Priority Findings</h4>
                    <p className="text-sm text-muted-foreground">
                      Use the manual verification system to mark findings as Verified, Needs Review, 
                      or Inaccurate. This helps organize your investigation results.
                    </p>
                  </div>

                  <div className="bg-primary/10 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">✓ Check Related Persons</h4>
                    <p className="text-sm text-muted-foreground">
                      The AI investigative assistant may suggest related individuals (spouses, 
                      business partners). Consider investigating them to expand your network map.
                    </p>
                  </div>

                  <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">✗ Common Mistakes to Avoid</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Don't add quotes around names manually (system does it automatically)</li>
                      <li>• Don't use only common names without additional context</li>
                      <li>• Don't ignore low-confidence results (they may still be relevant)</li>
                      <li>• Don't skip the breach database results (critical security intel)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
