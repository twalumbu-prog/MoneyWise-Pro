import { supabase } from './lib/supabase';
import { LencoService } from './services/lenco.service';

async function main() {
  const ref = 'REQ-a8a28ee9-125';
  const orgId = 'fa99669d-6160-44fd-94ac-8ff1f065003f'; // Blue Opus Software

  const { data: org } = await supabase
    .from('organizations')
    .select('lenco_subaccount_id, lenco_secret_key')
    .eq('id', orgId)
    .single();

  console.log('Org Lenco Subaccount ID:', org?.lenco_subaccount_id);
  const secretKey = org?.lenco_secret_key || process.env.LENCO_SECRET_KEY!;

  console.log(`Querying Lenco status for reference: ${ref}`);
  try {
    const status = await LencoService.getTransferStatus(ref, secretKey);
    console.log('Lenco Status Result:', JSON.stringify(status, null, 2));
  } catch (error: any) {
    console.error('Lenco API error:', error.message);
  }
}

main().catch(console.error);
