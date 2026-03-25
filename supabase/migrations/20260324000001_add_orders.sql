-- Adding role to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin'));

-- Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')),
    total_amount NUMERIC NOT NULL,
    shipping_info JSONB NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create order items table
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    product_id TEXT NOT NULL,
    weight TEXT NOT NULL CHECK (weight IN ('250g', '500g', '2.5kg')),
    grind TEXT NOT NULL CHECK (grind IN ('whole', 'ground')),
    grind_level TEXT CHECK (grind_level IN ('espresso', 'drip', 'french')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_time NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for orders
-- Admins can do everything
CREATE POLICY "Admins can manage all orders" 
    ON public.orders FOR ALL 
    USING (public.is_admin());

-- Users can insert their own orders and view them
CREATE POLICY "Users can insert own orders" 
    ON public.orders FOR INSERT 
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view own orders" 
    ON public.orders FOR SELECT 
    USING (auth.uid() = user_id);

-- Policies for order items
-- Admins can do everything
CREATE POLICY "Admins can manage all order items" 
    ON public.order_items FOR ALL 
    USING (public.is_admin());

-- Users can insert their own order items
CREATE POLICY "Users can insert own order items" 
    ON public.order_items FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = order_items.order_id AND (user_id = auth.uid() OR user_id IS NULL)
        )
    );

-- Users can view their own order items
CREATE POLICY "Users can view own order items" 
    ON public.order_items FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = order_items.order_id AND user_id = auth.uid()
        )
    );

-- Triggers for updated_at
CREATE TRIGGER on_orders_updated
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Note: No updated_at for order_items as they act more like an immutable ledger.
