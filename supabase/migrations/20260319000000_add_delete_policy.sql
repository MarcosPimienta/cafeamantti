-- Add DELETE policy for subscriptions
-- This allows users to delete their own subscriptions from the dashboard
CREATE POLICY "Users can delete own subscriptions" 
    ON public.subscriptions 
    FOR DELETE 
    USING (auth.uid() = user_id);
