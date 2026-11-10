import { SupabaseClient } from "@supabase/supabase-js";

export interface SellerFinancialSummary {
  seller_id: string;
  gross_product_sales: number;
  pending_settlement: number;
  on_hold_earnings: number;
  available_to_withdraw: number;
  reserved_for_payout: number;
  payout_processing: number;
  total_paid_to_seller: number;
  refunds_and_adjustments: number;
  cod_expected_remittance: number;
  cod_received_and_reconciled: number;
  minimum_payout_amount: number;
  currency: string;
  timezone: string;
}

export interface VerifiedPayoutDestination {
  id: string;
  type: "BANK_ACCOUNT" | "UPI";
  label: string;
  subLabel: string;
  isPrimary: boolean;
  bankAccountId?: string;
  upiId?: string;
}

/**
 * Fetches authoritative real-time financial balances for a seller.
 */
export async function getSellerFinancialSummary(
  supabaseAdmin: SupabaseClient,
  sellerId: string
): Promise<SellerFinancialSummary> {
  // Read-only query: Settlement hold releases are handled by scheduled cron / dedicated worker
  const { data, error } = await supabaseAdmin.rpc("get_seller_financial_summary", {
    p_seller_id: sellerId,
  });

  if (error || !data) {
    console.error("Error fetching seller financial summary:", error);
    return {
      seller_id: sellerId,
      gross_product_sales: 0,
      pending_settlement: 0,
      on_hold_earnings: 0,
      available_to_withdraw: 0,
      reserved_for_payout: 0,
      payout_processing: 0,
      total_paid_to_seller: 0,
      refunds_and_adjustments: 0,
      cod_expected_remittance: 0,
      cod_received_and_reconciled: 0,
      minimum_payout_amount: 10,
      currency: "INR",
      timezone: "Asia/Kolkata",
    };
  }

  return {
    seller_id: data.seller_id || sellerId,
    gross_product_sales: Number(data.gross_product_sales || 0),
    pending_settlement: Number(data.pending_settlement || 0),
    on_hold_earnings: Number(data.on_hold_earnings || 0),
    available_to_withdraw: Number(data.available_to_withdraw || 0),
    reserved_for_payout: Number(data.reserved_for_payout || 0),
    payout_processing: Number(data.payout_processing || 0),
    total_paid_to_seller: Number(data.total_paid_to_seller || 0),
    refunds_and_adjustments: Number(data.refunds_and_adjustments || 0),
    cod_expected_remittance: Number(data.cod_expected_remittance || 0),
    cod_received_and_reconciled: Number(data.cod_received_and_reconciled || 0),
    minimum_payout_amount: Number(data.minimum_payout_amount || 10),
    currency: data.currency || "INR",
    timezone: data.timezone || "Asia/Kolkata",
  };
}

/**
 * Fetches verified payout destinations (Bank accounts & UPI) for a seller.
 */
export async function getVerifiedSellerDestinations(
  supabaseAdmin: SupabaseClient,
  sellerId: string
): Promise<VerifiedPayoutDestination[]> {
  const destinations: VerifiedPayoutDestination[] = [];

  // 1. Verified Bank Accounts
  const { data: bankAccounts } = await supabaseAdmin
    .from("seller_bank_accounts")
    .select("id, bank_name, branch_name, ifsc_code, account_number_last4, account_holder_name, is_primary, status")
    .eq("seller_id", sellerId)
    .eq("status", "verified")
    .order("is_primary", { ascending: false });

  if (bankAccounts && bankAccounts.length > 0) {
    for (const b of bankAccounts) {
      destinations.push({
        id: `BANK_${b.id}`,
        type: "BANK_ACCOUNT",
        label: `${b.bank_name} (A/C ending in ${b.account_number_last4})`,
        subLabel: `${b.account_holder_name} • IFSC: ${b.ifsc_code}`,
        isPrimary: Boolean(b.is_primary),
        bankAccountId: b.id,
      });
    }
  }

  // 2. Verified UPI Details from seller_profiles
  const { data: sellerProf } = await supabaseAdmin
    .from("seller_profiles")
    .select("upi_id, business_name")
    .eq("id", sellerId)
    .maybeSingle();

  if (sellerProf?.upi_id && sellerProf.upi_id.trim().length > 0) {
    destinations.push({
      id: `UPI_${sellerId}`,
      type: "UPI",
      label: `UPI ID: ${sellerProf.upi_id}`,
      subLabel: `${sellerProf.business_name || "Registered Merchant"} • Instant UPI Transfer`,
      isPrimary: destinations.length === 0, // Primary if no bank account is set
      upiId: sellerProf.upi_id,
    });
  }

  return destinations;
}

export interface SellerPayoutHistoryItem {
  id: string;
  payout_number: string;
  amount: number;
  amount_paise: number;
  destination_type: "BANK_ACCOUNT" | "UPI";
  destination_snapshot: Record<string, unknown>;
  status: "pending" | "approved" | "processing" | "paid" | "rejected" | "failed" | "cancelled";
  requested_at: string;
  approved_at: string | null;
  processing_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  transfer?: {
    utr_reference: string;
    transfer_method: string;
    transferred_amount: number;
    actual_transfer_date: string;
    actual_transfer_time: string;
    actual_transfer_timestamp: string;
    destination_masked: string;
  } | null;
}

/**
 * Fetches payout requests history for a seller.
 */
export async function getSellerPayoutHistory(
  supabaseAdmin: SupabaseClient,
  sellerId: string
): Promise<SellerPayoutHistoryItem[]> {
  const { data: requests, error } = await supabaseAdmin
    .from("seller_payout_requests")
    .select(`
      id,
      payout_number,
      amount,
      amount_paise,
      destination_type,
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
      payout_transfers (
        utr_reference,
        transfer_method,
        transferred_amount,
        actual_transfer_date,
        actual_transfer_time,
        actual_transfer_timestamp,
        destination_masked
      )
    `)
    .eq("seller_id", sellerId)
    .order("requested_at", { ascending: false });

  if (error || !requests) {
    console.error("Error fetching seller payout history:", error);
    return [];
  }

  return requests.map((item) => {
    const transferRaw = Array.isArray(item.payout_transfers)
      ? item.payout_transfers[0]
      : item.payout_transfers;

    return {
      id: item.id,
      payout_number: item.payout_number,
      amount: Number(item.amount),
      amount_paise: Number(item.amount_paise),
      destination_type: item.destination_type,
      destination_snapshot: (item.destination_snapshot as Record<string, unknown>) || {},
      status: item.status,
      requested_at: item.requested_at,
      approved_at: item.approved_at,
      processing_at: item.processing_at,
      paid_at: item.paid_at,
      rejected_at: item.rejected_at,
      rejection_reason: item.rejection_reason,
      failed_at: item.failed_at,
      failure_reason: item.failure_reason,
      admin_notes: item.admin_notes,
      transfer: transferRaw
        ? {
            utr_reference: transferRaw.utr_reference,
            transfer_method: transferRaw.transfer_method,
            transferred_amount: Number(transferRaw.transferred_amount),
            actual_transfer_date: transferRaw.actual_transfer_date,
            actual_transfer_time: transferRaw.actual_transfer_time,
            actual_transfer_timestamp: transferRaw.actual_transfer_timestamp,
            destination_masked: transferRaw.destination_masked,
          }
        : null,
    };
  });
}

export interface SellerEarningsFilter {
  dateRangePreset?: "today" | "yesterday" | "last7days" | "last30days" | "thisMonth" | "prevMonth" | "custom";
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SellerSettlementItem {
  id: string;
  order_id: string;
  order_number: string;
  order_item_code: string | null;
  product_id: string | null;
  product_title: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  platform_coupon: number;
  commission_rate: number;
  commission_amount: number;
  gst_on_commission: number;
  tcs_amount: number;
  tds_amount: number;
  net_seller_payable: number;
  payment_method: string;
  payment_status: string;
  fulfillment_status: string;
  delivered_at: string | null;
  hold_until: string | null;
  cod_reconciled: boolean;
  settlement_status: "pending_delivery" | "on_hold" | "eligible_released" | "refunded_adjusted" | "cancelled";
  created_at: string;
}

/**
 * Fetches date-wise earnings and product sales report for a seller.
 */
export async function getSellerEarningsReport(
  supabaseAdmin: SupabaseClient,
  sellerId: string,
  filter: SellerEarningsFilter
): Promise<{
  items: SellerSettlementItem[];
  totalCount: number;
  summary: {
    totalGross: number;
    totalCommission: number;
    totalNetPayable: number;
    totalItemsSold: number;
  };
}> {
  let query = supabaseAdmin
    .from("seller_settlements")
    .select("*", { count: "exact" })
    .eq("seller_id", sellerId);

  // Date Filtering
  if (filter.startDate) {
    query = query.gte("created_at", filter.startDate);
  }
  if (filter.endDate) {
    query = query.lte("created_at", filter.endDate);
  }

  // Settlement Status Filter
  if (filter.status && filter.status !== "ALL") {
    query = query.eq("settlement_status", filter.status);
  }

  // Search Filter
  if (filter.search && filter.search.trim().length > 0) {
    const s = `%${filter.search.trim()}%`;
    query = query.or(`order_number.ilike.${s},product_title.ilike.${s},sku.ilike.${s}`);
  }

  // Sorting & Pagination
  const page = filter.page && filter.page > 0 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize > 0 ? filter.pageSize : 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error || !data) {
    console.error("Error fetching seller earnings report:", error);
    return {
      items: [],
      totalCount: 0,
      summary: { totalGross: 0, totalCommission: 0, totalNetPayable: 0, totalItemsSold: 0 },
    };
  }

  let totalGross = 0;
  let totalCommission = 0;
  let totalNetPayable = 0;
  let totalItemsSold = 0;

  const items: SellerSettlementItem[] = data.map((r) => {
    const gross = Number(r.gross_amount_paise || 0) / 100.0;
    const comm = Number(r.commission_amount_paise || 0) / 100.0;
    const net = Number(r.net_seller_payable_paise || 0) / 100.0;
    const qty = Number(r.quantity || 1);

    totalGross += gross;
    totalCommission += comm;
    totalNetPayable += net;
    totalItemsSold += qty;

    return {
      id: r.id,
      order_id: r.order_id,
      order_number: r.order_number,
      order_item_code: r.order_item_code,
      product_id: r.product_id,
      product_title: r.product_title,
      sku: r.sku,
      quantity: qty,
      unit_price: Number(r.unit_price_paise || 0) / 100.0,
      gross_amount: gross,
      platform_coupon: Number(r.platform_coupon_paise || 0) / 100.0,
      commission_rate: Number(r.commission_rate || 0),
      commission_amount: comm,
      gst_on_commission: Number(r.gst_on_commission_paise || 0) / 100.0,
      tcs_amount: Number(r.tcs_amount_paise || 0) / 100.0,
      tds_amount: Number(r.tds_amount_paise || 0) / 100.0,
      net_seller_payable: net,
      payment_method: r.payment_method,
      payment_status: r.payment_status,
      fulfillment_status: r.fulfillment_status,
      delivered_at: r.delivered_at,
      hold_until: r.hold_until,
      cod_reconciled: Boolean(r.cod_reconciled),
      settlement_status: r.settlement_status,
      created_at: r.created_at,
    };
  });

  return {
    items,
    totalCount: count || items.length,
    summary: {
      totalGross: Math.round(totalGross * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalNetPayable: Math.round(totalNetPayable * 100) / 100,
      totalItemsSold,
    },
  };
}

/**
 * Fetches auditable financial ledger entries for a seller.
 */
export async function getSellerLedgerEntries(
  supabaseAdmin: SupabaseClient,
  sellerId: string,
  limit: number = 50
) {
  const { data, error } = await supabaseAdmin
    .from("seller_ledger_entries")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    settlement_id: r.settlement_id,
    payout_request_id: r.payout_request_id,
    entry_type: r.entry_type,
    direction: r.direction,
    amount: Number(r.amount_paise || 0) / 100.0,
    amount_paise: Number(r.amount_paise || 0),
    balance_type: r.balance_type,
    available_balance_after: Number(r.available_balance_after_paise || 0) / 100.0,
    idempotency_key: r.idempotency_key,
    description: r.description,
    actor_type: r.actor_type,
    created_at: r.created_at,
  }));
}
