const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  // Find an open session
  const { data: sessions } = await supabase.from('table_sessions').select('*').eq('status', 'open').limit(1);
  if (!sessions || sessions.length === 0) {
    console.log('No open sessions to test');
    return;
  }
  
  const session = sessions[0];
  console.log('Testing on session:', session.id);
  
  const clientMutationId = crypto.randomUUID();
  
  const { data, error } = await supabase.rpc('atomic_initiate_checkout', {
    p_client_mutation_id: clientMutationId,
    p_session_id: session.id,
    p_hotel_id: session.hotel_id
  });
  
  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Success:', data);
  }
  
  // Check the session status
  const { data: updatedSession } = await supabase.from('table_sessions').select('status').eq('id', session.id).single();
  console.log('Updated session status:', updatedSession.status);
}
test();