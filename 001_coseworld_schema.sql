-- 1. Enable UUID extension
create extension if not exists "pgcrypto";

-- 2. Create Tables
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) >= 2),
  email text not null,
  phone text,
  service_required text not null,
  project_budget text,
  project_description text not null check (char_length(project_description) >= 10),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null,
  icon text not null default '✦',
  category text not null,
  deliverables text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null,
  image_url text,
  technologies text[] not null default '{}',
  category text not null,
  project_url text,
  is_demo boolean not null default true,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at timestamptz not null default now()
);

-- 3. Enable Row Level Security (RLS)
alter table public.contacts enable row level security;
alter table public.services enable row level security;
alter table public.projects enable row level security;
alter table public.admin_profiles enable row level security;

-- 4. Helper function to verify admin status
create or replace function public.is_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid()
  );
$$;

-- 5. Safely Drop & Recreate RLS Policies
drop policy if exists "Public visitors can submit enquiries" on public.contacts;
create policy "Public visitors can submit enquiries"
  on public.contacts for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Only admins can view enquiries" on public.contacts;
create policy "Only admins can view enquiries"
  on public.contacts for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Only admins can update enquiry status" on public.contacts;
create policy "Only admins can update enquiry status"
  on public.contacts for update
  to authenticated
  using (public.is_admin());

drop policy if exists "Public visitors can view active services" on public.services;
create policy "Public visitors can view active services"
  on public.services for select
  to anon, authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "Only admins can manage services" on public.services;
create policy "Only admins can manage services"
  on public.services for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Public visitors can view published projects" on public.projects;
create policy "Public visitors can view published projects"
  on public.projects for select
  to anon, authenticated
  using (is_published = true or public.is_admin());

drop policy if exists "Only admins can manage projects" on public.projects;
create policy "Only admins can manage projects"
  on public.projects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can view their own profile" on public.admin_profiles;
create policy "Admins can view their own profile"
  on public.admin_profiles for select
  to authenticated
  using (auth.uid() = user_id);

-- 6. Link himanshu@coseworld.com as super_admin if present in auth.users
insert into public.admin_profiles (user_id, role)
select id, 'super_admin'
from auth.users
where email = 'himanshu@coseworld.com'
on conflict (user_id) do nothing;