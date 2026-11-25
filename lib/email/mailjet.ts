/**
 * VENDOSMITH MAILJET REST API CLIENT
 * Secure server-side transactional email delivery via Mailjet Send API v3.1.
 * 
 * Requirements:
 * - Server-side only (never expose API keys to browser).
 * - Safe simulated dry-run mode when credentials are missing.
 * - In-memory idempotency cache to prevent duplicate email dispatches.
 * - Structured logging without leaking sensitive authorization data.
 * - Automatic retry with exponential backoff on transient network / 5xx errors.
 */

export interface MailjetRecipient {
  email: string;
  name?: string;
}

export interface MailjetAttachment {
  contentType: string;
  filename: string;
  base64Content: string;
}

export interface SendMailjetEmailParams {
  to: MailjetRecipient | MailjetRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  idempotencyKey?: string;
  attachments?: MailjetAttachment[];
}

export interface MailjetSendResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
  statusCode?: number;
}

// In-memory idempotency cache with 24-hour TTL to prevent duplicate sends on webhooks or retries
interface CacheEntry {
  timestamp: number;
  messageId: string;
}
const idempotencyCache = new Map<string, CacheEntry>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function cleanExpiredIdempotencyEntries() {
  const now = Date.now();
  idempotencyCache.forEach((entry, key) => {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key);
    }
  });
}

/**
 * Strips sensitive headers or values for structured logging.
 */
function sanitizeForLog(data: unknown): string {
  try {
    return JSON.stringify(data, (key, value) => {
      if (/key|secret|token|password|auth/i.test(key)) {
        return "[REDACTED]";
      }
      return value;
    });
  } catch {
    return "[Unserializable Data]";
  }
}

/**
 * Main Mailjet Send API dispatcher.
 */
export async function sendMailjetEmail(params: SendMailjetEmailParams): Promise<MailjetSendResult> {
  const { to, subject, htmlContent, textContent, idempotencyKey, attachments } = params;

  // 1. Idempotency Check
  if (idempotencyKey) {
    cleanExpiredIdempotencyEntries();
    const existing = idempotencyCache.get(idempotencyKey);
    if (existing) {
      console.info(
        `[Mailjet] Idempotent send skipped (already delivered): key="${idempotencyKey}", existingMessageId="${existing.messageId}"`
      );
      return {
        success: true,
        messageId: existing.messageId,
        simulated: existing.messageId.startsWith("simulated-"),
      };
    }
  }

  // 2. Validate Recipients
  const recipients: MailjetRecipient[] = Array.isArray(to) ? to : [to];
  const validRecipients = recipients.filter(
    (r) => r.email && typeof r.email === "string" && r.email.includes("@")
  );

  if (validRecipients.length === 0) {
    const errorMsg = "Mailjet delivery aborted: No valid recipient email addresses provided.";
    console.error(`[Mailjet Error] ${errorMsg}`, { recipients });
    return { success: false, error: errorMsg };
  }

  // 2b. Validate Subject
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    const errorMsg = "Mailjet delivery aborted: Subject is required and cannot be empty.";
    console.error(`[Mailjet Error] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  // 3. Read Server-Side Credentials
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  const senderEmail = process.env.MAILJET_SENDER_EMAIL || "orders@vendosmith.com";
  const senderName = process.env.MAILJET_SENDER_NAME || "VENDOSMITH";

  // 4. Safe Dry-Run Mode when credentials are not configured
  if (!apiKey || !secretKey) {
    const simulatedId = `simulated-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.warn(
      `[Mailjet Dry-Run / Credentials Unset] Simulated email acceptance:`,
      sanitizeForLog({
        to: validRecipients.map((r) => r.email),
        subject,
        idempotencyKey,
        simulatedId,
      })
    );

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, {
        timestamp: Date.now(),
        messageId: simulatedId,
      });
    }

    return {
      success: true,
      simulated: true,
      messageId: simulatedId,
    };
  }

  // 5. Construct Mailjet Send API v3.1 Payload
  const basicAuthToken = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  const plainTextFallback =
    textContent ||
    htmlContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const formattedAttachments = attachments?.map((att) => ({
    ContentType: att.contentType,
    Filename: att.filename,
    Base64Content: att.base64Content,
  }));

  const mailjetPayload = {
    Messages: [
      {
        From: {
          Email: senderEmail,
          Name: senderName,
        },
        To: validRecipients.map((r) => ({
          Email: r.email.trim().toLowerCase(),
          Name: r.name ? r.name.trim() : undefined,
        })),
        Subject: subject,
        TextPart: plainTextFallback,
        HTMLPart: htmlContent,
        CustomID: idempotencyKey || undefined,
        Attachments: formattedAttachments && formattedAttachments.length > 0 ? formattedAttachments : undefined,
      },
    ],
  };

  // 6. Execute Request with Exponential Backoff Retry (Max 2 Retries)
  const maxRetries = 2;
  let attempt = 0;
  let lastError: Error | null = null;
  let lastStatusCode = 0;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basicAuthToken}`,
        },
        body: JSON.stringify(mailjetPayload),
      });

      lastStatusCode = response.status;

      if (!response.ok) {
        const errorText = await response.text();
        // If 4xx client validation error, do not retry
        if (response.status >= 400 && response.status < 500) {
          console.error(
            `[Mailjet Error ${response.status}] Request rejected by Mailjet API:`,
            sanitizeForLog({ status: response.status, body: errorText, subject, to: validRecipients.map(r => r.email) })
          );
          return {
            success: false,
            statusCode: response.status,
            error: `Mailjet API error ${response.status}: ${errorText}`,
          };
        }

        throw new Error(`Server returned status ${response.status}: ${errorText}`);
      }

      const responseData = (await response.json()) as {
        Messages?: Array<{
          Status: string;
          CustomID?: string;
          To?: Array<{ MessageID: number; MessageUUID: string }>;
          Errors?: Array<{ ErrorCode: string; StatusCode: number; ErrorMessage: string }>;
        }>;
      };

      const firstMsg = responseData.Messages?.[0];

      if (firstMsg?.Status === "success") {
        const messageId = firstMsg.To?.[0]?.MessageUUID || String(firstMsg.To?.[0]?.MessageID || "accepted");
        console.info(
          `[Mailjet Success] Email delivered: messageId="${messageId}", subject="${subject}", to=${validRecipients.map(r => r.email).join(", ")}`
        );

        if (idempotencyKey) {
          idempotencyCache.set(idempotencyKey, {
            timestamp: Date.now(),
            messageId,
          });
        }

        return {
          success: true,
          messageId,
          statusCode: 200,
        };
      } else {
        const errors = firstMsg?.Errors?.map(e => e.ErrorMessage).join("; ") || "Unknown Mailjet send failure";
        console.error(`[Mailjet Delivery Failure] Status=${firstMsg?.Status}: ${errors}`);
        return {
          success: false,
          statusCode: 400,
          error: errors,
        };
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Mailjet Attempt ${attempt}/${maxRetries + 1} Failed] ${lastError.message}`);

      if (attempt <= maxRetries) {
        // Wait 300ms on first retry, 600ms on second retry
        await new Promise((res) => setTimeout(res, attempt * 300));
      }
    }
  }

  const finalErrorMsg = lastError?.message || `Failed after ${attempt} attempts with status ${lastStatusCode}`;
  console.error(`[Mailjet Final Failure] Could not send email: ${finalErrorMsg}`);
  return {
    success: false,
    statusCode: lastStatusCode,
    error: finalErrorMsg,
  };
}
