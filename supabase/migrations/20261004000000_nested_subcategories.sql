-- ==============================================================================
-- VENDOSMITH: NESTED SUBCATEGORIES SEED MIGRATION
-- Prepared locally only. Do NOT run automatically in production/staging.
-- ==============================================================================

BEGIN;

-- Helper function or direct inserts using parent category slugs
DO $$
DECLARE
    groc_id UUID;
    elec_id UUID;
    book_id UUID;
    hand_id UUID;
    cake_id UUID;
    mens_id UUID;
    womn_id UUID;
    foot_id UUID;
    beau_id UUID;
    home_id UUID;
    acc_id  UUID;
    spor_id UUID;
    toys_id UUID;
BEGIN
    SELECT id INTO groc_id FROM public.categories WHERE slug = 'grocery-food';
    SELECT id INTO elec_id FROM public.categories WHERE slug = 'electronics';
    SELECT id INTO book_id FROM public.categories WHERE slug = 'books-stationery';
    SELECT id INTO hand_id FROM public.categories WHERE slug = 'hand-craft';
    SELECT id INTO cake_id FROM public.categories WHERE slug = 'cake';
    SELECT id INTO mens_id FROM public.categories WHERE slug = 'mens-fashion';
    SELECT id INTO womn_id FROM public.categories WHERE slug = 'womens-fashion';
    SELECT id INTO foot_id FROM public.categories WHERE slug = 'footwear';
    SELECT id INTO beau_id FROM public.categories WHERE slug = 'beauty-care';
    SELECT id INTO home_id FROM public.categories WHERE slug = 'home-living';
    SELECT id INTO acc_id  FROM public.categories WHERE slug = 'accessories';
    SELECT id INTO spor_id FROM public.categories WHERE slug = 'sports-fitness';
    SELECT id INTO toys_id FROM public.categories WHERE slug = 'toys-baby';

    -- Grocery & Food Subcategories
    IF groc_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Rice & Grains', 'rice-grains', groc_id, 1, 'Rice, grains, pulses and staples'),
            ('Oil & Spices', 'oil-spices', groc_id, 2, 'Cooking oils, ghee, whole spices and masalas'),
            ('Snacks', 'snacks', groc_id, 3, 'Chips, namkeen, biscuits and munchies'),
            ('Beverages', 'beverages', groc_id, 4, 'Tea, coffee, juices and packaged beverages')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Electronics & Gadgets Subcategories
    IF elec_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Mobiles', 'mobiles', elec_id, 1, 'Smartphones and feature phones'),
            ('Accessories', 'electronics-accessories', elec_id, 2, 'Chargers, cases, cables and mounts'),
            ('Audio', 'audio', elec_id, 3, 'Headphones, earphones, speakers and soundbars'),
            ('Computers', 'computers', elec_id, 4, 'Laptops, desktops, monitors and peripherals')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Books & Stationery Subcategories
    IF book_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Academic Books', 'academic-books', book_id, 1, 'Textbooks, reference and school books'),
            ('Notebooks', 'notebooks', book_id, 2, 'Diaries, spiral notebooks and journals'),
            ('Office Supplies', 'office-supplies', book_id, 3, 'Pens, desk organizers, paper and art supplies')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Hand Craft Subcategories
    IF hand_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Handmade Gifts', 'handmade-gifts', hand_id, 1, 'Artisan gifts, customized handmade keepsakes'),
            ('Home Decor', 'home-decor', hand_id, 2, 'Pottery, terracotta, clay crafts and wall hangings'),
            ('Bengali Handicrafts', 'bengali-handicrafts', hand_id, 3, 'Kantha stitch, dokra, terracotta and traditional craft')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Cake Subcategories
    IF cake_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Birthday Cakes', 'birthday-cakes', cake_id, 1, 'Fresh celebration birthday cakes in various flavors'),
            ('Custom Cakes', 'custom-cakes', cake_id, 2, 'Designer fondant, photo cakes and tier cakes'),
            ('Pastries', 'pastries', cake_id, 3, 'Sliced pastries, brownies, cupcakes and sweet bites')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Men's Fashion Subcategories
    IF mens_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('T-Shirts & Polos', 'mens-tshirts', mens_id, 1, 'Casual tees, crewnecks and polo shirts'),
            ('Shirts', 'mens-shirts', mens_id, 2, 'Formal and casual button-down shirts'),
            ('Jeans & Trousers', 'mens-jeans', mens_id, 3, 'Denim jeans, chinos and trousers')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Women's Fashion Subcategories
    IF womn_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Ethnic Wear', 'womens-ethnic', womn_id, 1, 'Sarees, kurtis, suits and lehengas'),
            ('Western Wear', 'womens-western', womn_id, 2, 'Tops, t-shirts, jeans and skirts'),
            ('Dresses', 'womens-dresses', womn_id, 3, 'One-piece dresses, jumpsuits and gowns')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Footwear Subcategories
    IF foot_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Casual Shoes', 'casual-shoes', foot_id, 1, 'Sneakers, loafers and slip-ons'),
            ('Sports Shoes', 'sports-shoes', foot_id, 2, 'Running, training and gym footwear'),
            ('Formal Shoes', 'formal-shoes', foot_id, 3, 'Leather lace-ups, derbies and formal boots')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;

    -- Beauty & Personal Care Subcategories
    IF beau_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order, description) VALUES
            ('Skincare', 'skincare', beau_id, 1, 'Moisturizers, serums, face wash and sunscreen'),
            ('Haircare', 'haircare', beau_id, 2, 'Shampoos, conditioners and hair oils'),
            ('Fragrances', 'fragrances', beau_id, 3, 'Perfumes, body mists and deodorants')
        ON CONFLICT (slug) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order;
    END IF;
END $$;

COMMIT;
