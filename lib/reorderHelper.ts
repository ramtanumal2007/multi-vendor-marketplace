import { SupabaseClient } from "@supabase/supabase-js";
import { CartItem } from "@/lib/context/CartContext";

export interface ReorderResult {
  addedCount: number;
  unavailableCount: number;
  messages: string[];
}

export async function executeReorder(
  supabase: SupabaseClient,
  orderId: string,
  addItem: (item: Omit<CartItem, "quantity">, qty?: number, openDrawer?: boolean) => void,
  openDrawer?: () => void
): Promise<ReorderResult> {
  // 1. Fetch order items
  const { data: orderItems, error: itemsErr } = await supabase
    .from("order_items")
    .select("product_id, title, quantity")
    .eq("order_id", orderId);

  if (itemsErr || !orderItems || orderItems.length === 0) {
    return {
      addedCount: 0,
      unavailableCount: 0,
      messages: ["No items found for this order."],
    };
  }

  const productIds = orderItems
    .map((item: { product_id?: string | null }) => item.product_id)
    .filter(Boolean) as string[];

  if (productIds.length === 0) {
    return {
      addedCount: 0,
      unavailableCount: orderItems.length,
      messages: ["The original products are no longer available in the store."],
    };
  }

  // 2. Fetch live product status, stock, and current pricing (never assume old price)
  const { data: liveProducts, error: prodErr } = await supabase
    .from("products")
    .select("id, title, price, sale_price, stock_quantity, status, product_images(image_url)")
    .in("id", productIds);

  if (prodErr || !liveProducts) {
    return {
      addedCount: 0,
      unavailableCount: orderItems.length,
      messages: ["Could not verify current product availability."],
    };
  }

  interface LiveProductRow {
    id: string;
    title: string;
    price: number;
    sale_price?: number | null;
    stock_quantity?: number | null;
    status: string;
    product_images?: Array<{ image_url: string }>;
  }

  const liveMap = new Map<string, LiveProductRow>();
  (liveProducts as LiveProductRow[]).forEach((p) => {
    liveMap.set(p.id, p);
  });

  let addedCount = 0;
  let unavailableCount = 0;
  const messages: string[] = [];

  for (const item of orderItems) {
    const liveProd = item.product_id ? liveMap.get(item.product_id) : null;

    if (!liveProd || liveProd.status !== "active") {
      unavailableCount++;
      messages.push(`"${item.title}" is no longer available.`);
      continue;
    }

    const availableStock = liveProd.stock_quantity ?? 0;
    if (availableStock <= 0) {
      unavailableCount++;
      messages.push(`"${liveProd.title}" is currently out of stock.`);
      continue;
    }

    // Respect stock cap
    const qtyToAdd = Math.min(item.quantity, availableStock);
    if (qtyToAdd < item.quantity) {
      messages.push(`Only ${qtyToAdd} unit(s) of "${liveProd.title}" left in stock.`);
    }

    const currentPrice = Number(liveProd.sale_price || liveProd.price);
    const mrp = Number(liveProd.price);
    const primaryImg = liveProd.product_images?.[0]?.image_url || "/placeholder.jpg";

    addItem(
      {
        id: liveProd.id,
        productId: liveProd.id,
        title: liveProd.title,
        price: currentPrice,
        mrp: mrp,
        image: primaryImg,
      },
      qtyToAdd,
      false
    );

    addedCount++;
  }

  if (addedCount > 0 && openDrawer) {
    openDrawer();
  }

  return {
    addedCount,
    unavailableCount,
    messages,
  };
}
