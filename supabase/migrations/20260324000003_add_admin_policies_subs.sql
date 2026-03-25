-- Add Admin Policies to Subscriptions Table
-- Allows users with the 'admin' role to manage all subscriptions.

CREATE POLICY "Admins can manage all subscriptions" 
    ON public.subscriptions 
    FOR ALL 
    USING (public.is_admin());
