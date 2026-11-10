import { SupabaseClient } from "@supabase/supabase-js";

export interface WalletTransactionRecord {
  id: string;
  wallet_id: string;
  customer_id: string;
  type:
    | "REPLACEMENT_PRICE_DIFFERENCE_CREDIT"
    | "REFUND_WALLET_CREDIT"
    | "WALLET_USED_FOR_REPLACEMENT"
    | "WALLET_DEBIT"
    | "ADMIN_ADJUSTMENT";
  amount: number;
  direction: "credit" | "debit";
  balance_after: number;
  reference_type: "replacement_request" | "return_request" | "order" | "admin_action";
  reference_id: string;
  description: string;
  idempotency_key?: string | null;
  created_at: string;
}

export interface CustomerWalletSummary {
  id: string;
  customer_id: string;
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

/**
 * Ensures a customer wallet exists, creating one if not present.
 */
export async function getOrCreateCustomerWallet(
  supabaseAdmin: SupabaseClient,
  customerId: string
): Promise<CustomerWalletSummary> {
  const { data: existing, error: selectErr } = await supabaseAdmin
    .from("customer_wallets")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      customer_id: existing.customer_id,
      balance: Number(existing.balance || 0),
      currency: existing.currency || "INR",
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };
  }

  // If table doesn't exist yet, return safe virtual wallet
  if (selectErr && (selectErr.code === "42P01" || selectErr.message?.includes("does not exist"))) {
    return {
      id: "virtual-wallet-" + customerId,
      customer_id: customerId,
      balance: 0,
      currency: "INR",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Create new wallet
  const { data: created, error: insertErr } = await supabaseAdmin
    .from("customer_wallets")
    .insert({
      customer_id: customerId,
      balance: 0,
      currency: "INR",
    })
    .select()
    .single();

  if (insertErr || !created) {
    // If concurrent insert occurred, re-query
    const { data: retry } = await supabaseAdmin
      .from("customer_wallets")
      .select("*")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (retry) {
      return {
        id: retry.id,
        customer_id: retry.customer_id,
        balance: Number(retry.balance || 0),
        currency: retry.currency || "INR",
        created_at: retry.created_at,
        updated_at: retry.updated_at,
      };
    }

    return {
      id: "virtual-wallet-" + customerId,
      customer_id: customerId,
      balance: 0,
      currency: "INR",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return {
    id: created.id,
    customer_id: created.customer_id,
    balance: Number(created.balance || 0),
    currency: created.currency || "INR",
    created_at: created.created_at,
    updated_at: created.updated_at,
  };
}

export interface CreditWalletParams {
  customerId: string;
  amount: number;
  type:
    | "REPLACEMENT_PRICE_DIFFERENCE_CREDIT"
    | "REFUND_WALLET_CREDIT"
    | "ADMIN_ADJUSTMENT";
  referenceType: "replacement_request" | "return_request" | "order" | "admin_action";
  referenceId: string;
  description: string;
  idempotencyKey?: string | null;
}

/**
 * Atomically credits a customer's wallet with ledger entry, row-level locking, and idempotency protection.
 */
export async function creditCustomerWallet(
  supabaseAdmin: SupabaseClient,
  params: CreditWalletParams
): Promise<{ success: boolean; newBalance: number; transactionId?: string; isDuplicate?: boolean; message?: string }> {
  const { customerId, amount, type, referenceType, referenceId, description, idempotencyKey } = params;

  const cleanAmount = Number(Number(amount).toFixed(2));
  if (cleanAmount <= 0 || !Number.isFinite(cleanAmount)) {
    return { success: false, newBalance: 0, message: "Credit amount must be greater than zero." };
  }

  const cleanIdempKey = idempotencyKey?.trim() || `${type}_${referenceType}_${referenceId}`;

  const { data, error } = await supabaseAdmin.rpc("credit_customer_wallet_atomic", {
    p_customer_id: customerId,
    p_amount: cleanAmount,
    p_type: type,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_description: description || "Wallet credit",
    p_idempotency_key: cleanIdempKey,
  });

  if (error) {
    console.error("Atomic wallet credit RPC failed:", error);
    return {
      success: false,
      newBalance: 0,
      message: error.message || "Failed to process wallet credit atomically.",
    };
  }

  if (!data || !data.success) {
    return {
      success: false,
      newBalance: Number(data?.current_balance ?? 0),
      message: data?.message || "Wallet credit failed.",
    };
  }

  return {
    success: true,
    newBalance: Number(data.balance),
    transactionId: data.transaction_id,
    isDuplicate: Boolean(data.is_duplicate),
    message: data.message,
  };
}

export interface AdminManualCreditParams {
  recipientType: "customer" | "seller";
  recipientId: string;
  amount: number;
  reason: string;
  adminUserId: string;
  adminEmail?: string;
  idempotencyKey?: string | null;
}

/**
 * Server-side Admin-authorized manual credit service with strict identity verification,
 * ledger auditing, amount constraints, and idempotency protection.
 */
export async function adminManualCreditWallet(
  supabaseAdmin: SupabaseClient,
  params: AdminManualCreditParams
): Promise<{
  success: boolean;
  message?: string;
  transactionId?: string;
  newBalance?: number;
  previousBalance?: number;
  amount?: number;
  recipientId?: string;
  recipientType?: string;
  recipientName?: string;
  isDuplicate?: boolean;
}> {
  const {
    recipientType,
    recipientId,
    amount,
    reason,
    adminUserId,
    adminEmail,
    idempotencyKey,
  } = params;

  // 1. Validate UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((recipientId || "").trim());
  if (!isUuid) {
    return { success: false, message: "Invalid recipient ID format." };
  }
  const cleanRecipientId = recipientId.trim();

  // 2. Validate Amount
  const cleanAmount = Number(amount);
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return { success: false, message: "Credit amount must be greater than zero." };
  }
  if (cleanAmount > 50000) {
    return { success: false, message: "Credit amount exceeds maximum allowed single adjustment limit of ₹50,000.00." };
  }
  // Max 2 decimal places check
  const amountStr = cleanAmount.toString();
  if (amountStr.includes(".") && amountStr.split(".")[1].length > 2) {
    return { success: false, message: "Credit amount can have at most two decimal places." };
  }

  // 3. Validate Reason
  const cleanReason = (reason || "").trim();
  if (cleanReason.length < 5) {
    return { success: false, message: "A mandatory descriptive reason (at least 5 characters) is required for audit compliance." };
  }

  // 4. Verify Recipient Identity and Type
  let verifiedName = "";
  let profileUserId = cleanRecipientId;

  if (recipientType === "seller") {
    // Check seller_profiles
    const { data: sellerProf } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, business_name, contact_name, business_email, phone")
      .eq("id", cleanRecipientId)
      .maybeSingle();

    if (!sellerProf) {
      // Check if user exists in profiles with role=seller
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", cleanRecipientId)
        .maybeSingle();

      if (!prof || prof.role !== "seller") {
        return { success: false, message: "Verified seller account not found for ID: " + cleanRecipientId };
      }
      verifiedName = prof.full_name || prof.email || "Seller";
      profileUserId = prof.id;
    } else {
      verifiedName = sellerProf.business_name || sellerProf.contact_name || "Seller";
      profileUserId = sellerProf.id;
    }
  } else {
    // Customer check
    const { data: custProf } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", cleanRecipientId)
      .maybeSingle();

    if (!custProf) {
      return { success: false, message: "Verified customer account not found for ID: " + cleanRecipientId };
    }
    verifiedName = custProf.full_name || custProf.email || "Customer";
    profileUserId = custProf.id;
  }

  // 5. Fetch previous balance
  const walletBefore = await getOrCreateCustomerWallet(supabaseAdmin, profileUserId);
  const previousBalance = walletBefore.balance;

  // 6. Generate deterministic unique idempotency key
  const cleanIdempKey = idempotencyKey?.trim() || `ADMIN_CREDIT_${profileUserId}_${Date.now()}`;

  // 7. Execute Atomic Credit
  const creditResult = await creditCustomerWallet(supabaseAdmin, {
    customerId: profileUserId,
    amount: cleanAmount,
    type: "ADMIN_ADJUSTMENT",
    referenceType: "admin_action",
    referenceId: adminUserId,
    description: `Admin manual credit: ${cleanReason} (Authorized by ${adminEmail || adminUserId})`,
    idempotencyKey: cleanIdempKey,
  });

  if (!creditResult.success) {
    return { success: false, message: creditResult.message || "Failed to record wallet transaction. Please retry." };
  }

  return {
    success: true,
    transactionId: creditResult.transactionId,
    newBalance: creditResult.newBalance,
    previousBalance,
    amount: cleanAmount,
    recipientId: profileUserId,
    recipientType,
    recipientName: verifiedName,
    isDuplicate: creditResult.isDuplicate || false,
  };
}

/**
 * Fetches transactions history for customer wallet.
 */
export async function getCustomerWalletTransactions(
  supabaseAdmin: SupabaseClient,
  customerId: string
): Promise<WalletTransactionRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((item) => ({
    id: item.id,
    wallet_id: item.wallet_id,
    customer_id: item.customer_id,
    type: item.type,
    amount: Number(item.amount),
    direction: item.direction,
    balance_after: Number(item.balance_after),
    reference_type: item.reference_type,
    reference_id: item.reference_id,
    description: item.description,
    idempotency_key: item.idempotency_key,
    created_at: item.created_at,
  }));
}

export interface DebitWalletParams {
  customerId: string;
  amount: number;
  type?: "WALLET_DEBIT" | "WALLET_USED_FOR_REPLACEMENT";
  referenceType: "order" | "replacement_request" | "admin_action";
  referenceId: string;
  description: string;
  idempotencyKey?: string | null;
}

/**
 * Atomically debits a customer's wallet with ledger entry and idempotency protection.
 * Ensures balance does not go negative and prevents double-spending.
 */
export async function debitCustomerWallet(
  supabaseAdmin: SupabaseClient,
  params: DebitWalletParams
): Promise<{
  success: boolean;
  newBalance: number;
  transactionId?: string;
  isDuplicate?: boolean;
  message?: string;
}> {
  const {
    customerId,
    amount,
    type = "WALLET_DEBIT",
    referenceType,
    referenceId,
    description,
    idempotencyKey,
  } = params;

  if (amount <= 0) {
    return { success: false, newBalance: 0, message: "Debit amount must be greater than zero." };
  }

  const cleanAmount = Number(amount.toFixed(2));
  const cleanIdempKey = idempotencyKey?.trim() || `${type}_${referenceType}_${referenceId}`;

  const { data, error } = await supabaseAdmin.rpc("debit_customer_wallet_atomic", {
    p_customer_id: customerId,
    p_amount: cleanAmount,
    p_type: type,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_description: description || "Wallet debit",
    p_idempotency_key: cleanIdempKey,
  });

  if (error) {
    console.error("Atomic wallet debit RPC failed:", error);
    return {
      success: false,
      newBalance: 0,
      message: error.message || "Failed to process wallet debit atomically.",
    };
  }

  if (!data || !data.success) {
    return {
      success: false,
      newBalance: Number(data?.current_balance ?? 0),
      message: data?.message || "Wallet debit failed.",
    };
  }

  return {
    success: true,
    newBalance: Number(data.balance),
    transactionId: data.transaction_id,
    isDuplicate: Boolean(data.is_duplicate),
    message: data.message,
  };
}

/**
 * Safely releases held or debited wallet funds if order creation fails or aborts.
 */
export async function releaseCustomerWalletDebit(
  supabaseAdmin: SupabaseClient,
  params: {
    customerId: string;
    amount: number;
    referenceId: string;
    description: string;
  }
) {
  const { customerId, amount, referenceId, description } = params;
  if (amount <= 0) return;

  const idempKey = `RELEASE_WALLET_DEBIT_${referenceId}`;
  return creditCustomerWallet(supabaseAdmin, {
    customerId,
    amount,
    type: "ADMIN_ADJUSTMENT",
    referenceType: "order",
    referenceId,
    description: `Refund/Release: ${description}`,
    idempotencyKey: idempKey,
  });
}

