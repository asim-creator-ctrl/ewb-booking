// Sends email via Gmail SMTP using an App Password — works with no domain of
// your own, which matters until a custom domain is set up for the real thing
// (Resend or similar). Swap this file out later without touching callers.
import "server-only";
import nodemailer from "nodemailer";

export function isEmailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}): Promise<void> {
  if (!isEmailConfigured()) return;
  const from = process.env.GMAIL_FROM_NAME ? `"${process.env.GMAIL_FROM_NAME}" <${process.env.GMAIL_USER}>` : process.env.GMAIL_USER!;
  await getTransporter().sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, attachments: opts.attachments });
}
