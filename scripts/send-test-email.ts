// Sends one test email through Resend to check delivery and DNS.
// Usage: RESEND_API_KEY=... npm run email:test -- you@example.com
import "dotenv/config";
import { sendEmail } from "../server/email.js";

const to = process.argv[2];
if (!to || !process.env.RESEND_API_KEY) {
  console.error("Usage: RESEND_API_KEY=... npm run email:test -- you@example.com");
  process.exit(1);
}
await sendEmail({
  to,
  subject: "Updates and Support test email",
  text: "If you can read this, email from Updates and Support is working.",
});
console.log(`Sent to ${to} from ${process.env.EMAIL_FROM}`);
