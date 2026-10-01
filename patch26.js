const fs = require('fs');
const file = 'src/lib/session-service.ts';
let content = fs.readFileSync(file, 'utf8');

const target = \  // 1. Auto-collect ready orders forgotten for 5 mins
  await sb.from("table_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("hotel_id", hotelId)
    .eq("status", "ready_for_pickup")
    .lt("start_time", fiveMinsAgo);\;

content = content.replace(target, "");
fs.writeFileSync(file, content);
