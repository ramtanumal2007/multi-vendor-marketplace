export const DEFAULT_SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Marketplace";

export interface SiteConfig {
  siteName: string;
  tagline?: string;
  contactEmail?: string;
  contactPhone?: string;
  currencyCode: string;
  currencySymbol: string;
}

export const defaultSiteConfig: SiteConfig = {
  siteName: DEFAULT_SITE_NAME,
  currencyCode: "USD",
  currencySymbol: "$",
};

export async function fetchSiteConfig(supabaseClient: Record<string, any> | null): Promise<SiteConfig> {
  try {
    if (!supabaseClient) return defaultSiteConfig;
    const { data } = await supabaseClient
      .from("site_settings")
      .select("site_name, tagline, contact_email, contact_phone, currency_code, currency_symbol")
      .limit(1)
      .single();

    if (data) {
      return {
        siteName: data.site_name || DEFAULT_SITE_NAME,
        tagline: data.tagline,
        contactEmail: data.contact_email,
        contactPhone: data.contact_phone,
        currencyCode: data.currency_code || "USD",
        currencySymbol: data.currency_symbol || "$",
      };
    }
  } catch (err) {
    console.warn("Failed to load site config from DB, using fallback:", err);
  }

  return defaultSiteConfig;
}
