import { SupabaseClient } from "@supabase/supabase-js";

export function safeNumber(val: unknown, fallback: number = 0): number {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === "number" ? val : Number(val);
  return Number.isFinite(num) ? num : fallback;
}

export function round2(num: number): number {
  return Math.round(safeNumber(num) * 100) / 100;
}

export interface AdminFinancialOverviewMetrics {
  // Canonical snake_case properties (as required by AdminFinanceHubClient)
  total_seller_liability: number; // Sum of all sellers available_balance + locked_balance
  pending_payout_requests: number; // Count of payout requests with status = 'pending'
  awaiting_approval_amount: number; // Sum of payout amounts with status = 'pending'
  approved_unpaid_count: number; // Count of payout requests with status IN ('approved', 'processing')
  approved_unpaid_amount: number; // Sum of payout amounts with status IN ('approved', 'processing')
  transfers_processing_count: number; // Count of payout requests with status = 'processing'
  paid_in_range_count: number; // Count of paid payout requests in selected period
  paid_in_range_amount: number; // Sum of paid payout amounts in selected period
  failed_transfers_count: number; // Count of failed payout requests
  pending_bank_verifications: number; // Count of seller bank accounts awaiting verification
  cod_remittance_awaiting: number; // Gross/Net COD amount awaiting courier reconciliation
  outstanding_settlements_count: number; // Count of active unsettled order line items
  currency: string;
  timezone: string;

  // CamelCase aliases (for backwards compatibility with existing backend callers)
  totalSellerLiability: number;
  pendingPayoutRequestsCount: number;
  totalAwaitingApproval: number;
  approvedUnpaidAmount: number;
  transfersProcessingCount: number;
  paidDuringPeriod: number;
  failedTransfersCount: number;
  pendingBankVerificationsCount: number;
  codAwaitingReconciliationCount: number;
  codAwaitingReconciliationAmount: number;
  outstandingSettlementsCount: number;
  outstandingSettlementsAmount: number;
  totalMarketplaceGrossSales: number;
  totalPlatformCommissionEarned: number;
}

/**
 * Fetches top-level financial metrics for the Admin Dashboard.
 */
export async function getAdminFinancialOverview(
  supabaseAdmin: SupabaseClient,
  startDate?: string,
  endDate?: string
): Promise<AdminFinancialOverviewMetrics> {
  // Read-only query: Settlement hold releases are handled by scheduled cron / dedicated worker

  // 1. Total Seller Liability (Available + Locked balances)
  const { data: balances, error: balancesErr } = await supabaseAdmin
    .from("seller_balances")
    .select("available_balance, locked_balance, lifetime_withdrawn");

  if (balancesErr) {
    console.error("Database error fetching seller_balances:", balancesErr);
    throw new Error(`Failed to fetch seller balances: ${balancesErr.message}`);
  }

  let totalLiability = 0;
  if (balances) {
    for (const b of balances) {
      totalLiability += safeNumber(b.available_balance) + safeNumber(b.locked_balance);
    }
  }

  // 2. Payout Requests Summary
  const { data: payoutRequests, error: payoutsErr } = await supabaseAdmin
    .from("seller_payout_requests")
    .select("id, amount, status, requested_at, paid_at");

  if (payoutsErr) {
    console.error("Database error fetching seller_payout_requests:", payoutsErr);
    throw new Error(`Failed to fetch payout requests: ${payoutsErr.message}`);
  }

  let pendingCount = 0;
  let awaitingApprovalAmt = 0;
  let approvedCount = 0;
  let approvedUnpaidAmt = 0;
  let processingCount = 0;
  let paidPeriodCount = 0;
  let paidPeriodAmt = 0;
  let failedCount = 0;

  const start = startDate ? new Date(startDate).getTime() : 0;
  const end = endDate ? new Date(endDate).getTime() : Infinity;

  if (payoutRequests) {
    for (const pr of payoutRequests) {
      const amt = safeNumber(pr.amount);
      if (pr.status === "pending") {
        pendingCount += 1;
        awaitingApprovalAmt += amt;
      } else if (pr.status === "approved") {
        approvedCount += 1;
        approvedUnpaidAmt += amt;
      } else if (pr.status === "processing") {
        processingCount += 1;
        approvedUnpaidAmt += amt;
      } else if (pr.status === "paid") {
        const paidTime = pr.paid_at ? new Date(pr.paid_at).getTime() : 0;
        if (paidTime >= start && paidTime <= end) {
          paidPeriodCount += 1;
          paidPeriodAmt += amt;
        }
      } else if (pr.status === "failed") {
        failedCount += 1;
      }
    }
  }

  const totalApprovedUnpaidCount = approvedCount + processingCount;

  // 3. Pending Bank Account Verifications
  const { count: pendingBanks, error: banksErr } = await supabaseAdmin
    .from("seller_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (banksErr) {
    console.error("Database error fetching pending bank accounts:", banksErr);
    throw new Error(`Failed to fetch pending bank verifications: ${banksErr.message}`);
  }

  // 4. COD Remittance Awaiting Reconciliation
  const { data: codSettlements, error: codErr } = await supabaseAdmin
    .from("seller_settlements")
    .select("net_seller_payable_paise, gross_amount_paise")
    .eq("payment_method", "COD")
    .eq("cod_reconciled", false)
    .eq("fulfillment_status", "delivered");

  if (codErr) {
    console.error("Database error fetching COD settlements:", codErr);
    throw new Error(`Failed to fetch COD settlements: ${codErr.message}`);
  }

  let codAwaitingCount = codSettlements?.length || 0;
  let codAwaitingAmt = 0;
  if (codSettlements) {
    for (const c of codSettlements) {
      codAwaitingAmt += safeNumber(c.gross_amount_paise) / 100.0;
    }
  }

  // 5. Outstanding Settlements & Total Sales
  const { data: allSettlements, error: settlementsErr } = await supabaseAdmin
    .from("seller_settlements")
    .select("gross_amount_paise, commission_amount_paise, net_seller_payable_paise, settlement_status");

  if (settlementsErr) {
    console.error("Database error fetching all settlements:", settlementsErr);
    throw new Error(`Failed to fetch settlements: ${settlementsErr.message}`);
  }

  let outstandingCount = 0;
  let outstandingAmt = 0;
  let totalGross = 0;
  let totalComm = 0;

  if (allSettlements) {
    for (const s of allSettlements) {
      const net = safeNumber(s.net_seller_payable_paise) / 100.0;
      totalGross += safeNumber(s.gross_amount_paise) / 100.0;
      totalComm += safeNumber(s.commission_amount_paise) / 100.0;

      if (s.settlement_status === "pending_delivery" || s.settlement_status === "on_hold") {
        outstandingCount += 1;
        outstandingAmt += net;
      }
    }
  }

  return {
    // Canonical snake_case properties
    total_seller_liability: round2(totalLiability),
    pending_payout_requests: pendingCount,
    awaiting_approval_amount: round2(awaitingApprovalAmt),
    approved_unpaid_count: totalApprovedUnpaidCount,
    approved_unpaid_amount: round2(approvedUnpaidAmt),
    transfers_processing_count: processingCount,
    paid_in_range_count: paidPeriodCount,
    paid_in_range_amount: round2(paidPeriodAmt),
    failed_transfers_count: failedCount,
    pending_bank_verifications: pendingBanks || 0,
    cod_remittance_awaiting: round2(codAwaitingAmt),
    outstanding_settlements_count: outstandingCount,
    currency: "INR",
    timezone: "Asia/Kolkata",

    // CamelCase aliases
    totalSellerLiability: round2(totalLiability),
    pendingPayoutRequestsCount: pendingCount,
    totalAwaitingApproval: round2(awaitingApprovalAmt),
    approvedUnpaidAmount: round2(approvedUnpaidAmt),
    transfersProcessingCount: processingCount,
    paidDuringPeriod: round2(paidPeriodAmt),
    failedTransfersCount: failedCount,
    pendingBankVerificationsCount: pendingBanks || 0,
    codAwaitingReconciliationCount: codAwaitingCount,
    codAwaitingReconciliationAmount: round2(codAwaitingAmt),
    outstandingSettlementsCount: outstandingCount,
    outstandingSettlementsAmount: round2(outstandingAmt),
    totalMarketplaceGrossSales: round2(totalGross),
    totalPlatformCommissionEarned: round2(totalComm),
  };
}

export interface AdminPayoutQueueFilters {
  status?: string;
  sellerId?: string;
  destinationType?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminPayoutQueueItem {
  id: string;
  payout_number: string;
  seller_id: string;
  seller_name: string;
  seller_email: string;
  amount: number;
  amount_paise: number;
  destination_type: "BANK_ACCOUNT" | "UPI";
  bank_account_id?: string | null;
  destination_snapshot: Record<string, unknown>;
  status: "pending" | "approved" | "processing" | "paid" | "rejected" | "failed" | "cancelled";
  requested_at: string;
  approved_at: string | null;
  processing_at?: string | null;
  paid_at: string | null;
  rejected_at?: string | null;
  rejection_reason: string | null;
  failed_at?: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  seller_balance?: {
    available_balance: number;
    locked_balance: number;
    lifetime_earned: number;
    lifetime_withdrawn: number;
  };
  seller_available_balance?: number;
  transfer?: {
    utr_reference: string;
    transfer_method: string;
    transferred_amount: number;
    actual_transfer_date: string;
    actual_transfer_time: string;
    actual_transfer_timestamp: string;
    destination_masked: string;
    admin_notes?: string;
  } | null;
  utr_reference?: string | null;
  transfer_method?: string | null;
  actual_transfer_date?: string | null;
  actual_transfer_time?: string | null;
}

/**
 * Fetches filtered payout queue for Admin financial operations.
 */
export async function getAdminPayoutQueue(
  supabaseAdmin: SupabaseClient,
  filters: AdminPayoutQueueFilters
): Promise<{
  items: AdminPayoutQueueItem[];
  payouts: AdminPayoutQueueItem[];
  totalCount: number;
}> {
  let query = supabaseAdmin
    .from("seller_payout_requests")
    .select(`
      id,
      payout_number,
      seller_id,
      amount,
      amount_paise,
      destination_type,
      bank_account_id,
      destination_snapshot,
      status,
      requested_at,
      approved_at,
      processing_at,
      paid_at,
      rejected_at,
      rejection_reason,
      failed_at,
      failure_reason,
      admin_notes,
      seller_profiles (
        business_name,
        contact_name,
        business_email,
        phone
      ),
      payout_transfers (
        utr_reference,
        transfer_method,
        transferred_amount,
        transferred_amount_paise,
        actual_transfer_date,
        actual_transfer_time,
        actual_transfer_timestamp,
        destination_masked,
        admin_notes
      )
    `, { count: "exact" });

  if (filters.status && filters.status !== "ALL") {
    query = query.eq("status", filters.status);
  }
  if (filters.sellerId && filters.sellerId !== "ALL") {
    query = query.eq("seller_id", filters.sellerId);
  }
  if (filters.destinationType && filters.destinationType !== "ALL") {
    query = query.eq("destination_type", filters.destinationType);
  }
  if (filters.startDate) {
    query = query.gte("requested_at", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("requested_at", filters.endDate);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim();
    // 1. Find matching sellers by business name, contact name, or email
    const { data: matchedSellers } = await supabaseAdmin
      .from("seller_profiles")
      .select("id")
      .or(`business_name.ilike.%${term}%,contact_name.ilike.%${term}%,business_email.ilike.%${term}%`);

    const matchedSellerIds = (matchedSellers || []).map((s: { id: string }) => s.id);

    // 2. Find matching payout transfers by UTR reference
    const { data: matchedTransfers } = await supabaseAdmin
      .from("payout_transfers")
      .select("payout_id")
      .ilike("utr_reference", `%${term}%`);

    const matchedPayoutIds = (matchedTransfers || []).map((t: { payout_id: string }) => t.payout_id);

    const orConditions: string[] = [`payout_number.ilike.%${term}%`];
    if (matchedSellerIds.length > 0) {
      orConditions.push(`seller_id.in.(${matchedSellerIds.join(",")})`);
    }
    if (matchedPayoutIds.length > 0) {
      orConditions.push(`id.in.(${matchedPayoutIds.join(",")})`);
    }

    query = query.or(orConditions.join(","));
  }

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.order("requested_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error || !data) {
    console.error("Error fetching admin payout queue:", error);
    return { items: [], payouts: [], totalCount: 0 };
  }

  // Fetch balances for all sellers present in this page
  const sellerIds = Array.from(new Set(data.map((r) => r.seller_id).filter(Boolean)));
  const balanceMap = new Map<string, { available_balance: number; locked_balance: number; lifetime_earned: number; lifetime_withdrawn: number }>();

  if (sellerIds.length > 0) {
    const { data: balances } = await supabaseAdmin
      .from("seller_balances")
      .select("seller_id, available_balance, locked_balance, lifetime_earned, lifetime_withdrawn")
      .in("seller_id", sellerIds);

    if (balances) {
      for (const b of balances) {
        balanceMap.set(b.seller_id, {
          available_balance: safeNumber(b.available_balance),
          locked_balance: safeNumber(b.locked_balance),
          lifetime_earned: safeNumber(b.lifetime_earned),
          lifetime_withdrawn: safeNumber(b.lifetime_withdrawn),
        });
      }
    }
  }

  const items: AdminPayoutQueueItem[] = data.map((r) => {
    const prof = Array.isArray(r.seller_profiles) ? r.seller_profiles[0] : r.seller_profiles;
    const transfer = Array.isArray(r.payout_transfers) ? r.payout_transfers[0] : r.payout_transfers;
    const amt = safeNumber(r.amount);
    const amtPaise = safeNumber(r.amount_paise, Math.round(amt * 100));
    const balance = balanceMap.get(r.seller_id) || {
      available_balance: 0,
      locked_balance: 0,
      lifetime_earned: 0,
      lifetime_withdrawn: 0,
    };

    const transferObj = transfer
      ? {
          utr_reference: transfer.utr_reference || "",
          transfer_method: transfer.transfer_method || "BANK_TRANSFER",
          transferred_amount: safeNumber(
            transfer.transferred_amount ??
              (transfer.transferred_amount_paise ? transfer.transferred_amount_paise / 100 : amt)
          ),
          actual_transfer_date: transfer.actual_transfer_date || "",
          actual_transfer_time: transfer.actual_transfer_time || "",
          actual_transfer_timestamp: transfer.actual_transfer_timestamp || "",
          destination_masked: transfer.destination_masked || "",
          admin_notes: transfer.admin_notes || undefined,
        }
      : null;

    return {
      id: r.id,
      payout_number: r.payout_number,
      seller_id: r.seller_id,
      seller_name: prof?.business_name || prof?.contact_name || "Merchant",
      seller_email: prof?.business_email || "N/A",
      amount: amt,
      amount_paise: amtPaise,
      destination_type: r.destination_type,
      bank_account_id: r.bank_account_id || null,
      destination_snapshot: (r.destination_snapshot as Record<string, unknown>) || {},
      status: r.status,
      requested_at: r.requested_at,
      approved_at: r.approved_at || null,
      processing_at: r.processing_at || null,
      paid_at: r.paid_at || null,
      rejected_at: r.rejected_at || null,
      rejection_reason: r.rejection_reason || null,
      failed_at: r.failed_at || null,
      failure_reason: r.failure_reason || null,
      admin_notes: r.admin_notes || null,
      seller_balance: balance,
      seller_available_balance: balance.available_balance,
      transfer: transferObj,
      utr_reference: transferObj?.utr_reference || null,
      transfer_method: transferObj?.transfer_method || null,
      actual_transfer_date: transferObj?.actual_transfer_date || null,
      actual_transfer_time: transferObj?.actual_transfer_time || null,
    };
  });

  return { items, payouts: items, totalCount: count || items.length };
}

export interface AdminPayoutDestinationDetails {
  payout_id: string;
  seller_id: string;
  destination_type: "BANK_ACCOUNT" | "UPI";
  destination_id: string | null;
  account_holder_name?: string;
  bank_name?: string;
  branch_name?: string | null;
  account_number_last4?: string;
  account_number_masked?: string;
  ifsc_code?: string;
  account_type?: string;
  is_primary?: boolean;
  status: string;
  is_verified: boolean;
  verified_at?: string | null;
  upi_id?: string | null;
  upi_qr_url?: string | null;
  business_name?: string;
  warning?: string | null;
  can_transfer: boolean;
}

export interface AdminPayoutDetailsResult {
  payout: Record<string, unknown>;
  balance: {
    available_balance: number;
    locked_balance: number;
    lifetime_earned: number;
    lifetime_withdrawn: number;
  };
  recentSettlements: Record<string, unknown>[];
  verifiedBanks: Record<string, unknown>[];
  linkedBankAccount: Record<string, unknown> | null;
  destination_details: AdminPayoutDestinationDetails;
}

/**
 * Fetches detailed payout review data including seller settlement history.
 */
export async function getAdminPayoutDetails(
  supabaseAdmin: SupabaseClient,
  payoutId: string
): Promise<AdminPayoutDetailsResult | null> {
  const { data: payout, error } = await supabaseAdmin
    .from("seller_payout_requests")
    .select(`
      *,
      seller_profiles (
        id,
        seller_id_code,
        business_name,
        contact_name,
        business_email,
        phone,
        verification_status,
        membership_plan,
        upi_id,
        upi_qr_url
      ),
      payout_transfers (
        *
      )
    `)
    .eq("id", payoutId)
    .single();

  if (error || !payout) {
    return null;
  }

  // Fetch current seller balance
  const { data: balance } = await supabaseAdmin
    .from("seller_balances")
    .select("*")
    .eq("seller_id", payout.seller_id)
    .maybeSingle();

  // Fetch recent settlements for this seller
  const { data: recentSettlements } = await supabaseAdmin
    .from("seller_settlements")
    .select("*")
    .eq("seller_id", payout.seller_id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Fetch verified bank accounts for this seller
  const { data: verifiedBanks } = await supabaseAdmin
    .from("seller_bank_accounts")
    .select("*")
    .eq("seller_id", payout.seller_id)
    .eq("status", "verified");

  // Fetch exact linked bank account for this payout request (if applicable)
  const targetBankAccountId =
    payout.bank_account_id ||
    (payout.destination_snapshot as Record<string, unknown> | null)?.bank_account_id;

  let linkedBankAccount: Record<string, unknown> | null = null;
  if (targetBankAccountId) {
    const { data: bankRow } = await supabaseAdmin
      .from("seller_bank_accounts")
      .select(
        "id, seller_id, bank_name, branch_name, account_holder_name, ifsc_code, account_number_last4, account_type, is_primary, status, rejection_reason, verified_at, created_at"
      )
      .eq("id", targetBankAccountId)
      .eq("seller_id", payout.seller_id)
      .maybeSingle();
    linkedBankAccount = bankRow;
  }

  const prof = Array.isArray(payout.seller_profiles)
    ? payout.seller_profiles[0]
    : payout.seller_profiles;
  const snap = (payout.destination_snapshot as Record<string, unknown>) || {};

  let destinationDetails: AdminPayoutDestinationDetails;

  if (payout.destination_type === "BANK_ACCOUNT") {
    const holder =
      (linkedBankAccount?.account_holder_name as string) ||
      (snap.account_holder_name as string) ||
      "Unknown";
    const bName =
      (linkedBankAccount?.bank_name as string) ||
      (snap.bank_name as string) ||
      "Unknown Bank";
    const brName =
      (linkedBankAccount?.branch_name as string | null) ??
      ((snap.branch_name as string | null) ?? null);
    const last4 =
      (linkedBankAccount?.account_number_last4 as string) ||
      (snap.account_number_last4 as string) ||
      "";
    const ifsc =
      (linkedBankAccount?.ifsc_code as string) ||
      (snap.ifsc_code as string) ||
      "";
    const accType =
      (linkedBankAccount?.account_type as string) ||
      (snap.account_type as string) ||
      "CURRENT";
    const status = linkedBankAccount
      ? String(linkedBankAccount.status || "unverified")
      : targetBankAccountId
      ? "missing"
      : "unlinked";
    const isVerified = status === "verified";

    let warning: string | null = null;
    if (!linkedBankAccount) {
      warning = "Linked bank account record was not found or has been removed from the seller's account.";
    } else if (status !== "verified") {
      warning = `Linked bank account is ${status.toUpperCase()}. Payout transfers cannot be safely executed until the account is verified.`;
    }

    destinationDetails = {
      payout_id: payout.id,
      seller_id: payout.seller_id,
      destination_type: "BANK_ACCOUNT",
      destination_id: (targetBankAccountId as string) || (linkedBankAccount?.id as string) || null,
      account_holder_name: holder,
      bank_name: bName,
      branch_name: brName,
      account_number_last4: last4,
      account_number_masked: last4 ? `••••••••${last4}` : "••••••••",
      ifsc_code: ifsc,
      account_type: accType,
      is_primary: Boolean(linkedBankAccount?.is_primary),
      status,
      is_verified: isVerified,
      verified_at: (linkedBankAccount?.verified_at as string | null) || null,
      warning,
      can_transfer: isVerified,
    };
  } else {
    const upiId = ((snap.upi_id as string) || (prof?.upi_id as string) || null)?.trim() || null;
    const isVerified = Boolean(upiId);
    let warning: string | null = null;
    if (!upiId) {
      warning = "Missing UPI ID. No valid receiving UPI address associated with this payout request.";
    }

    destinationDetails = {
      payout_id: payout.id,
      seller_id: payout.seller_id,
      destination_type: "UPI",
      destination_id: null,
      upi_id: upiId,
      upi_qr_url: (prof?.upi_qr_url as string | null) || null,
      business_name: (snap.business_name as string) || (prof?.business_name as string) || "Merchant",
      status: isVerified ? "verified" : "missing",
      is_verified: isVerified,
      warning,
      can_transfer: isVerified,
    };
  }

  return {
    payout: {
      ...payout,
      bank_account_id: payout.bank_account_id || null,
      amount: safeNumber(payout.amount),
      amount_paise: safeNumber(payout.amount_paise, Math.round(safeNumber(payout.amount) * 100)),
    },
    balance: balance
      ? {
          available_balance: safeNumber(balance.available_balance),
          locked_balance: safeNumber(balance.locked_balance),
          lifetime_earned: safeNumber(balance.lifetime_earned),
          lifetime_withdrawn: safeNumber(balance.lifetime_withdrawn),
        }
      : { available_balance: 0, locked_balance: 0, lifetime_earned: 0, lifetime_withdrawn: 0 },
    recentSettlements: recentSettlements || [],
    verifiedBanks: verifiedBanks || [],
    linkedBankAccount,
    destination_details: destinationDetails,
  };
}

export interface AdminProductCalculatorFilters {
  startDate?: string;
  endDate?: string;
  sellerId?: string;
  status?: string;
}

export interface CalculatorSummary {
  period_label: string;
  start_date: string;
  end_date: string;
  total_gross_sales: number;
  total_customer_paid: number;
  total_quantity: number;
  total_platform_coupon_absorbed: number;
  total_seller_discount: number;
  total_commission: number;
  total_shipping_charges: number;
  total_refunds: number;
  total_net_seller_payable: number;
  distinct_products_count: number;
  settlements_count: number;
  currency: string;
  timezone: string;
}

export interface CalculatorProductItem {
  product_id: string;
  product_title: string;
  sku: string | null;
  seller_id: string;
  seller_name: string;
  total_quantity: number;
  gross_sales: number;
  platform_coupon: number;
  seller_discount: number;
  commission_amount: number;
  avg_commission_percent: number;
  shipping_charges: number;
  refunds: number;
  net_seller_payable: number;
  order_breakdown: Array<{
    settlement_id: string;
    order_id: string;
    order_number: string;
    order_item_code: string | null;
    quantity: number;
    unit_price: number;
    gross_amount: number;
    platform_coupon: number;
    seller_discount: number;
    commission_amount: number;
    commission_rate_bps: number;
    net_seller_payable: number;
    settlement_status: string;
    payment_method: string;
    delivered_at: string | null;
    hold_released_at: string | null;
    created_at: string;
  }>;
}

export interface AdminProductCalculationRow {
  productId: string;
  productTitle: string;
  sku: string | null;
  sellerId: string;
  sellerName: string;
  totalQuantity: number;
  grossAmount: number;
  platformCouponContribution: number;
  commissionAmount: number;
  gstOnCommission: number;
  tcsAmount: number;
  tdsAmount: number;
  netSellerPayable: number;
  orderCount: number;
  orders: Array<{
    orderNumber: string;
    orderDate: string;
    quantity: number;
    unitPrice: number;
    grossAmount: number;
    couponContribution: number;
    commissionRate: number;
    commissionAmount: number;
    netPayable: number;
    paymentMethod: string;
    fulfillmentStatus: string;
    settlementStatus: string;
  }>;
}

/**
 * Calculates date-filtered product-wise and order-level financial breakdowns.
 */
export async function getAdminProductFinancialCalculator(
  supabaseAdmin: SupabaseClient,
  filters: AdminProductCalculatorFilters
): Promise<{
  calculator: {
    summary: CalculatorSummary;
    products: CalculatorProductItem[];
  };
  summary: CalculatorSummary;
  products: CalculatorProductItem[];
  rows: AdminProductCalculationRow[];
  totals: {
    totalGross: number;
    totalCoupons: number;
    totalCommission: number;
    totalGst: number;
    totalTcs: number;
    totalTds: number;
    totalNetSellerPayable: number;
    totalUnitsSold: number;
  };
}> {
  let query = supabaseAdmin
    .from("seller_settlements")
    .select(`
      id,
      order_id,
      order_number,
      order_item_code,
      product_id,
      product_title,
      sku,
      quantity,
      unit_price_paise,
      gross_amount_paise,
      platform_coupon_paise,
      seller_discount_paise,
      shipping_charge_paise,
      refunded_amount_paise,
      commission_rate,
      commission_amount_paise,
      gst_on_commission_paise,
      tcs_amount_paise,
      tds_amount_paise,
      net_seller_payable_paise,
      payment_method,
      fulfillment_status,
      settlement_status,
      delivered_at,
      settled_at,
      created_at,
      seller_id,
      seller_profiles (
        business_name,
        contact_name
      )
    `);

  if (filters.startDate) {
    query = query.gte("created_at", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("created_at", filters.endDate);
  }
  if (filters.sellerId && filters.sellerId !== "ALL") {
    query = query.eq("seller_id", filters.sellerId);
  }
  if (filters.status && filters.status !== "ALL") {
    query = query.eq("settlement_status", filters.status);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Error running admin product financial calculator:", error);
    const emptySummary: CalculatorSummary = {
      period_label: filters.startDate || filters.endDate ? "Custom Period" : "All Time",
      start_date: filters.startDate || "",
      end_date: filters.endDate || "",
      total_gross_sales: 0,
      total_customer_paid: 0,
      total_quantity: 0,
      total_platform_coupon_absorbed: 0,
      total_seller_discount: 0,
      total_commission: 0,
      total_shipping_charges: 0,
      total_refunds: 0,
      total_net_seller_payable: 0,
      distinct_products_count: 0,
      settlements_count: 0,
      currency: "INR",
      timezone: "Asia/Kolkata",
    };
    return {
      calculator: { summary: emptySummary, products: [] },
      summary: emptySummary,
      products: [],
      rows: [],
      totals: {
        totalGross: 0,
        totalCoupons: 0,
        totalCommission: 0,
        totalGst: 0,
        totalTcs: 0,
        totalTds: 0,
        totalNetSellerPayable: 0,
        totalUnitsSold: 0,
      },
    };
  }

  // Group by Product ID + Seller ID
  const productMap = new Map<
    string,
    CalculatorProductItem & {
      gst_on_commission: number;
      tcs_amount: number;
      tds_amount: number;
    }
  >();

  let totalGross = 0;
  let totalCoupons = 0;
  let totalDiscount = 0;
  let totalComm = 0;
  let totalGst = 0;
  let totalTcs = 0;
  let totalTds = 0;
  let totalShipping = 0;
  let totalRefunds = 0;
  let totalNet = 0;
  let totalUnits = 0;

  for (const item of data) {
    const key = `${item.product_id || item.product_title}_${item.seller_id}`;
    const prof = Array.isArray(item.seller_profiles) ? item.seller_profiles[0] : item.seller_profiles;
    const sellerName = prof?.business_name || prof?.contact_name || "Merchant";

    const gross = safeNumber(item.gross_amount_paise) / 100.0;
    const coupon = safeNumber(item.platform_coupon_paise) / 100.0;
    const discount = safeNumber(item.seller_discount_paise) / 100.0;
    const comm = safeNumber(item.commission_amount_paise) / 100.0;
    const gst = safeNumber(item.gst_on_commission_paise) / 100.0;
    const tcs = safeNumber(item.tcs_amount_paise) / 100.0;
    const tds = safeNumber(item.tds_amount_paise) / 100.0;
    const shipping = safeNumber(item.shipping_charge_paise) / 100.0;
    const refund = safeNumber(item.refunded_amount_paise) / 100.0;
    const net = safeNumber(item.net_seller_payable_paise) / 100.0;
    const qty = safeNumber(item.quantity, 1);

    totalGross += gross;
    totalCoupons += coupon;
    totalDiscount += discount;
    totalComm += comm;
    totalGst += gst;
    totalTcs += tcs;
    totalTds += tds;
    totalShipping += shipping;
    totalRefunds += refund;
    totalNet += net;
    totalUnits += qty;

    const orderDetail = {
      settlement_id: item.id,
      order_id: item.order_id,
      order_number: item.order_number,
      order_item_code: item.order_item_code || null,
      quantity: qty,
      unit_price: round2(safeNumber(item.unit_price_paise) / 100.0),
      unitPrice: round2(safeNumber(item.unit_price_paise) / 100.0),
      gross_amount: round2(gross),
      grossAmount: round2(gross),
      platform_coupon: round2(coupon),
      seller_discount: round2(discount),
      commission_amount: round2(comm),
      commission_rate_bps: Math.round(safeNumber(item.commission_rate) * 100),
      net_seller_payable: round2(net),
      settlement_status: item.settlement_status,
      payment_method: item.payment_method,
      delivered_at: item.delivered_at || null,
      hold_released_at: item.settled_at || null,
      created_at: item.created_at,
    };

    if (!productMap.has(key)) {
      productMap.set(key, {
        product_id: item.product_id || "",
        product_title: item.product_title || "Product",
        sku: item.sku || null,
        seller_id: item.seller_id,
        seller_name: sellerName,
        total_quantity: qty,
        gross_sales: gross,
        platform_coupon: coupon,
        seller_discount: discount,
        commission_amount: comm,
        avg_commission_percent: gross > 0 ? round2((comm / gross) * 100) : 0,
        shipping_charges: shipping,
        refunds: refund,
        net_seller_payable: net,
        gst_on_commission: gst,
        tcs_amount: tcs,
        tds_amount: tds,
        order_breakdown: [orderDetail],
      });
    } else {
      const existing = productMap.get(key)!;
      existing.total_quantity += qty;
      existing.gross_sales += gross;
      existing.platform_coupon += coupon;
      existing.seller_discount += discount;
      existing.commission_amount += comm;
      existing.avg_commission_percent =
        existing.gross_sales > 0 ? round2((existing.commission_amount / existing.gross_sales) * 100) : 0;
      existing.shipping_charges += shipping;
      existing.refunds += refund;
      existing.net_seller_payable += net;
      existing.gst_on_commission += gst;
      existing.tcs_amount += tcs;
      existing.tds_amount += tds;
      existing.order_breakdown.push(orderDetail);
    }
  }

  const products: CalculatorProductItem[] = Array.from(productMap.values()).map((p) => ({
    product_id: p.product_id,
    product_title: p.product_title,
    sku: p.sku,
    seller_id: p.seller_id,
    seller_name: p.seller_name,
    total_quantity: p.total_quantity,
    gross_sales: round2(p.gross_sales),
    platform_coupon: round2(p.platform_coupon),
    seller_discount: round2(p.seller_discount),
    commission_amount: round2(p.commission_amount),
    avg_commission_percent: round2(p.avg_commission_percent),
    shipping_charges: round2(p.shipping_charges),
    refunds: round2(p.refunds),
    net_seller_payable: round2(p.net_seller_payable),
    order_breakdown: p.order_breakdown,
  }));

  const summary: CalculatorSummary = {
    period_label: filters.startDate || filters.endDate ? "Custom Period" : "All Time",
    start_date: filters.startDate || "",
    end_date: filters.endDate || "",
    total_gross_sales: round2(totalGross),
    total_customer_paid: round2(totalGross + totalShipping - totalDiscount),
    total_quantity: totalUnits,
    total_platform_coupon_absorbed: round2(totalCoupons),
    total_seller_discount: round2(totalDiscount),
    total_commission: round2(totalComm),
    total_shipping_charges: round2(totalShipping),
    total_refunds: round2(totalRefunds),
    total_net_seller_payable: round2(totalNet),
    distinct_products_count: productMap.size,
    settlements_count: data.length,
    currency: "INR",
    timezone: "Asia/Kolkata",
  };

  const rows: AdminProductCalculationRow[] = Array.from(productMap.values()).map((p) => ({
    productId: p.product_id,
    productTitle: p.product_title,
    sku: p.sku,
    sellerId: p.seller_id,
    sellerName: p.seller_name,
    totalQuantity: p.total_quantity,
    grossAmount: round2(p.gross_sales),
    platformCouponContribution: round2(p.platform_coupon),
    commissionAmount: round2(p.commission_amount),
    gstOnCommission: round2(p.gst_on_commission),
    tcsAmount: round2(p.tcs_amount),
    tdsAmount: round2(p.tds_amount),
    netSellerPayable: round2(p.net_seller_payable),
    orderCount: p.order_breakdown.length,
    orders: p.order_breakdown.map((o) => ({
      orderNumber: o.order_number,
      orderDate: o.created_at,
      quantity: o.quantity,
      unitPrice: o.unit_price,
      grossAmount: o.gross_amount,
      couponContribution: o.platform_coupon,
      commissionRate: o.commission_rate_bps / 100,
      commissionAmount: o.commission_amount,
      netPayable: o.net_seller_payable,
      paymentMethod: o.payment_method,
      fulfillmentStatus: o.settlement_status,
      settlementStatus: o.settlement_status,
    })),
  }));

  return {
    calculator: {
      summary,
      products,
    },
    summary,
    products,
    rows,
    totals: {
      totalGross: round2(totalGross),
      totalCoupons: round2(totalCoupons),
      totalCommission: round2(totalComm),
      totalGst: round2(totalGst),
      totalTcs: round2(totalTcs),
      totalTds: round2(totalTds),
      totalNetSellerPayable: round2(totalNet),
      totalUnitsSold: totalUnits,
    },
  };
}

export interface AdminSellerFinanceRow {
  seller_id: string;
  seller_id_code: string | null;
  business_name: string;
  contact_name: string | null;
  business_email: string | null;
  phone: string | null;
  available_balance: number;
  locked_balance: number;
  pending_settlement: number;
  cod_awaiting_remittance: number;
  lifetime_earned: number;
  lifetime_withdrawn: number;
  pending_payout_amount: number;
  pending_payout_count: number;
  has_verified_bank: boolean;
  has_verified_upi: boolean;
  destination_status: "verified" | "pending" | "missing" | "rejected";
  bank_accounts: Array<{
    id: string;
    bank_name: string;
    account_holder_name: string;
    ifsc_code: string;
    account_number_last4: string;
    is_primary: boolean;
    status: string;
  }>;
  upi_id: string | null;
  last_payout_date: string | null;
  last_payout_status: string | null;
  last_payout_amount: number | null;
}

/**
 * Retrieves authoritative financial metrics and balances for all marketplace sellers.
 */
export async function getAdminSellersFinancialOverview(
  supabaseAdmin: SupabaseClient,
  filters?: { search?: string; verification?: string }
): Promise<{
  sellers: AdminSellerFinanceRow[];
  totals: {
    totalSellers: number;
    totalAvailableLiability: number;
    totalLockedLiability: number;
    totalPendingSettlement: number;
    totalCodAwaiting: number;
    totalDisbursed: number;
    totalPendingPayoutRequests: number;
    totalPendingPayoutAmount: number;
  };
}> {
  // 1. Fetch all seller profiles
  let query = supabaseAdmin
    .from("seller_profiles")
    .select("id, seller_id_code, business_name, contact_name, business_email, phone, upi_id, verification_status")
    .order("created_at", { ascending: false });

  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`business_name.ilike.${term},contact_name.ilike.${term},business_email.ilike.${term},seller_id_code.ilike.${term},upi_id.ilike.${term}`);
  }

  const { data: profiles, error: profErr } = await query;
  if (profErr) {
    console.error("Error fetching seller profiles:", profErr);
    throw new Error(`Failed to fetch seller profiles: ${profErr.message}`);
  }

  const sellerIds = (profiles || []).map((p: { id: string }) => p.id);
  if (sellerIds.length === 0) {
    return {
      sellers: [],
      totals: {
        totalSellers: 0,
        totalAvailableLiability: 0,
        totalLockedLiability: 0,
        totalPendingSettlement: 0,
        totalCodAwaiting: 0,
        totalDisbursed: 0,
        totalPendingPayoutRequests: 0,
        totalPendingPayoutAmount: 0,
      },
    };
  }

  // 2. Fetch seller balances
  const { data: balances, error: balErr } = await supabaseAdmin
    .from("seller_balances")
    .select("seller_id, available_balance, locked_balance, pending_balance, lifetime_earned, lifetime_withdrawn")
    .in("seller_id", sellerIds);

  if (balErr) {
    console.error("Error fetching seller balances:", balErr);
    throw new Error(`Failed to fetch seller balances: ${balErr.message}`);
  }

  interface SellerBalanceRecord {
    seller_id: string;
    available_balance: number | string | null;
    locked_balance: number | string | null;
    pending_balance: number | string | null;
    lifetime_earned: number | string | null;
    lifetime_withdrawn: number | string | null;
  }
  const balanceMap = new Map<string, SellerBalanceRecord>(
    ((balances || []) as unknown as SellerBalanceRecord[]).map((b) => [b.seller_id, b])
  );

  // 3. Fetch settlements
  const { data: settlements, error: setErr } = await supabaseAdmin
    .from("seller_settlements")
    .select("seller_id, settlement_status, payment_method, cod_reconciled, fulfillment_status, net_seller_payable_paise, gross_amount_paise")
    .in("seller_id", sellerIds);

  if (setErr) {
    console.error("Error fetching seller settlements:", setErr);
    throw new Error(`Failed to fetch seller settlements: ${setErr.message}`);
  }

  const setMap = new Map<string, { pendingSettlement: number; codAwaiting: number }>();
  for (const s of settlements || []) {
    if (!setMap.has(s.seller_id)) {
      setMap.set(s.seller_id, { pendingSettlement: 0, codAwaiting: 0 });
    }
    const cur = setMap.get(s.seller_id)!;
    if (s.settlement_status === "pending_delivery" || s.settlement_status === "on_hold") {
      cur.pendingSettlement += safeNumber(s.net_seller_payable_paise) / 100.0;
    }
    if (s.payment_method === "COD" && !s.cod_reconciled && s.fulfillment_status === "delivered") {
      cur.codAwaiting += safeNumber(s.gross_amount_paise) / 100.0;
    }
  }

  // 4. Fetch payout requests
  const { data: payoutRequests, error: payErr } = await supabaseAdmin
    .from("seller_payout_requests")
    .select("id, seller_id, status, amount, requested_at, paid_at")
    .in("seller_id", sellerIds)
    .order("requested_at", { ascending: false });

  if (payErr) {
    console.error("Error fetching payout requests:", payErr);
    throw new Error(`Failed to fetch payout requests: ${payErr.message}`);
  }

  const payMap = new Map<string, {
    pendingAmount: number;
    pendingCount: number;
    latestDate: string | null;
    latestStatus: string | null;
    latestAmount: number | null;
  }>();

  for (const p of payoutRequests || []) {
    if (!payMap.has(p.seller_id)) {
      payMap.set(p.seller_id, {
        pendingAmount: 0,
        pendingCount: 0,
        latestDate: p.requested_at,
        latestStatus: p.status,
        latestAmount: safeNumber(p.amount),
      });
    }
    const cur = payMap.get(p.seller_id)!;
    if (p.status === "pending") {
      cur.pendingAmount += safeNumber(p.amount);
      cur.pendingCount += 1;
    }
  }

  // 5. Fetch bank accounts
  const { data: bankAccounts, error: bankErr } = await supabaseAdmin
    .from("seller_bank_accounts")
    .select("id, seller_id, bank_name, account_holder_name, ifsc_code, account_number_last4, is_primary, status")
    .in("seller_id", sellerIds);

  if (bankErr) {
    console.error("Error fetching bank accounts:", bankErr);
    throw new Error(`Failed to fetch bank accounts: ${bankErr.message}`);
  }

  const bankMap = new Map<string, Array<{
    id: string;
    bank_name: string;
    account_holder_name: string;
    ifsc_code: string;
    account_number_last4: string;
    is_primary: boolean;
    status: string;
  }>>();

  for (const b of bankAccounts || []) {
    if (!bankMap.has(b.seller_id)) {
      bankMap.set(b.seller_id, []);
    }
    bankMap.get(b.seller_id)!.push({
      id: b.id,
      bank_name: b.bank_name,
      account_holder_name: b.account_holder_name,
      ifsc_code: b.ifsc_code,
      account_number_last4: b.account_number_last4,
      is_primary: Boolean(b.is_primary),
      status: b.status,
    });
  }

  let totalAvail = 0;
  let totalLocked = 0;
  let totalPendingSet = 0;
  let totalCod = 0;
  let totalDisbursed = 0;
  let totalPendingReqCount = 0;
  let totalPendingReqAmt = 0;

  const rows: AdminSellerFinanceRow[] = (profiles || []).map((sp: {
    id: string;
    seller_id_code: string | null;
    business_name: string | null;
    contact_name: string | null;
    business_email: string | null;
    phone: string | null;
    upi_id: string | null;
  }) => {
    const bal = balanceMap.get(sp.id) || {
      available_balance: 0,
      locked_balance: 0,
      pending_balance: 0,
      lifetime_earned: 0,
      lifetime_withdrawn: 0,
    };
    const set = setMap.get(sp.id) || { pendingSettlement: 0, codAwaiting: 0 };
    const pay = payMap.get(sp.id) || {
      pendingAmount: 0,
      pendingCount: 0,
      latestDate: null,
      latestStatus: null,
      latestAmount: null,
    };
    const banks = bankMap.get(sp.id) || [];
    const verifiedBanks = banks.filter((b) => b.status === "verified");
    const hasUpi = Boolean(sp.upi_id && sp.upi_id.trim());

    let destStatus: "verified" | "pending" | "missing" | "rejected" = "missing";
    if (verifiedBanks.length > 0 || hasUpi) {
      destStatus = "verified";
    } else if (banks.some((b) => b.status === "pending")) {
      destStatus = "pending";
    } else if (banks.some((b) => b.status === "rejected")) {
      destStatus = "rejected";
    }

    const avail = safeNumber(bal.available_balance);
    const locked = safeNumber(bal.locked_balance);
    const pendSet = round2(set.pendingSettlement);
    const cod = round2(set.codAwaiting);
    const earned = safeNumber(bal.lifetime_earned);
    const withdrawn = safeNumber(bal.lifetime_withdrawn);
    const pendPayAmt = round2(pay.pendingAmount);

    totalAvail += avail;
    totalLocked += locked;
    totalPendingSet += pendSet;
    totalCod += cod;
    totalDisbursed += withdrawn;
    totalPendingReqCount += pay.pendingCount;
    totalPendingReqAmt += pendPayAmt;

    return {
      seller_id: sp.id,
      seller_id_code: sp.seller_id_code,
      business_name: sp.business_name || "Unnamed Seller",
      contact_name: sp.contact_name,
      business_email: sp.business_email,
      phone: sp.phone,
      available_balance: round2(avail),
      locked_balance: round2(locked),
      pending_settlement: pendSet,
      cod_awaiting_remittance: cod,
      lifetime_earned: round2(earned),
      lifetime_withdrawn: round2(withdrawn),
      pending_payout_amount: pendPayAmt,
      pending_payout_count: pay.pendingCount,
      has_verified_bank: verifiedBanks.length > 0,
      has_verified_upi: hasUpi,
      destination_status: destStatus,
      bank_accounts: banks,
      upi_id: sp.upi_id,
      last_payout_date: pay.latestDate,
      last_payout_status: pay.latestStatus,
      last_payout_amount: pay.latestAmount,
    };
  });

  return {
    sellers: rows,
    totals: {
      totalSellers: rows.length,
      totalAvailableLiability: round2(totalAvail),
      totalLockedLiability: round2(totalLocked),
      totalPendingSettlement: round2(totalPendingSet),
      totalCodAwaiting: round2(totalCod),
      totalDisbursed: round2(totalDisbursed),
      totalPendingPayoutRequests: totalPendingReqCount,
      totalPendingPayoutAmount: round2(totalPendingReqAmt),
    },
  };
}

/**
 * Retrieves detailed financial statement, transaction ledger, and settlements for a specific seller.
 */
export async function getAdminSellerDetailedLedger(
  supabaseAdmin: SupabaseClient,
  sellerId: string
) {
  // 1. Profile & Stores
  const { data: seller, error: profErr } = await supabaseAdmin
    .from("seller_profiles")
    .select("*")
    .eq("id", sellerId)
    .maybeSingle();

  if (profErr || !seller) {
    throw new Error(profErr?.message || "Seller profile not found");
  }

  const { data: stores } = await supabaseAdmin
    .from("stores")
    .select("id, name, slug")
    .eq("seller_id", sellerId);

  // 2. Balances
  const { data: balance } = await supabaseAdmin
    .from("seller_balances")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  // 3. Ledger Entries
  const { data: ledger } = await supabaseAdmin
    .from("seller_ledger_entries")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(100);

  // 4. Settlements
  const { data: settlements } = await supabaseAdmin
    .from("seller_settlements")
    .select(`
      id,
      order_id,
      order_number,
      order_item_code,
      product_title,
      quantity,
      unit_price,
      gross_amount_paise,
      commission_amount_paise,
      net_seller_payable_paise,
      settlement_status,
      payment_method,
      cod_reconciled,
      fulfillment_status,
      delivered_at,
      hold_until,
      created_at
    `)
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(100);

  // 5. Payout Requests
  const { data: payouts } = await supabaseAdmin
    .from("seller_payout_requests")
    .select(`
      id,
      payout_number,
      amount,
      destination_type,
      bank_account_id,
      destination_snapshot,
      status,
      requested_at,
      approved_at,
      paid_at,
      rejected_at,
      rejection_reason,
      failed_at,
      failure_reason,
      admin_notes,
      payout_transfers (
        utr_reference,
        transfer_method,
        transferred_amount,
        actual_transfer_date,
        actual_transfer_time,
        destination_masked
      )
    `)
    .eq("seller_id", sellerId)
    .order("requested_at", { ascending: false });

  // 6. Bank accounts
  const { data: bankAccounts } = await supabaseAdmin
    .from("seller_bank_accounts")
    .select("id, bank_name, account_holder_name, branch_name, ifsc_code, account_number_last4, account_type, is_primary, status, rejection_reason, verified_at, created_at")
    .eq("seller_id", sellerId);

  return {
    seller: {
      id: seller.id,
      seller_id_code: seller.seller_id_code,
      business_name: seller.business_name,
      contact_name: seller.contact_name,
      business_email: seller.business_email,
      phone: seller.phone,
      upi_id: seller.upi_id,
      upi_qr_url: seller.upi_qr_url,
      stores: stores || [],
    },
    balances: {
      available_balance: safeNumber(balance?.available_balance),
      locked_balance: safeNumber(balance?.locked_balance),
      pending_balance: safeNumber(balance?.pending_balance),
      lifetime_earned: safeNumber(balance?.lifetime_earned),
      lifetime_withdrawn: safeNumber(balance?.lifetime_withdrawn),
    },
    ledger: (ledger || []).map((l: {
      id: string;
      entry_type: string;
      direction: string;
      amount_paise: number;
      available_balance_after_paise: number;
      description: string;
      created_at: string;
      metadata: Record<string, unknown>;
    }) => ({
      id: l.id,
      entry_type: l.entry_type,
      direction: l.direction,
      amount: round2(safeNumber(l.amount_paise) / 100.0),
      available_balance_after: round2(safeNumber(l.available_balance_after_paise) / 100.0),
      description: l.description,
      created_at: l.created_at,
      metadata: l.metadata,
    })),
    settlements: (settlements || []).map((s: {
      id: string;
      order_id: string;
      order_number: string;
      order_item_code: string | null;
      product_title: string;
      quantity: number;
      unit_price: number;
      gross_amount_paise: number;
      commission_amount_paise: number;
      net_seller_payable_paise: number;
      settlement_status: string;
      payment_method: string;
      cod_reconciled: boolean;
      fulfillment_status: string;
      delivered_at: string | null;
      hold_until: string | null;
      created_at: string;
    }) => ({
      id: s.id,
      order_id: s.order_id,
      order_number: s.order_number,
      order_item_code: s.order_item_code,
      product_title: s.product_title,
      quantity: s.quantity,
      unit_price: s.unit_price,
      gross_amount: round2(safeNumber(s.gross_amount_paise) / 100.0),
      commission_amount: round2(safeNumber(s.commission_amount_paise) / 100.0),
      net_seller_payable: round2(safeNumber(s.net_seller_payable_paise) / 100.0),
      settlement_status: s.settlement_status,
      payment_method: s.payment_method,
      cod_reconciled: Boolean(s.cod_reconciled),
      fulfillment_status: s.fulfillment_status,
      delivered_at: s.delivered_at,
      hold_until: s.hold_until,
      created_at: s.created_at,
    })),
    payouts: (payouts || []).map((p: {
      id: string;
      payout_number: string;
      amount: number;
      destination_type: string;
      destination_snapshot: Record<string, unknown>;
      status: string;
      requested_at: string;
      approved_at: string | null;
      paid_at: string | null;
      rejected_at: string | null;
      rejection_reason: string | null;
      failed_at: string | null;
      failure_reason: string | null;
      admin_notes: string | null;
      payout_transfers?: Array<{
        utr_reference: string;
        transfer_method: string;
        transferred_amount: number;
        actual_transfer_date: string;
        actual_transfer_time: string;
        destination_masked: string;
      }>;
    }) => ({
      id: p.id,
      payout_number: p.payout_number,
      amount: safeNumber(p.amount),
      destination_type: p.destination_type,
      destination_snapshot: p.destination_snapshot,
      status: p.status,
      requested_at: p.requested_at,
      approved_at: p.approved_at,
      paid_at: p.paid_at,
      rejected_at: p.rejected_at,
      rejection_reason: p.rejection_reason,
      failed_at: p.failed_at,
      failure_reason: p.failure_reason,
      admin_notes: p.admin_notes,
      transfer: p.payout_transfers && p.payout_transfers[0] ? p.payout_transfers[0] : null,
    })),
    bank_accounts: bankAccounts || [],
  };
}
