const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();
const defaultPublicEmail = 'himanshu@coseworld.com';
const defaultPublicPhone = '+918439473327';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const allowedServices = new Set([
  'IT Services & Software Development',
  'AI & Automation',
  'Web Development',
  'Cybersecurity & Ethical Hacking',
  'Creative & Digital Services',
  'Something else'
]);

function getCleanSupabaseUrl() {
  const raw = (process.env.SUPABASE_URL || '').trim();
  if (!raw || raw.includes('your-project-id')) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

function getSupabaseClient() {
  const url = getCleanSupabaseUrl();
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || key.includes('your_supabase')) return null;
  return createClient(url, key);
}

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many inquiries from this connection. Please try again in 15 minutes.' }
});

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function validateContact(payload = {}) {
  const contact = {
    full_name: sanitizeText(payload.full_name || payload.name, 100),
    email: sanitizeText(payload.email, 254).toLowerCase(),
    phone: sanitizeText(payload.phone, 30),
    service_required: sanitizeText(payload.service_required || payload.service, 100),
    project_budget: sanitizeText(payload.project_budget, 80),
    project_description: sanitizeText(payload.project_description || payload.message, 5000),
    website: sanitizeText(payload.website, 200)
  };
  const errors = {};

  if (contact.full_name.length < 2) {
    errors.full_name = 'Please enter your full name (at least 2 characters).';
  }
  if (!emailPattern.test(contact.email)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!allowedServices.has(contact.service_required)) {
    errors.service_required = 'Please select a valid service.';
  }
  if (contact.project_description.length < 10) {
    errors.project_description = 'Please enter a project description of at least 10 characters.';
  }

  return { contact, errors };
}

function getTransporter() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'CONTACT_RECEIVER_EMAIL'];
  if (required.some((key) => !process.env[key]) || process.env.SMTP_HOST === 'smtp.example.com') {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

router.get('/config', (req, res) => {
  const configuredEmail = sanitizeText(process.env.CONTACT_PUBLIC_EMAIL, 254);
  const configuredPhone = sanitizeText(process.env.CONTACT_PUBLIC_PHONE, 30);
  res.json({
    contactEmail: emailPattern.test(configuredEmail) ? configuredEmail : defaultPublicEmail,
    contactPhone: configuredPhone || defaultPublicPhone,
    supabaseUrl: getCleanSupabaseUrl(),
    supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim()
  });
});

router.post('/contact', contactLimiter, async (req, res) => {
  const { contact, errors } = validateContact(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  if (contact.website) {
    return res.status(200).json({ message: 'Thanks — your inquiry has been sent.' });
  }

  let savedToDatabase = false;
  let sentEmail = false;
  let dbErrorMessage = '';

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error: dbError } = await supabase.from('contacts').insert([{
      full_name: contact.full_name,
      email: contact.email,
      phone: contact.phone || null,
      service_required: contact.service_required,
      project_budget: contact.project_budget || null,
      project_description: contact.project_description,
      status: 'pending'
    }]);

    if (!dbError) {
      savedToDatabase = true;
    } else {
      dbErrorMessage = dbError.message || dbError.details || dbError.code || 'Supabase rejected the insert.';
      console.error('Supabase insert error:', dbError);
    }
  }

  const transporter = getTransporter();
  if (transporter) {
    const text = [
      'New CoseWorld Project Inquiry',
      '-----------------------------',
      `Name: ${contact.full_name}`,
      `Email: ${contact.email}`,
      `Phone: ${contact.phone || 'Not provided'}`,
      `Service Required: ${contact.service_required}`,
      `Project Budget: ${contact.project_budget || 'Not specified'}`,
      '',
      'Project Description:',
      contact.project_description
    ].join('\n');

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.CONTACT_RECEIVER_EMAIL || defaultPublicEmail,
        replyTo: contact.email,
        subject: `CoseWorld Inquiry: ${contact.service_required} (${contact.full_name})`,
        text
      });
      sentEmail = true;
    } catch (error) {
      console.error('Unable to send contact form email:', error.message);
    }
  }

  if (savedToDatabase || sentEmail) {
    return res.status(200).json({
      message: 'Thanks — your inquiry has been received. Himanshu will get back to you soon.'
    });
  }

  return res.status(500).json({
    message: dbErrorMessage
      ? `Database error: ${dbErrorMessage}`
      : 'Supabase is not connected yet. Check SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.'
  });
});

module.exports = router;