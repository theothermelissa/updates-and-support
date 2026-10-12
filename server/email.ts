export type Email = { to: string; subject: string; text: string };
export type SendEmail = (email: Email) => Promise<void>;

// Sends through Resend's REST API. With no RESEND_API_KEY (local dev), logs instead.
export const sendEmail: SendEmail = async (email) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] to ${email.to}: ${email.subject}\n${email.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, ...email }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
};

// The site's own address for links in emails. Never derived from the request, so a
// forged Host header can't send someone a link to another site. On Vercel previews
// without APP_URL, the branch's stable address keeps people on the host they started on.
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const vercelHost = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}

// Emails name the family and carry a link, nothing more: no update content.
export function signInEmail(to: string, familyName: string, link: string): Email {
  return {
    to,
    subject: `Your sign-in link for ${familyName}`,
    text: `Use this link to sign in to ${familyName}'s updates:\n\n${link}\n\nIt works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.`,
  };
}
