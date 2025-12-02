export interface ProfileData {
  name: string;
  photo?: string;
  age?: string;
  locations?: string[];
  emails?: string[];
  phones?: string[];
  usernames?: string[];
  relatives?: string[];
}

export interface PlatformAccount {
  platform: string;
  url: string;
  username?: string;
  profileImage?: string;
  verified?: boolean;
  verificationStatus?: 'verified' | 'needs_review' | 'inaccurate';
  lastActivity?: string;
  posts?: number;
  followers?: number;
}

export interface TimelineEvent {
  date: string;
  type: 'account_created' | 'breach' | 'activity' | 'post' | 'mention';
  platform?: string;
  title: string;
  description?: string;
  url?: string;
  icon?: string;
}

export interface IntelligenceSection {
  title: string;
  icon: string;
  items: IntelligenceItem[];
}

export interface IntelligenceItem {
  label: string;
  value: string;
  confidence?: number;
  source?: string;
  url?: string;
  verified?: boolean;
}

export interface FindingData {
  id: string;
  agent_type: string;
  source: string;
  data: any;
  confidence_score?: number;
  verification_status?: 'verified' | 'needs_review' | 'inaccurate';
  created_at: string;
}

export type ViewMode = 'profile' | 'grid' | 'timeline' | 'dossier';
