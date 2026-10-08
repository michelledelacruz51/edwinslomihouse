# Supabase Auth setup

1. Create a Supabase project and enable Email authentication.
2. Copy the project URL and the public `anon` key from the Supabase project API settings into `supabase-config.js`. Never put a `service_role` key in browser code.
3. In Supabase Auth URL configuration, set the site URL to the address where this POS is hosted and allow that same address as a redirect URL.
4. Serve the site over HTTP(S), then open it and create an account. If email confirmation is enabled, confirm the email before signing in.

The sign-in screen uses Supabase Auth for account registration, password sign-in, session persistence, and sign-out. The POS's orders, products, inventory, and settings are still stored in this browser; Supabase Auth does not make that browser data shared or protected by database row-level security. Move operational data to Supabase tables and apply appropriate access policies before using this POS for production business data.
