# CoseWorld Website (`coseworld.com`)

Full-stack website for **CoseWorld** (*Technology Without Boundaries*), featuring a role-separated architecture:
- **`frontend/`**: Responsive UI (`index.html`, `style.css`, `script.js`)
- **`backend/`**: Express API routes (`contactRoutes.js`) with input validation, honeypot spam protection, rate limiting, Supabase PostgreSQL integration, and optional Nodemailer SMTP alerts
- **`supabase/migrations/`**: PostgreSQL schema and Row Level Security (RLS) policies (`001_coseworld_schema.sql`)

## Windows PowerShell Setup in VS Code

1. Open this folder in Visual Studio Code and open the PowerShell terminal (`Ctrl + ~`).
2. Copy `.env.example` to `.env` and add your `SUPABASE_URL` and `SUPABASE_ANON_KEY`:

```powershell
Copy-Item .env.example .env
notepad .env
npm install
npm run dev