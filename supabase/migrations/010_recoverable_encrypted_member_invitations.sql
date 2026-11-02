-- M5.5 — Encrypted retrievable invitations for inspector-owner convenience.
-- Legacy token_hash stays unchanged for auth checks; no plaintext links stored.
-- The server-only Edge Function seals raw invitation credentials using AES-GCM.
-- The two new fields have no RLS policy and no grants to browser roles.
begin;
alter table public.titularisation_member_links
  add column if not exists sealed_token text,
  add column if not exists sealed_token_nonce text;
alter table public.titularisation_member_links
  add constraint titularisation_sealed_invitation_pair
  check ((sealed_token is null and sealed_token_nonce is null)
   or (sealed_token is not null and sealed_token_nonce is not null));
comment on column public.titularisation_member_links.sealed_token is
  'AES-GCM encrypted link token, visible to service role only; not a password';
comment on column public.titularisation_member_links.sealed_token_nonce is
  '12-byte random AES-GCM nonce in base64, visible to service role only';
commit;
