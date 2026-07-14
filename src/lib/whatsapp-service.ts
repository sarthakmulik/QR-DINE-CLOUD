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

  if (providerType === "platform" && !apiKey) {
    const sb = createAdminClient();
    const { data: settings } = await sb.from("platform_settings").select("whatsapp_api_key").eq("id", "00000000-0000-0000-0000-000000000001").maybeSingle();
    if (settings?.whatsapp_api_key) {
      apiKey = settings.whatsapp_api_key;
    }
  }

  if (providerType === "custom") {
    if (!hotel?.whatsapp_custom_api_key) {
      console.warn(`[WhatsApp Service] Hotel ${hotel?.id} uses 'custom' provider but has no API key configured. Fallback to platform key.`);
    } else {
      apiKey = hotel.whatsapp_custom_api_key;
    }
  }

  if (!apiKey) {
    console.log("[WhatsApp Service] No API Key available. Skipping.");
    return;
  }

  const isTwilio = apiKey.includes(":") || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

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
    // In production, uncomment the blocks below when you configure Twilio or Interakt.

    if (isTwilio) {
      // Twilio Sandbox Implementation
      let accountSid = process.env.TWILIO_ACCOUNT_SID;
      let authToken = process.env.TWILIO_AUTH_TOKEN;
      
      // If the API key is passed as "AccountSID:AuthToken" from the custom settings
      if (apiKey.includes(":")) {
        const parts = apiKey.split(":");
        accountSid = parts[0];
        authToken = parts[1];
      }

      if (!accountSid || !authToken) {
        throw new Error("Missing Twilio credentials");
      }

      const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || "+14155238886"; // Default Twilio Sandbox Number
      const formattedTo = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;

      const params = new URLSearchParams();
      params.append("To", `whatsapp:${formattedTo}`);
      params.append("From", `whatsapp:${twilioNumber}`);
      params.append("Body", message);

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Twilio API Error: ${errBody}`);
      }
    } else {
      // Interakt Implementation
      const response = await fetch("https://api.interakt.ai/v1/public/message/", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          countryCode: "+91",
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
    }

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
