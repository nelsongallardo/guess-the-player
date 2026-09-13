-- Automatic public pseudonyms; no Auth metadata or account identifiers are used.
-- Existing scores, rounds and idempotency receipts remain untouched.
begin;

create function ranked_private.animal_alias_candidate() returns text
language sql volatile set search_path = '' as $$
  select (array['Otter','Badger','Panda','Koala','Heron','Robin','Finch','Lynx',
    'Seal','Dolphin','Turtle','Falcon','Penguin','Gecko','Wombat','Alpaca'])
    [1 + floor(random() * 16)::integer] || '-' || left(gen_random_uuid()::text,8)
$$;

create function ranked_private.automatic_animal_alias() returns trigger
language plpgsql set search_path = '' as $$
declare candidate text;
begin
  new.enrolled := true;
  if new.nickname is null then
    -- Every nickname writer takes the same case-folded candidate lock. A fresh
    -- query after waiting sees the committed winner and retries; unrelated
    -- aliases do not serialize. The existing unique index remains authoritative.
    loop
      candidate := ranked_private.animal_alias_candidate();
      perform pg_advisory_xact_lock(hashtextextended(lower(candidate), 913003));
      if not exists(select 1 from ranked_private.accounts where lower(nickname)=lower(candidate)) then
        new.nickname := candidate;
        exit;
      end if;
    end loop;
  else
    perform pg_advisory_xact_lock(hashtextextended(lower(new.nickname), 913003));
  end if;
  return new;
end $$;

-- UPDATE coverage also coordinates the existing enroll action (optional rename).
create trigger automatic_animal_alias
before insert or update of nickname, enrolled on ranked_private.accounts
for each row execute function ranked_private.automatic_animal_alias();

update ranked_private.accounts set enrolled=true
where nickname is null or not enrolled;
alter table ranked_private.accounts alter column enrolled set default true;
alter table ranked_private.accounts alter column nickname set not null;

revoke all on function ranked_private.animal_alias_candidate() from public, anon, authenticated, service_role;
revoke all on function ranked_private.automatic_animal_alias() from public, anon, authenticated, service_role;
commit;
