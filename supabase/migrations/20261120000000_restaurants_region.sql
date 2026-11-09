-- State / region of each restaurant (the country's first-level division in Wikidata), for the state picker.
alter table public.restaurants_michelin add column if not exists region text;
