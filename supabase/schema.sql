create table if not exists public.pos_user_data (
    user_id uuid not null references auth.users (id) on delete cascade,
    data_key text not null,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, data_key),
    constraint pos_user_data_key_allowed check (
        data_key in (
            'foodHubOrders',
            'foodHubOrderStatuses',
            'foodHubKitchenOrders',
            'foodHubProducts',
            'foodHubInventory',
            'foodHubSettings',
            'foodHubStaff',
            'foodHubRestaurantLogo',
            'foodHubNextOrderNumber',
            'foodHubOrderHistoryCleared'
        )
    )
);

alter table public.pos_user_data enable row level security;

create or replace function public.set_pos_user_data_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists pos_user_data_updated_at on public.pos_user_data;
create trigger pos_user_data_updated_at
    before update on public.pos_user_data
    for each row
    execute function public.set_pos_user_data_updated_at();

drop policy if exists "Users can read their own POS data" on public.pos_user_data;
drop policy if exists "Users can insert their own POS data" on public.pos_user_data;
drop policy if exists "Users can update their own POS data" on public.pos_user_data;

create policy "Users can read their own POS data"
    on public.pos_user_data
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can insert their own POS data"
    on public.pos_user_data
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update their own POS data"
    on public.pos_user_data
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update on table public.pos_user_data to authenticated, service_role;
