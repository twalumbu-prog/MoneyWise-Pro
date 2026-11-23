-- Staff category: a salon's staff are hairdressers or nail technicians (their own tab in the Salon panel).
ALTER TABLE public.salon_staff_profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'HAIRDRESSER';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salon_staff_profiles_role_check') THEN
    ALTER TABLE public.salon_staff_profiles ADD CONSTRAINT salon_staff_profiles_role_check CHECK (role IN ('HAIRDRESSER', 'NAIL_TECH'));
  END IF;
END $$;

-- Anyone who only does nail services is a nail technician.
UPDATE public.salon_staff_profiles sp SET role = 'NAIL_TECH'
WHERE sp.role = 'HAIRDRESSER'
  AND EXISTS (SELECT 1 FROM public.salon_staff_services ss WHERE ss.staff_profile_id = sp.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.salon_staff_services ss JOIN public.products p ON p.id = ss.product_id
    WHERE ss.staff_profile_id = sp.id AND lower(coalesce(p.category, '')) <> 'nails'
  );

NOTIFY pgrst, 'reload schema';
