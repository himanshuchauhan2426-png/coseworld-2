const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from coseworld 2
['.env', '.env.txt', '.env.example'].forEach((file) => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
});

const express = require('express');

const routesPath = fs.existsSync(path.join(__dirname, 'contactRoutes.js'))
  ? './contactRoutes'
  : './backend/contactRoutes';

const contactRoutes = require(routesPath);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '25kb' }));

// Allow any local browser tab (including file:// or Live Server) to connect to localhost:3000
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function getCleanSupabaseUrl() {
  const raw = (process.env.SUPABASE_URL || '').trim();
  if (!raw || raw.includes('your-project-id')) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

// 1. Serve /api/config directly from server.js so keys are always included
app.get('/api/config', (req, res) => {
  res.json({
    contactEmail: (process.env.CONTACT_PUBLIC_EMAIL || 'himanshu@coseworld.com').trim(),
    contactPhone: (process.env.CONTACT_PUBLIC_PHONE || '+918439473327').trim(),
    supabaseUrl: getCleanSupabaseUrl(),
    supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim()
  });
});

// 2. Mount remaining /api routes
app.use('/api', contactRoutes);

// 3. Serve Frontend Files
app.use(express.static(__dirname, { extensions: ['html'] }));
app.use(express.static(path.join(__dirname, 'frontend'), { extensions: ['html'] }));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ message: 'The request could not be read. Please try again.' });
  }
  return next(error);
});

app.listen(port, () => {
  const hasSupabase = Boolean(
    getCleanSupabaseUrl() &&
    process.env.SUPABASE_ANON_KEY &&
    !process.env.SUPABASE_ANON_KEY.includes('your_supabase')
  );
  console.log(`CoseWorld is running at http://localhost:${port}`);
  console.log(`Supabase .env keys loaded: ${hasSupabase ? 'YES' : 'NO'}`);
});