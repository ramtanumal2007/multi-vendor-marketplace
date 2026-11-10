/**
 * VENDOSMITH Delivery Engine (Asia/Kolkata Timezone)
 * Authoritative delivery date calculations, cutoff handling, mixed-cart rules, and scheduling.
 */

export interface DeliveryEstimate {
  minDays: number;
  maxDays: number;
  minDate: Date;
  maxDate: Date;
  minDateFormatted: string; // DD-MM-YYYY
  maxDateFormatted: string; // DD-MM-YYYY
  displayText: string;
  isPastCutoff: boolean;
  orderDateIST: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const CUTOFF_HOUR_IST = 18; // 6:00 PM IST

/**
 * Returns current timestamp converted to Asia/Kolkata Date representation
 */
export function getNowIST(): Date {
  const nowUtc = Date.now();
  return new Date(nowUtc + IST_OFFSET_MS);
}

/**
 * Formats a Date object to DD-MM-YYYY in India Standard Time
 */
export function formatDateDDMMYYYY(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Formats a Date object to readable string e.g. "Tue, 6 Oct 2026"
 */
export function formatReadableDateIST(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = days[date.getUTCDay()];
  const dayNum = date.getUTCDate();
  const monthName = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

export interface DeliveryItemCategoryInfo {
  categorySlug?: string | null;
  categoryName?: string | null;
  processingDays?: number | null;
}

/**
 * Computes authoritative delivery date estimate for an order or cart.
 * - General products: target delivery within 3 calendar days of order placement.
 * - Grocery and Cake: estimated delivery in 1 to 2 days.
 * - Mixed cart: accommodates the slowest-delivery item.
 * - 18:00 IST cutoff: orders after 6 PM begin counting from the next calendar day.
 */
export function calculateDeliveryEstimate(
  items: DeliveryItemCategoryInfo[],
  orderPlacedAt?: Date | string | null
): DeliveryEstimate {
  // Base IST date determination
  const baseDate = orderPlacedAt
    ? new Date(new Date(orderPlacedAt).getTime() + IST_OFFSET_MS)
    : getNowIST();

  const hourIST = baseDate.getUTCHours();
  const isPastCutoff = hourIST >= CUTOFF_HOUR_IST;

  // Additional day offset if placed after 18:00 IST
  const cutoffOffsetDays = isPastCutoff ? 1 : 0;

  // Determine fastest and slowest items in cart
  let maxMinDays = 1;
  let maxMaxDays = 2;

  const hasGeneralMerchandise = items.length === 0 || items.some((item) => {
    const slug = (item.categorySlug || "").toLowerCase();
    const name = (item.categoryName || "").toLowerCase();
    const isGrocery = slug.includes("grocery") || name.includes("grocery") || slug.includes("food");
    const isCake = slug.includes("cake") || name.includes("cake");
    return !isGrocery && !isCake;
  });

  if (hasGeneralMerchandise) {
    // General products: Target delivery within 3 calendar days
    maxMinDays = 2;
    maxMaxDays = 3;
  } else {
    // Grocery and Cake only: 1 to 2 days
    maxMinDays = 1;
    maxMaxDays = 2;
  }

  // Check custom seller processing days override if configured
  for (const item of items) {
    if (typeof item.processingDays === "number" && item.processingDays > 0) {
      const customMin = item.processingDays + 1;
      const customMax = item.processingDays + 3;
      if (customMin > maxMinDays) maxMinDays = customMin;
      if (customMax > maxMaxDays) maxMaxDays = customMax;
    }
  }

  const effectiveMinDays = maxMinDays + cutoffOffsetDays;
  const effectiveMaxDays = maxMaxDays + cutoffOffsetDays;

  // Calculate target dates
  const minDeliveryDate = new Date(baseDate.getTime());
  minDeliveryDate.setUTCDate(minDeliveryDate.getUTCDate() + effectiveMinDays);

  const maxDeliveryDate = new Date(baseDate.getTime());
  maxDeliveryDate.setUTCDate(maxDeliveryDate.getUTCDate() + effectiveMaxDays);

  const minFormatted = formatDateDDMMYYYY(minDeliveryDate);
  const maxFormatted = formatDateDDMMYYYY(maxDeliveryDate);

  let displayText = "";
  if (minFormatted === maxFormatted) {
    displayText = `Target Delivery: ${minFormatted} (${formatReadableDateIST(minDeliveryDate)})`;
  } else {
    displayText = `Target Delivery: ${minFormatted} to ${maxFormatted} (${formatReadableDateIST(minDeliveryDate)} - ${formatReadableDateIST(maxDeliveryDate)})`;
  }

  return {
    minDays: effectiveMinDays,
    maxDays: effectiveMaxDays,
    minDate: minDeliveryDate,
    maxDate: maxDeliveryDate,
    minDateFormatted: minFormatted,
    maxDateFormatted: maxFormatted,
    displayText,
    isPastCutoff,
    orderDateIST: formatDateDDMMYYYY(baseDate),
  };
}

/**
 * Returns list of valid customer scheduling dates (starting from min delivery date).
 */
export function getAvailableSchedulingDates(
  items: DeliveryItemCategoryInfo[],
  daysAhead: number = 7
): Array<{ dateString: string; readableString: string; isWeekend: boolean }> {
  const estimate = calculateDeliveryEstimate(items);
  const available: Array<{ dateString: string; readableString: string; isWeekend: boolean }> = [];

  const runner = new Date(estimate.minDate.getTime());

  for (let i = 0; i < daysAhead; i++) {
    const dayOfWeek = runner.getUTCDay();
    const isWeekend = dayOfWeek === 0; // Sunday

    available.push({
      dateString: formatDateDDMMYYYY(runner),
      readableString: formatReadableDateIST(runner),
      isWeekend,
    });

    runner.setUTCDate(runner.getUTCDate() + 1);
  }

  return available;
}

/**
 * Validates a customer scheduled delivery date on the server.
 */
export function validateScheduledDeliveryDate(
  scheduledDateDDMMYYYY: string,
  items: DeliveryItemCategoryInfo[]
): { isValid: boolean; message?: string } {
  if (!scheduledDateDDMMYYYY || typeof scheduledDateDDMMYYYY !== "string") {
    return { isValid: false, message: "Invalid scheduled delivery date format." };
  }

  const parts = scheduledDateDDMMYYYY.split("-");
  if (parts.length !== 3) {
    return { isValid: false, message: "Date must be in DD-MM-YYYY format." };
  }

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  const selectedDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const estimate = calculateDeliveryEstimate(items);

  // Strip time for clean day comparison
  const minDateMidnight = new Date(Date.UTC(
    estimate.minDate.getUTCFullYear(),
    estimate.minDate.getUTCMonth(),
    estimate.minDate.getUTCDate(),
    0, 0, 0
  ));

  if (selectedDate.getTime() < minDateMidnight.getTime()) {
    return {
      isValid: false,
      message: `Selected delivery date ${scheduledDateDDMMYYYY} cannot be earlier than earliest available date (${estimate.minDateFormatted}).`,
    };
  }

  // Reject dates more than 14 days in the future
  const maxAllowedDate = new Date(minDateMidnight.getTime());
  maxAllowedDate.setUTCDate(maxAllowedDate.getUTCDate() + 14);

  if (selectedDate.getTime() > maxAllowedDate.getTime()) {
    return {
      isValid: false,
      message: `Selected delivery date ${scheduledDateDDMMYYYY} is beyond the 14-day scheduling window.`,
    };
  }

  return { isValid: true };
}
