import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Silently logs critical actions across the platform for the Super Admin audit trail.
 */
export async function logAudit({
  hotelId,
  userId,
  action,
  entityType,
  entityId,
  details = {},
}: {
  hotelId: string | null; // Null if it's a platform-wide action
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: any;
}) {
  try {
    const sb = createAdminClient();
    await sb.from("platform_audit_logs").insert([{
      hotel_id: hotelId,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    }]);
  } catch (error) {
    // We swallow errors here because audit logging should not break the main user flow.
    console.error("Failed to write audit log:", error);
  }
}
