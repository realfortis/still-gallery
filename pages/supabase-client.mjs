import { createClient } from '@supabase/supabase-js';

export function galleryClient(settings, staff = false) {
  return createClient(settings.url, settings.publishableKey, {
    auth: {
      persistSession: staff,
      autoRefreshToken: staff,
      detectSessionInUrl: false,
      storageKey: 'sill-gallery-staff'
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' })
    }
  });
}
