-- ==============================================================================
-- SEED DEFAULT MARKETPLACE CATEGORIES MIGRATION
-- ==============================================================================

BEGIN;

INSERT INTO public.categories (name, slug, description, sort_order)
VALUES
  ('Men''s Fashion', 'mens-fashion', 'Men''s clothing, shirts, denim, and apparel', 1),
  ('Women''s Fashion', 'womens-fashion', 'Women''s dresses, tops, ethnic wear, and western wear', 2),
  ('Electronics & Gadgets', 'electronics', 'Smartphones, audio gear, wearables, and tech accessories', 3),
  ('Grocery & Food', 'grocery-food', 'Daily essentials, packaged food, beverages, and snacks', 4),
  ('Home & Living', 'home-living', 'Bedding, home decor, kitchen essentials, and lighting', 5),
  ('Beauty & Personal Care', 'beauty-care', 'Skincare, haircare, grooming, and fragrances', 6),
  ('Footwear', 'footwear', 'Sneakers, formal shoes, sandals, and sports footwear', 7),
  ('Fashion Accessories', 'accessories', 'Watches, sunglasses, bags, wallets, and jewelry', 8),
  ('Books & Stationery', 'books-stationery', 'Fiction, non-fiction, academic books, and office supplies', 9),
  ('Sports & Fitness', 'sports-fitness', 'Exercise equipment, sportswear, activewear, and gear', 10),
  ('Toys & Baby', 'toys-baby', 'Baby care products, educational toys, and games', 11),
  ('Hand Craft', 'hand-craft', 'Artisan handicrafts, pottery, handmade decor, and gifts', 12)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

COMMIT;
