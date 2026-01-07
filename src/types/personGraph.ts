// Person Graph Core Data Model Types

export interface PersonName {
  first: string;
  middle?: string | null;
  last: string;
  suffix?: string | null;
  aliases?: string[];
}

export interface DateOfBirth {
  year: number | null;
  month: number | null;
  day: number | null;
  confidence: number;
}

export interface Location {
  city: string;
  state: string;
  country: string;
  lat?: number | null;
  lng?: number | null;
  confidence: number;
}

export interface AddressScoreFlags {
  multi_source_confirmed: boolean;
  shared_with_relatives: number;
}

export interface Address {
  id: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  from_year: number | null;
  to_year: number | null;
  is_current: boolean;
  source: string;
  confidence: number;
  score_flags?: AddressScoreFlags;
}

export interface Phone {
  number: string;
  type: 'mobile' | 'landline' | 'voip' | 'unknown';
  is_current: boolean;
  source: string;
  confidence: number;
}

export interface Email {
  address: string;
  is_current: boolean;
  source: string;
  confidence: number;
}

export interface PersonScores {
  overall_confidence: number;
  current_us_presence: number;
  global_presence: number;
}

export interface SourceIds {
  whitepages?: string;
  anywho?: string;
  familytreenow?: string;
  truepeoplesearch?: string;
  fastpeoplesearch?: string;
  social?: string[];
}

export interface Person {
  id: string;
  source_ids: SourceIds;
  name: PersonName;
  dob?: DateOfBirth;
  age_band?: string;
  current_location?: Location;
  addresses: Address[];
  phones: Phone[];
  emails?: Email[];
  scores: PersonScores;
  created_at?: string;
  updated_at?: string;
}

export interface RelationshipScore {
  relationship_confidence: number;
  co_residence_years: number;
  co_residence_addresses: number;
  multi_source_confirmed: boolean;
}

export interface RelationshipTimeline {
  first_seen_year: number | null;
  last_seen_year: number | null;
}

export type RelationshipType = 
  | 'parent' 
  | 'child' 
  | 'sibling' 
  | 'spouse' 
  | 'partner'
  | 'grandparent'
  | 'grandchild'
  | 'aunt_uncle'
  | 'niece_nephew'
  | 'cousin'
  | 'in_law'
  | 'associate'
  | 'roommate'
  | 'unknown';

export type RelationshipDirection = 'bidirectional' | 'subject_to_relative' | 'relative_to_subject';

export interface Relationship {
  id: string;
  subject_id: string;
  relative_id: string;
  relationship_type: RelationshipType;
  relationship_direction: RelationshipDirection;
  sources: string[];
  score: RelationshipScore;
  timeline: RelationshipTimeline;
}

// API Request/Response Types

export interface SearchRequest {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  city?: string;
  state?: string;
  age_range?: { min: number; max: number };
  known_relatives?: string[];
  phone?: string;
  email?: string;
  limit?: number;
}

export interface SearchResponse {
  results: Person[];
  total_count: number;
  sources_queried: string[];
  search_id: string;
}

export interface EnrichRequest {
  person_id?: string;
  person?: Partial<Person>;
  enrich_sources?: string[];
  include_relatives?: boolean;
  include_addresses?: boolean;
  include_phones?: boolean;
  include_emails?: boolean;
}

export interface EnrichResponse {
  person: Person;
  enrichment_sources: string[];
  new_data_found: {
    addresses: number;
    phones: number;
    emails: number;
    relatives: number;
  };
}

export interface GraphRequest {
  person_id: string;
  depth?: number; // How many relationship hops to include
  include_addresses?: boolean;
  include_shared_data?: boolean;
}

export interface GraphNode {
  id: string;
  type: 'person' | 'address' | 'phone' | 'email';
  data: Person | Address | Phone | Email;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: Relationship | { type: 'lives_at' | 'has_phone' | 'has_email' };
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center_person_id: string;
  depth: number;
}
