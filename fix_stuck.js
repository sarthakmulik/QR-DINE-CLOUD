const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fix() {
  console.log('Starting fix...');
  
  const { data: intents, error } = await supabase
    .from('payment_intents')
    .select('id, session_id, table_sessions!inner(id, status)')
    .eq('status', 'PENDING')
    .eq('table_sessions.status', 'open');
    
  if (error) {
    console.error('Error fetching intents:', error);
    return;
  }
  
  console.log('Found stuck intents:', intents.length);
  
  for (const intent of intents) {
    console.log('Fixing session:', intent.session_id);
    const { error: updateErr } = await supabase
      .from('table_sessions')
      .update({ status: 'checkout_initiated' })
      .eq('id', intent.session_id);
      
    if (updateErr) console.error('Update error:', updateErr);
  }
  
  console.log('Fix complete.');
}
fix();