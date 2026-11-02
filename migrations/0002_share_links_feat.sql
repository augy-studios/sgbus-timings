-- Feat links: a feat done, or Achievements as a whole, shared as a card (main-site/js/eggs.js,
-- main-site/api/_lib/share-links.js, main-site/api/feat-card.js).
-- Run once in the Supabase SQL editor, after 0001. Never edited after.
--
--   kind 'feat'  /feat/<id>  Which feat, every feat done, the sharer's name and the day.
--
-- Like a place link, it lasts, and sharing the same thing again gives the same link
-- (dedupe_key). Only the kinds the table takes change.

alter table public.share_links drop constraint if exists share_links_kind_check;

alter table public.share_links
    add constraint share_links_kind_check
    check (kind in ('place', 'directions', 'eta', 'feat'));
