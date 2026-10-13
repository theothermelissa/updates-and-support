export type Email = { to: string; subject: string; text: string; headers?: Record<string, string> };
export type SendEmail = (email: Email) => Promise<void>;
export type SendEmails = (emails: Email[]) => Promise<void>;

const BATCH_SIZE = 100; // Resend's limit per batch request

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

// Sends through Resend's batch endpoint, 100 at a time. A failed batch doesn't stop the
// rest; afterwards it throws with counts only, since Resend's error text can include
// addresses. With no RESEND_API_KEY (local dev), logs instead.
export const sendEmails: SendEmails = async (emails) => {
  const apiKey = process.env.RESEND_API_KEY;
  let failed = 0;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    if (!apiKey) {
      for (const email of batch) console.log(`[email] to ${email.to}: ${email.subject}\n${email.text}`);
      continue;
    }
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((email) => ({ from: process.env.EMAIL_FROM, ...email }))),
    });
    if (!res.ok) {
      console.error(`Resend batch of ${batch.length} failed with status ${res.status}`);
      failed += batch.length;
    }
  }
  if (failed > 0) throw new Error(`${failed} of ${emails.length} emails failed to send`);
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

export function verificationEmail(to: string, familyName: string, link: string): Email {
  return {
    to,
    subject: `Confirm your email for ${familyName}'s updates`,
    text: `Thanks for joining ${familyName}'s updates. Please confirm your email so the family can reach you:\n\n${link}\n\nThe link works once and expires in 7 days. If you didn't join, you can ignore this email.`,
  };
}

// Says only that there's a new update, never what it says: emails are forwarded and
// shown in lock-screen previews.
export function notificationEmail(
  to: string,
  familyName: string,
  links: { site: string; unsubscribePage: string; oneClickUnsubscribe: string },
): Email {
  return {
    to,
    subject: `New update from ${familyName}`,
    text: `${familyName} posted a new update. Read it here:\n\n${links.site}\n\nTo stop these emails, turn them off here:\n${links.unsubscribePage}`,
    headers: {
      "List-Unsubscribe": `<${links.oneClickUnsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
