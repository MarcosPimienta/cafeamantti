-- Fix infinite recursion in profiles policies

-- 1. Create a SECURITY DEFINER function to read the role safely without triggering RLS recursively
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Drop the recursive policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- 3. Create non-recursive policies using the function
CREATE POLICY "Admins can view all profiles" 
    ON public.profiles 
    FOR SELECT 
    USING ( public.get_user_role() = 'admin' );

CREATE POLICY "Admins can update all profiles" 
    ON public.profiles 
    FOR UPDATE 
    USING ( public.get_user_role() = 'admin' );
