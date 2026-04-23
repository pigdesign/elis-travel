import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../lib/logger";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

type Provider = "resend" | "smtp" | "none";

function detectProvider(): Provider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return "none";
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || "Elis Travel <info@elis-travel.it>";
}

let cachedSmtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  if (cachedSmtpTransport) return cachedSmtpTransport;
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  cachedSmtpTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cachedSmtpTransport;
}

async function sendViaResend(msg: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!;
  const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: recipients,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      reply_to: msg.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendViaSmtp(msg: EmailMessage): Promise<void> {
  const transport = getSmtpTransport();
  await transport.sendMail({
    from: getFromAddress(),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    replyTo: msg.replyTo,
  });
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const provider = detectProvider();
  if (provider === "none") {
    logger.warn(
      { to: msg.to, subject: msg.subject },
      "Nessun provider email configurato (impostare RESEND_API_KEY o SMTP_HOST). Email non inviata.",
    );
    return;
  }
  try {
    if (provider === "resend") await sendViaResend(msg);
    else await sendViaSmtp(msg);
    logger.info(
      { to: msg.to, subject: msg.subject, provider },
      "Email inviata",
    );
  } catch (err) {
    logger.error(
      { err, to: msg.to, subject: msg.subject, provider },
      "Invio email fallito",
    );
    throw err;
  }
}

export function getAdminNotificationEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAILS || "info@elis-travel.it";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isEmailConfigured(): boolean {
  return detectProvider() !== "none";
}
