import nodemailer from "nodemailer";

interface SendCredentialsEmailParams {
  to: string;
  ownerName: string;
  hotelName: string;
  loginEmail: string;
  password: string;
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendCredentialsEmail(
  params: SendCredentialsEmailParams
): Promise<{ sent: boolean; message: string }> {
  const { to, ownerName, hotelName, loginEmail, password } = params;

  const safeOwnerName = escapeHtml(ownerName);
  const safeHotelName = escapeHtml(hotelName);
  const safeLoginEmail = escapeHtml(loginEmail);
  const safePassword = escapeHtml(password);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ea580c;">Welcome to QR Dine Cloud</h2>
      <p>Hi ${safeOwnerName},</p>
      <p>Your restaurant <strong>${safeHotelName}</strong> has been set up on QR Dine Cloud.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Login Email:</strong> ${safeLoginEmail}</p>
        <p style="margin: 8px 0 0;"><strong>Password:</strong> ${safePassword}</p>
      </div>
      <p>Please log in and change your password. You can also sign in with Google if linked.</p>
      <p style="color: #6b7280; font-size: 12px;">— QR Dine Cloud Team</p>
    </div>
  `;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (process.env.NODE_ENV !== "production") {
      console.log("\n=== EMAIL (dev mode - SMTP not configured) ===");
      console.log(`To: ${to}`);
      console.log(`Login: ${loginEmail} / Password: ${password}`);
      console.log("==============================================\n");
    } else {
      console.error("SMTP credentials not configured in production");
    }
    return { sent: false, message: "Credentials not sent (SMTP not configured)" };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "QR Dine Cloud <noreply@qrdine.app>",
    to,
    subject: `Your QR Dine Cloud credentials for ${hotelName}`,
    html,
  });

  return { sent: true, message: "Credentials emailed successfully" };
}
