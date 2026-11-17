ALTER TABLE public.request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "request_all_authenticated" ON public.request;
DROP POLICY IF EXISTS "request_all_policy" ON public.request;
CREATE POLICY "request_all_policy" ON public.request
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
