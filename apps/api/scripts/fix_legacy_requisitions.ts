
import { supabase } from '../src/lib/supabase';

async function fixLegacyRequisitions() {
  console.log('--- [Legacy Requisitions Repair] Starting ---');

  // 0. Check total count
  const { data: orgData } = await supabase.from('organizations').select('id, name');
  const orgNameMap: Record<string, string> = {};
  orgData?.forEach((o: any) => orgNameMap[o.id] = o.name);
  console.log('Available Organizations:', JSON.stringify(orgNameMap, null, 2));

  const { data: userData, error: userFetchError } = await supabase
    .from('users')
    .select('id, name, role, organization_id');
  
  if (userFetchError) {
    console.error('Error fetching users:', userFetchError);
  } else {
    const userGroups: Record<string, any[]> = {};
    userData?.forEach((u: any) => {
        const key = orgNameMap[u.organization_id] || 'NULL';
        if (!userGroups[key]) userGroups[key] = [];
        userGroups[key].push({ name: u.name, role: u.role });
    });
    console.log('Users per organization:', JSON.stringify(userGroups, null, 2));
  }

  // 1. Fetch all requisitions that are missing organization_id
  const { data: orphanedReqs, error: fetchError } = await supabase
    .from('requisitions')
    .select('id, requestor_id, description')
    .is('organization_id', null);

  if (fetchError) {
    console.error('Error fetching requisitions:', fetchError);
    return;
  }

  if (!orphanedReqs || (orphanedReqs as any[]).length === 0) {
    console.log('No orphaned requisitions found. Everything looks good!');
    return;
  }

  console.log(`Found ${(orphanedReqs as any[]).length} requisitions missing organization_id.`);

  // 2. Map of requestor to their organization (to avoid repeated lookups)
  const userOrgMap: Record<string, string> = {};

  // Get all unique requestor IDs
  const requestorIds = [...new Set((orphanedReqs as any[]).map((r: any) => r.requestor_id))];
  
  // 3. Fetch organization info for these users
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, organization_id')
    .in('id', requestorIds);

  if (userError) {
    console.error('Error fetching users:', userError);
    return;
  }

  (users as any[])?.forEach((u: any) => {
    if (u.organization_id) {
      userOrgMap[u.id] = u.organization_id;
    }
  });

  // 4. Get a fallback organization just in case
  let fallbackOrgId: string | null = null;
  const { data: firstOrg } = await supabase.from('organizations').select('id').limit(1).maybeSingle();
  if (firstOrg) {
    fallbackOrgId = (firstOrg as any).id;
    console.log(`Fallback organization identified: ${fallbackOrgId}`);
  }

  // 5. Update each requisition
  console.log('Updating records...');
  let fixedCount = 0;
  let skippedCount = 0;

  for (const req of (orphanedReqs as any[])) {
    const orgId = userOrgMap[req.requestor_id] || fallbackOrgId;

    if (!orgId) {
      console.warn(`[SKIP] No organization found for user ${req.requestor_id} and no fallback available for ${req.id}`);
      skippedCount++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('requisitions')
      .update({ organization_id: orgId })
      .eq('id', req.id);

    if (updateError) {
      console.error(`[FAIL] Failed to update requisition ${req.id}:`, updateError.message);
    } else {
      fixedCount++;
    }
  }

  console.log('--- [Repair Complete] ---');
  console.log(`Successfully fixed: ${fixedCount}`);
  console.log(`Skipped: ${skippedCount}`);
}

fixLegacyRequisitions().catch(err => console.error('Unhandled error during repair:', err));
