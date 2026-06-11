# QR Dine Cloud

Multi-tenant QR-based restaurant order management SaaS powered by **Supabase**.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and set your Supabase keys (already configured if using the provided project).

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only, never expose to client) |
| `APP_URL` | Public URL for QR code generation |

### 3. Create database tables

Open **Supabase Dashboard → SQL Editor** and run the full contents of:

[`supabase/schema.sql`](supabase/schema.sql)

### 4. Seed Super Admin

```bash
npm run db:seed
```

Creates: `sarthakmulik16@gmail.com` / `SuperAdmin@123`

### 5. Enable Google OAuth (optional)

In Supabase Dashboard → Authentication → Providers → Google, enable and add your OAuth credentials. Add redirect URL:

```
http://localhost:3000/auth/callback
```

### 6. Run the app

```bash
npm run dev
```

## Architecture

- **Next.js 15** + TypeScript + Tailwind CSS
- **Supabase Auth** — email/password + Google OAuth
- **Supabase PostgreSQL** — all data via service role on server APIs
- **profiles** table links `auth.users` to roles (`superadmin`, `hotel_owner`, `staff`)

## Security note

Never commit `.env` or expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code. Rotate keys if they were shared publicly.

## License

Private — All rights reserved.
