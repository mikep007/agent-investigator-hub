import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GraphRequest {
  person_id?: string;
  person?: any;
  depth?: number;
  include_addresses?: boolean;
  include_shared_data?: boolean;
}

interface GraphNode {
  id: string;
  type: 'person' | 'address' | 'phone' | 'email';
  data: any;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const graphRequest: GraphRequest = await req.json();
    console.log('[person-graph-graph] Graph request:', JSON.stringify(graphRequest));

    const { 
      person_id, 
      person,
      depth = 2, 
      include_addresses = true,
      include_shared_data = true
    } = graphRequest;

    if (!person && !person_id) {
      return new Response(
        JSON.stringify({ error: 'Either person_id or person object required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let centerPerson = person;

    // Fetch person if only ID provided
    if (person_id && !person) {
      const { data: cachedPerson } = await supabase
        .from('persons')
        .select('*')
        .eq('id', person_id)
        .single();
      
      centerPerson = cachedPerson;
    }

    if (!centerPerson) {
      return new Response(
        JSON.stringify({ error: 'Person not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const processedPersonIds = new Set<string>();

    // Add center person as first node
    const centerNodeId = centerPerson.id || `person_${crypto.randomUUID().slice(0, 8)}`;
    nodes.push({
      id: centerNodeId,
      type: 'person',
      data: formatPersonForGraph(centerPerson)
    });
    processedPersonIds.add(centerNodeId);

    // Process relatives at depth 1
    await processRelatives(
      centerPerson,
      centerNodeId,
      nodes,
      edges,
      processedPersonIds,
      supabase,
      1,
      depth
    );

    // Add addresses as nodes if requested
    if (include_addresses && centerPerson.addresses) {
      for (const address of centerPerson.addresses) {
        const addrNodeId = address.id || `addr_${crypto.randomUUID().slice(0, 8)}`;
        
        nodes.push({
          id: addrNodeId,
          type: 'address',
          data: address
        });
        
        edges.push({
          id: `edge_${centerNodeId}_${addrNodeId}`,
          source: centerNodeId,
          target: addrNodeId,
          relationship: {
            type: 'lives_at',
            is_current: address.is_current,
            from_year: address.from_year,
            to_year: address.to_year
          }
        });

        // Check for shared addresses with relatives
        if (include_shared_data) {
          await findSharedAddressConnections(
            address,
            addrNodeId,
            nodes,
            edges,
            processedPersonIds,
            centerPerson
          );
        }
      }
    }

    // Add phones and emails as nodes for connection discovery
    if (include_shared_data) {
      if (centerPerson.phones) {
        for (const phone of centerPerson.phones) {
          const phoneNodeId = `phone_${phone.number?.replace(/\D/g, '') || crypto.randomUUID().slice(0, 8)}`;
          
          if (!nodes.find(n => n.id === phoneNodeId)) {
            nodes.push({
              id: phoneNodeId,
              type: 'phone',
              data: phone
            });
          }
          
          edges.push({
            id: `edge_${centerNodeId}_${phoneNodeId}`,
            source: centerNodeId,
            target: phoneNodeId,
            relationship: { type: 'has_phone', is_current: phone.is_current }
          });
        }
      }

      if (centerPerson.emails) {
        for (const email of centerPerson.emails) {
          const emailNodeId = `email_${email.address?.replace(/[^a-zA-Z0-9]/g, '_') || crypto.randomUUID().slice(0, 8)}`;
          
          if (!nodes.find(n => n.id === emailNodeId)) {
            nodes.push({
              id: emailNodeId,
              type: 'email',
              data: email
            });
          }
          
          edges.push({
            id: `edge_${centerNodeId}_${emailNodeId}`,
            source: centerNodeId,
            target: emailNodeId,
            relationship: { type: 'has_email', is_current: email.is_current }
          });
        }
      }
    }

    // Calculate relationship statistics
    const stats = calculateGraphStats(nodes, edges, centerNodeId);

    const response = {
      nodes,
      edges,
      center_person_id: centerNodeId,
      depth,
      statistics: stats
    };

    console.log(`[person-graph-graph] Generated graph with ${nodes.length} nodes and ${edges.length} edges`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[person-graph-graph] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processRelatives(
  person: any,
  personNodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  processedPersonIds: Set<string>,
  supabase: any,
  currentDepth: number,
  maxDepth: number
): Promise<void> {
  if (currentDepth > maxDepth) return;

  const relatives = [
    ...(person.relatives || []),
    ...(person.enriched_relatives?.map((r: any) => r.original_name) || []),
    ...(person.potential_relatives?.map((r: any) => r.name) || [])
  ];

  const uniqueRelatives = [...new Set(relatives)];

  for (const relativeName of uniqueRelatives.slice(0, 10)) {
    const relativeId = `person_${relativeName.replace(/\s+/g, '_').toLowerCase()}`;
    
    if (processedPersonIds.has(relativeId)) {
      // Just add edge if person already exists
      if (!edges.find(e => 
        (e.source === personNodeId && e.target === relativeId) ||
        (e.source === relativeId && e.target === personNodeId)
      )) {
        edges.push({
          id: `edge_${personNodeId}_${relativeId}`,
          source: personNodeId,
          target: relativeId,
          relationship: inferRelationship(person, relativeName)
        });
      }
      continue;
    }

    // Find enriched data for this relative
    const enrichedRelative = person.enriched_relatives?.find(
      (r: any) => r.original_name === relativeName
    );

    const relativeData = enrichedRelative?.matched_persons?.[0] || {
      id: relativeId,
      name: parseName(relativeName),
      source: 'known_relative',
      confidence: 0.5
    };

    const relativeNodeId = relativeData.id || relativeId;
    
    nodes.push({
      id: relativeNodeId,
      type: 'person',
      data: formatPersonForGraph(relativeData)
    });
    processedPersonIds.add(relativeNodeId);

    // Add relationship edge
    edges.push({
      id: `edge_${personNodeId}_${relativeNodeId}`,
      source: personNodeId,
      target: relativeNodeId,
      relationship: inferRelationship(person, relativeName, enrichedRelative)
    });

    // Recursively process relatives if we have enriched data and haven't hit max depth
    if (enrichedRelative?.matched_persons?.[0] && currentDepth < maxDepth) {
      await processRelatives(
        enrichedRelative.matched_persons[0],
        relativeNodeId,
        nodes,
        edges,
        processedPersonIds,
        supabase,
        currentDepth + 1,
        maxDepth
      );
    }
  }
}

async function findSharedAddressConnections(
  address: any,
  addressNodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  processedPersonIds: Set<string>,
  centerPerson: any
): Promise<void> {
  // Check if any known relatives share this address
  const potentialResidents = centerPerson.potential_relatives?.filter(
    (r: any) => r.source === 'property_records'
  ) || [];

  for (const resident of potentialResidents) {
    const residentId = `person_${resident.name.replace(/\s+/g, '_').toLowerCase()}`;
    
    if (!processedPersonIds.has(residentId)) {
      nodes.push({
        id: residentId,
        type: 'person',
        data: {
          name: parseName(resident.name),
          source: 'property_records',
          relationship_type: resident.relationship_type,
          confidence: resident.confidence
        }
      });
      processedPersonIds.add(residentId);
    }

    // Add edge from resident to address
    if (!edges.find(e => e.source === residentId && e.target === addressNodeId)) {
      edges.push({
        id: `edge_${residentId}_${addressNodeId}`,
        source: residentId,
        target: addressNodeId,
        relationship: {
          type: 'lives_at',
          source: 'property_records',
          is_current: address.is_current
        }
      });
    }
  }
}

function inferRelationship(person: any, relativeName: string, enrichedData?: any): any {
  const relationship: any = {
    relationship_type: 'relative',
    relationship_direction: 'bidirectional',
    sources: ['known_input'],
    score: {
      relationship_confidence: 0.5,
      co_residence_years: 0,
      co_residence_addresses: 0,
      multi_source_confirmed: false
    },
    timeline: {
      first_seen_year: null,
      last_seen_year: new Date().getFullYear()
    }
  };

  // Check if we have potential relative data with relationship type
  const potentialRel = person.potential_relatives?.find(
    (r: any) => r.name?.toLowerCase() === relativeName.toLowerCase()
  );

  if (potentialRel) {
    relationship.relationship_type = potentialRel.relationship_type || 'relative';
    relationship.sources.push(potentialRel.source);
    relationship.score.relationship_confidence = potentialRel.confidence || 0.5;
  }

  // Boost confidence if we have enriched data
  if (enrichedData?.matched_persons?.length > 0) {
    relationship.score.relationship_confidence = Math.min(
      relationship.score.relationship_confidence + 0.2,
      0.95
    );
    relationship.score.multi_source_confirmed = true;
    relationship.sources.push('enriched_search');
  }

  // Check for shared addresses
  if (enrichedData?.matched_persons?.[0]?.addresses) {
    const personAddresses = person.addresses || [];
    const relativeAddresses = enrichedData.matched_persons[0].addresses || [];
    
    const sharedAddresses = personAddresses.filter((pa: any) =>
      relativeAddresses.some((ra: any) =>
        pa.street?.toLowerCase() === ra.street?.toLowerCase() &&
        pa.city?.toLowerCase() === ra.city?.toLowerCase()
      )
    );

    if (sharedAddresses.length > 0) {
      relationship.score.co_residence_addresses = sharedAddresses.length;
      relationship.score.relationship_confidence = Math.min(
        relationship.score.relationship_confidence + 0.15,
        0.95
      );
    }
  }

  // Try to infer relationship type from name patterns
  if (relationship.relationship_type === 'relative') {
    const personLastName = person.name?.last?.toLowerCase();
    const relativeLastName = relativeName.split(' ').slice(-1)[0]?.toLowerCase();
    
    if (personLastName && relativeLastName && personLastName === relativeLastName) {
      // Same last name - likely sibling, parent, or child
      relationship.relationship_type = 'family_same_surname';
    } else if (personLastName && relativeLastName && personLastName !== relativeLastName) {
      // Different last name - could be spouse, in-law, or married sibling
      relationship.relationship_type = 'family_different_surname';
    }
  }

  return relationship;
}

function formatPersonForGraph(person: any): any {
  return {
    id: person.id,
    name: person.name,
    age_band: person.age_band,
    current_location: person.current_location,
    scores: person.scores,
    source_ids: person.source_ids,
    addresses_count: person.addresses?.length || 0,
    phones_count: person.phones?.length || 0,
    emails_count: person.emails?.length || 0,
    relatives_count: (person.relatives?.length || 0) + 
                     (person.enriched_relatives?.length || 0) + 
                     (person.potential_relatives?.length || 0),
    social_profiles_count: person.social_profiles?.length || 0
  };
}

function parseName(fullName: string): any {
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] || '',
    middle: parts.length > 2 ? parts.slice(1, -1).join(' ') : null,
    last: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

function calculateGraphStats(nodes: GraphNode[], edges: GraphEdge[], centerNodeId: string): any {
  const personNodes = nodes.filter(n => n.type === 'person');
  const addressNodes = nodes.filter(n => n.type === 'address');
  const phoneNodes = nodes.filter(n => n.type === 'phone');
  const emailNodes = nodes.filter(n => n.type === 'email');

  const relationshipEdges = edges.filter(e => 
    e.relationship?.relationship_type && 
    e.relationship.relationship_type !== 'lives_at' &&
    e.relationship.relationship_type !== 'has_phone' &&
    e.relationship.relationship_type !== 'has_email'
  );

  const avgConfidence = relationshipEdges.length > 0
    ? relationshipEdges.reduce((sum, e) => sum + (e.relationship?.score?.relationship_confidence || 0), 0) / relationshipEdges.length
    : 0;

  const sharedAddresses = edges.filter(e => 
    e.relationship?.type === 'lives_at'
  ).reduce((acc, edge) => {
    if (!acc[edge.target]) acc[edge.target] = [];
    acc[edge.target].push(edge.source);
    return acc;
  }, {} as Record<string, string[]>);

  const addressesWithMultipleResidents = Object.values(sharedAddresses).filter(
    residents => residents.length > 1
  ).length;

  return {
    total_nodes: nodes.length,
    person_count: personNodes.length,
    address_count: addressNodes.length,
    phone_count: phoneNodes.length,
    email_count: emailNodes.length,
    relationship_count: relationshipEdges.length,
    average_relationship_confidence: Math.round(avgConfidence * 100) / 100,
    shared_addresses: addressesWithMultipleResidents,
    graph_density: edges.length / Math.max(nodes.length * (nodes.length - 1) / 2, 1)
  };
}
