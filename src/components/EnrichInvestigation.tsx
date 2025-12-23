import { useState, useEffect } from 'react';
import { RefreshCw, User, Mail, AtSign, Users, ChevronDown, ChevronUp, Sparkles, Plus, X, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DiscoveredData {
  usernames: string[];
  emails: string[];
  phones: string[];
  relatives: string[];
}

interface ManualEntry {
  type: 'username' | 'email' | 'phone' | 'relative';
  value: string;
}

interface EnrichInvestigationProps {
  findings: any[];
  originalSearchData: {
    fullName?: string;
    email?: string;
    phone?: string;
    username?: string;
  };
  onRerun: (enrichedData: {
    fullName?: string;
    email?: string;
    phone?: string;
    username?: string;
    additionalUsernames?: string[];
    additionalEmails?: string[];
  }) => void;
}

// Parse bulk input (comma, newline, semicolon, or space separated)
const parseBulkInput = (input: string): string[] => {
  return input
    .split(/[,;\n\r\t]+/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
};

const EnrichInvestigation = ({ findings, originalSearchData, onRerun }: EnrichInvestigationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredData>({
    usernames: [],
    emails: [],
    phones: [],
    relatives: [],
  });
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedRelatives, setSelectedRelatives] = useState<string[]>([]);
  
  // Manual input state
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [newEntryType, setNewEntryType] = useState<ManualEntry['type']>('username');
  const [newEntryValue, setNewEntryValue] = useState('');

  // Extract discovered data from findings
  useEffect(() => {
    const usernames = new Set<string>();
    const emails = new Set<string>();
    const phones = new Set<string>();
    const relatives = new Set<string>();

    findings.forEach((finding) => {
      const data = finding.data;

      // Extract from social profiles
      if (data?.profiles) {
        data.profiles.forEach((profile: any) => {
          if (profile.username && profile.username !== originalSearchData.username) {
            usernames.add(profile.username);
          }
        });
      }

      // Extract from sherlock results
      if (data?.foundPlatforms) {
        data.foundPlatforms.forEach((platform: any) => {
          if (platform.username && platform.username !== originalSearchData.username) {
            usernames.add(platform.username);
          }
        });
      }

      // Extract emails from web results
      if (data?.items) {
        data.items.forEach((item: any) => {
          if (item.hasEmail && item.snippet) {
            const emailMatches = item.snippet.match(/[\w.-]+@[\w.-]+\.\w+/g);
            if (emailMatches) {
              emailMatches.forEach((email: string) => {
                if (email !== originalSearchData.email) {
                  emails.add(email.toLowerCase());
                }
              });
            }
          }
        });
      }

      // Extract relatives
      if (data?.potentialRelatives) {
        data.potentialRelatives.forEach((rel: any) => {
          const name = typeof rel === 'string' ? rel : rel.name;
          if (name && name !== originalSearchData.fullName) {
            relatives.add(name);
          }
        });
      }

      // Extract from discovered relatives in web search
      if (data?.discoveredRelatives) {
        data.discoveredRelatives.forEach((rel: string) => {
          if (rel !== originalSearchData.fullName) {
            relatives.add(rel);
          }
        });
      }
    });

    setDiscovered({
      usernames: Array.from(usernames).slice(0, 10),
      emails: Array.from(emails).slice(0, 10),
      phones: Array.from(phones).slice(0, 10),
      relatives: Array.from(relatives).slice(0, 10),
    });
  }, [findings, originalSearchData]);

  // Get manual entries by type
  const manualUsernames = manualEntries.filter(e => e.type === 'username').map(e => e.value);
  const manualEmails = manualEntries.filter(e => e.type === 'email').map(e => e.value);
  const manualRelatives = manualEntries.filter(e => e.type === 'relative').map(e => e.value);

  const totalDiscovered = 
    discovered.usernames.length + 
    discovered.emails.length + 
    discovered.relatives.length +
    manualEntries.length;

  const totalSelected = 
    selectedUsernames.length + 
    selectedEmails.length + 
    selectedRelatives.length;

  // Allow component to show if there are manual entries even if no discoveries
  const hasContent = totalDiscovered > 0 || manualEntries.length > 0;

  const handleRerun = () => {
    // Combine discovered selections with manual entries
    const allUsernames = [...selectedUsernames, ...manualUsernames];
    const allEmails = [...selectedEmails, ...manualEmails];
    const allRelatives = [...selectedRelatives, ...manualRelatives];

    onRerun({
      ...originalSearchData,
      additionalUsernames: allUsernames,
      additionalEmails: allEmails,
      // If a relative is selected, use them as the primary name
      fullName: allRelatives.length > 0 
        ? allRelatives[0] 
        : originalSearchData.fullName,
    });
  };

  const toggleUsername = (username: string) => {
    setSelectedUsernames(prev => 
      prev.includes(username) 
        ? prev.filter(u => u !== username)
        : [...prev, username]
    );
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  const toggleRelative = (relative: string) => {
    setSelectedRelatives(prev => 
      prev.includes(relative) 
        ? prev.filter(r => r !== relative)
        : [...prev, relative]
    );
  };

  const addManualEntry = () => {
    const trimmedValue = newEntryValue.trim();
    if (!trimmedValue) return;

    // Parse for bulk input (comma, newline, semicolon separated)
    const values = parseBulkInput(trimmedValue);
    
    const newEntries: ManualEntry[] = [];
    values.forEach(value => {
      // Check for duplicates
      const isDuplicate = manualEntries.some(
        e => e.type === newEntryType && e.value.toLowerCase() === value.toLowerCase()
      ) || newEntries.some(
        e => e.type === newEntryType && e.value.toLowerCase() === value.toLowerCase()
      );
      
      if (!isDuplicate && value.length > 0) {
        newEntries.push({ type: newEntryType, value });
      }
    });

    if (newEntries.length > 0) {
      setManualEntries(prev => [...prev, ...newEntries]);
    }
    setNewEntryValue('');
  };

  const removeManualEntry = (index: number) => {
    setManualEntries(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addManualEntry();
    }
  };

  // Handle paste event for bulk input
  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    const values = parseBulkInput(pastedText);
    
    // If multiple values detected, prevent default and handle bulk
    if (values.length > 1) {
      e.preventDefault();
      
      const newEntries: ManualEntry[] = [];
      values.forEach(value => {
        const isDuplicate = manualEntries.some(
          entry => entry.type === newEntryType && entry.value.toLowerCase() === value.toLowerCase()
        ) || newEntries.some(
          entry => entry.type === newEntryType && entry.value.toLowerCase() === value.toLowerCase()
        );
        
        if (!isDuplicate && value.length > 0) {
          newEntries.push({ type: newEntryType, value });
        }
      });

      if (newEntries.length > 0) {
        setManualEntries(prev => [...prev, ...newEntries]);
      }
      setNewEntryValue('');
    }
  };

  const getTypeIcon = (type: ManualEntry['type']) => {
    switch (type) {
      case 'username': return <AtSign className="w-3 h-3" />;
      case 'email': return <Mail className="w-3 h-3" />;
      case 'phone': return <User className="w-3 h-3" />;
      case 'relative': return <Users className="w-3 h-3" />;
    }
  };

  const getTypePlaceholder = (type: ManualEntry['type']) => {
    switch (type) {
      case 'username': return 'Enter username...';
      case 'email': return 'Enter email address...';
      case 'phone': return 'Enter phone number...';
      case 'relative': return 'Enter name...';
    }
  };

  // Always show component (to allow manual input even without discoveries)
  return (
    <Card className="bg-card/80 backdrop-blur border-primary/20 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full flex items-center justify-between p-4 h-auto hover:bg-primary/5"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-medium text-sm">Enrich & Re-run Investigation</h3>
                <p className="text-xs text-muted-foreground">
                  {totalDiscovered > 0 
                    ? `${totalDiscovered} data points available` 
                    : 'Add data points manually'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {totalDiscovered > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalDiscovered} found
                </Badge>
              )}
              {manualEntries.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  +{manualEntries.length} manual
                </Badge>
              )}
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {/* Manual Input Section */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Plus className="w-4 h-4 text-primary" />
                <span>Add Data Point Manually</span>
              </div>
              <div className="flex gap-2">
                <Select value={newEntryType} onValueChange={(v) => setNewEntryType(v as ManualEntry['type'])}>
                  <SelectTrigger className="w-[130px] h-9 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border z-50">
                    <SelectItem value="username">Username</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="relative">Name</SelectItem>
                  </SelectContent>
                </Select>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-1 relative">
                        <Input
                          value={newEntryValue}
                          onChange={(e) => setNewEntryValue(e.target.value)}
                          onKeyPress={handleKeyPress}
                          onPaste={handlePaste}
                          placeholder={getTypePlaceholder(newEntryType)}
                          className="flex-1 h-9 bg-background pr-8"
                        />
                        <ClipboardPaste className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-popover border border-border">
                      <p className="text-xs">Supports bulk paste: comma, newline, or semicolon separated</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button 
                  size="sm"
                  onClick={addManualEntry}
                  disabled={!newEntryValue.trim()}
                  className="h-9 px-3"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Display Manual Entries */}
              {manualEntries.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {manualEntries.map((entry, index) => (
                    <div
                      key={`${entry.type}-${entry.value}-${index}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs"
                    >
                      {getTypeIcon(entry.type)}
                      <span>{entry.value}</span>
                      <button
                        onClick={() => removeManualEntry(index)}
                        className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 transition-colors"
                      >
                        <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discovered Usernames */}
            {discovered.usernames.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <AtSign className="w-4 h-4" />
                  <span>Discovered Usernames</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {discovered.usernames.map((username) => (
                    <label 
                      key={username}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedUsernames.includes(username)}
                        onCheckedChange={() => toggleUsername(username)}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs">{username}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered Emails */}
            {discovered.emails.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span>Discovered Emails</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {discovered.emails.map((email) => (
                    <label 
                      key={email}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedEmails.includes(email)}
                        onCheckedChange={() => toggleEmail(email)}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs">{email}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered Relatives */}
            {discovered.relatives.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>Discovered Relatives/Associates</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {discovered.relatives.map((relative) => (
                    <label 
                      key={relative}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedRelatives.includes(relative)}
                        onCheckedChange={() => toggleRelative(relative)}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs">{relative}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Re-run Button */}
            <div className="pt-2 border-t border-border">
              <Button
                onClick={handleRerun}
                disabled={totalSelected === 0 && manualEntries.length === 0}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-run with {totalSelected + manualEntries.length} Item{(totalSelected + manualEntries.length) !== 1 ? 's' : ''}
              </Button>
              {totalSelected === 0 && manualEntries.length === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Select items above or add data manually to include in re-run
                </p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default EnrichInvestigation;
