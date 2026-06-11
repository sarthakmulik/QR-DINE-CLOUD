import nodemailer from "nodemailer";

interface SendCredentialsEmailParams {
  to: string;
  ownerName: string;
  hotelName: string;
  loginEmail: string;
  password: string;
}

export async function sendCredentialsEmail(
  params: SendCredentialsEmailParams
): Promise<{ sent: boolean; message: string }> {
  const { to, ownerName, hotelName, loginEmail, password } = params;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ea580c;">Welcome to QR Dine Cloud</h2>
      <p>Hi ${ownerName},</p>
      <p>Your restaurant <strong>${hotelName}</strong> has been set up on QR Dine Cloud.</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Login Email:</strong> ${loginEmail}</p>
        <p style="margin: 8px 0 0;"><strong>Password:</strong> ${password}</p>
      </div>
      <p>Please log in and change your password. You can also sign in with Google if linked.</p>
      <p style="color: #6b7280; font-size: 12px;">— QR Dine Cloud Team</p>
    </div>
  `;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("\n=== EMAIL (dev mode - SMTP not configured) ===");
    console.log(`To: ${to}`);
    console.log(`Login: ${loginEmail} / Password: ${password}`);
    console.log("==============================================\n");
    return { sent: false, message: "Credentials logged to console (SMTP not configured)" };
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
