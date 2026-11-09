-- Easter egg links (Augy, 10 November 2026): won on the Telegram bot's uwuCoins wheel
-- (telegram-bot/src/coins.py), opened once on the website or in the Android app for the wheel's
-- egg slot's prize (main-site/api/_lib/share-links.js, kind egg; js/coins.js, redeemEgg).
-- Run in Supabase's SQL editor after 0003, as SHARE-LINKS-SETUP.md says.

alter table public.share_links drop constraint if exists share_links_kind_check;

alter table public.share_links
    add constraint share_links_kind_check
    check (kind in ('place', 'directions', 'eta', 'feat', 'egg'));

-- An egg link: when it was opened. Null until then; it's used up from that moment, for everyone.
alter table public.share_links add column if not exists used_at timestamptz;
