import { Hotel, TableSession, SessionItem } from "./types";
import { formatINR } from "./utils";
import { createAdminClient } from "./supabase/admin";

/**
 * Sends a bill receipt via WhatsApp to the customer using Interakt API.
 * Handles both "platform" (centralized) and "custom" provider types.
 */
export async function sendWhatsappBill(
  phoneNumber: string,
  session: TableSession,
  items: SessionItem[],
  hotel?: Hotel
) {
  if (!phoneNumber) {
    console.log("[WhatsApp Service] No phone number provided. Skipping.");
    return;
  }

  const hotelName = hotel?.name || "Our Restaurant";
  const providerType = hotel?.whatsapp_provider_type || "platform";
  let apiKey = process.env.INTERAKT_API_KEY;

  if (providerType === "custom") {
    if (!hotel?.whatsapp_custom_api_key) {
      console.warn(`[WhatsApp Service] Hotel ${hotel?.id} uses 'custom' provider but has no API key configured. Fallback to platform key.`);
    } else {
      apiKey = hotel.whatsapp_custom_api_key;
    }
  }

  if (!apiKey) {
    console.log("[WhatsApp Service] No Interakt API Key available. Skipping.");
    return;
  }

  // Format the bill text
  let message = `*🧾 Bill Receipt from ${hotelName}*\n\n`;
  message += `Order #${session.order_number}\n`;
  message += `Date: ${new Date(session.closed_at || session.end_time || Date.now()).toLocaleString()}\n\n`;
  
  message += `*Items:*\n`;
  items.forEach(item => {
    message += `${item.quantity}x ${item.name} - ${formatINR(Number(item.price) * item.quantity)}\n`;
  });
  
  message += `\n`;
  if (Number(session.discount_amount) > 0) {
    message += `Subtotal: ${formatINR(Number(session.subtotal))}\n`;
    message += `Discount: -${formatINR(Number(session.discount_amount))}\n`;
  }
  if (Number(session.tax_amount) > 0) {
    message += `Tax: +${formatINR(Number(session.tax_amount))}\n`;
  }
  
  message += `\n*Total: ${formatINR(Number(session.total))}*\n`;
  message += `Payment Method: ${session.payment_method || "N/A"}\n\n`;
  message += `Thank you for dining with us! 🙏`;

  let status = "failed";

  try {
    console.log(`\n================= WHATSAPP SERVICE (${providerType.toUpperCase()}) =================`);
    console.log(`[SIMULATION] Sending bill to WhatsApp number: ${phoneNumber}`);
    console.log(`[SIMULATION] Payload:\n${message}`);
    console.log(`====================================================\n`);

    // --- REAL API LOGIC PLACEHOLDER ---
    // In production, uncomment the fetch block below when you configure an Interakt Template.
    /*
    const response = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        countryCode: "+91", // Ensure you parse this properly based on your input
        phoneNumber: phoneNumber.replace("+91", ""),
        callbackData: "some_callback_data",
        type: "Template",
        template: {
          name: "bill_receipt",
          languageCode: "en",
          bodyValues: [hotelName, String(session.total)]
        }
      })
    });
    
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Interakt API Error: ${errBody}`);
    }
    */

    // Simulate success
    status = "sent";

  } catch (error) {
    console.error("[WhatsApp Service] Error:", error);
    status = "failed";
  }

  // Log usage into whatsapp_logs table via Supabase admin client
  try {
    const sb = createAdminClient();
    await sb.from("whatsapp_logs").insert({
      hotel_id: hotel?.id,
      session_id: session.id,
      provider_type: providerType,
      customer_phone: phoneNumber,
      status: status
    });
  } catch (dbError) {
    console.error("[WhatsApp Service] Failed to log usage to database:", dbError);
  }
}
