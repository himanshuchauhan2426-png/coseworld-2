(() => {
  const header = document.querySelector('[data-header]');
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  const SECRET_ADMIN_HASH = '#admin';

  // Optional static fallback for Cloudflare Pages deployment
  const STATIC_SUPABASE_URL = 'https://fcafjjequqfxswictgsq.supabase.co';
  const STATIC_SUPABASE_ANON_KEY = 'sb_publishable_TG0TBBMkxGJ44C4Qxb8foA_yAf3cHsW';

  let supabaseClient = null;

  const cleanSupabaseUrl = (rawUrl) => {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed || trimmed.includes('your-project-id') || trimmed.includes('PASTE_YOUR')) return '';
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    }
  };

  const initSupabase = (url, anonKey) => {
    const cleanUrl = cleanSupabaseUrl(url);
    const cleanKey = (anonKey || '').trim();
    if (window.supabase && cleanUrl && cleanKey && !cleanKey.includes('your_supabase') && !supabaseClient) {
      supabaseClient = window.supabase.createClient(cleanUrl, cleanKey);
    }
  };

  initSupabase(STATIC_SUPABASE_URL, STATIC_SUPABASE_ANON_KEY);

  const ensureSupabaseLoaded = async () => {
    if (supabaseClient) return supabaseClient;
    const endpoints = ['/api/config', 'http://localhost:3000/api/config'];
    for (const url of endpoints) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const config = await response.json();
          if (config?.supabaseUrl && config?.supabaseAnonKey) {
            initSupabase(config.supabaseUrl, config.supabaseAnonKey);
            if (supabaseClient) return supabaseClient;
          }
        }
      } catch (_) {}
    }
    return supabaseClient;
  };

  ensureSupabaseLoaded();

  const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  toggle?.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    nav.classList.toggle('is-open', !isOpen);
    document.body.style.overflow = isOpen ? '' : 'hidden';
  });

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle?.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    document.body.style.overflow = '';
  }));

  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const serviceSelect = document.querySelector('#service_required');
  document.querySelectorAll('[data-select-service]').forEach((link) => {
    link.addEventListener('click', () => {
      const targetService = link.getAttribute('data-select-service');
      if (serviceSelect && targetService) {
        serviceSelect.value = targetService;
      }
    });
  });

  // Contact Form Validation & Submission
  const form = document.querySelector('[data-contact-form]');
  if (form) {
    const submitButton = form.querySelector('[data-submit-button]');
    const submitLabel = form.querySelector('[data-submit-label]');
    const status = form.querySelector('[data-form-status]');
    const fields = ['full_name', 'email', 'phone', 'service_required', 'project_description'];

    const setFieldError = (field, message = '') => {
      const input = form.elements[field];
      const error = form.querySelector(`[data-error-for="${field}"]`);
      if (!input || !error) return;
      input.setAttribute('aria-invalid', String(Boolean(message)));
      error.textContent = message;
    };

    const validate = () => {
      const values = Object.fromEntries(new FormData(form).entries());
      const errors = {};
      if (!values.full_name?.trim() || values.full_name.trim().length < 2) {
        errors.full_name = 'Please enter your name (at least 2 characters).';
      }
      if (!values.email?.trim()) {
        errors.email = 'Please enter your email address.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        errors.email = 'Please enter a valid email address.';
      }
      if (!values.service_required) {
        errors.service_required = 'Please select the service you need.';
      }
      if (!values.project_description?.trim() || values.project_description.trim().length < 10) {
        errors.project_description = 'Please add a message of at least 10 characters.';
      }
      fields.forEach((field) => setFieldError(field, errors[field]));
      return { values, errors };
    };

    fields.forEach((field) => form.elements[field]?.addEventListener('blur', validate));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      status.className = 'form-status';
      const { values, errors } = validate();
      if (Object.keys(errors).length) {
        status.textContent = 'Please correct the highlighted fields and try again.';
        status.classList.add('is-error');
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }

      submitButton.disabled = true;
      submitLabel.textContent = 'Sending…';
      status.textContent = 'Sending your inquiry…';

      try {
        // 1. Try Express Backend (/api/contact or http://localhost:3000/api/contact)
        let response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(values)
        }).catch(() => null);

        if (!response || response.status === 404 || response.status === 405) {
          response = await fetch('http://localhost:3000/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(values)
          }).catch(() => null);
        }

        if (response && response.ok) {
          const result = await response.json().catch(() => ({}));
          form.reset();
          fields.forEach((field) => setFieldError(field));
          status.textContent = result.message || 'Thanks — your inquiry has been received. Himanshu will get back to you soon.';
          status.classList.add('is-success');
          return;
        }

        if (response && response.status === 400) {
          const result = await response.json().catch(() => ({}));
          if (result.errors) {
            Object.entries(result.errors).forEach(([field, message]) => setFieldError(field, message));
          }
          throw new Error(result.message || 'Please check your form inputs.');
        }

        // 2. Fallback: Direct Supabase insert
        const client = await ensureSupabaseLoaded();
        if (client && !values.website) {
          const { error: sbError } = await client.from('contacts').insert([{
            full_name: values.full_name.trim(),
            email: values.email.trim().toLowerCase(),
            phone: values.phone?.trim() || null,
            service_required: values.service_required,
            project_budget: values.project_budget || null,
            project_description: values.project_description.trim(),
            status: 'pending'
          }]);

          if (!sbError) {
            form.reset();
            fields.forEach((field) => setFieldError(field));
            status.textContent = 'Thanks — your inquiry has been received. Himanshu will get back to you soon.';
            status.classList.add('is-success');
            return;
          }

          throw new Error(`Supabase error (${sbError.code || 'RLS'}): ${sbError.message || 'Check your Supabase contacts table permissions.'}`);
        }

        if (response) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.message || `Server error (HTTP ${response.status}).`);
        }

        throw new Error('Server is not reachable. Make sure "npm run dev" is running and open http://localhost:3000.');
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('is-error');
      } finally {
        submitButton.disabled = false;
        submitLabel.textContent = 'Send inquiry';
      }
    });
  }

  // Legal Modals (Privacy Policy & Terms)
  const legalModal = document.querySelector('[data-legal-modal]');
  const legalTitle = document.querySelector('[data-legal-title]');
  const legalBody = document.querySelector('[data-legal-body]');
  const legalContent = {
    privacy: {
      title: 'Privacy Policy (Editable Draft)',
      html: `<p><strong>Effective Date:</strong> November 2026</p>
             <p>CoseWorld ("we", "our", or "us") operates <strong>coseworld.com</strong>. We collect only the contact and project details you voluntarily submit via our contact form (name, email, phone number, service required, budget, and project description).</p>
             <p><strong>Data Usage:</strong> Your information is used strictly to evaluate your project inquiry and communicate with you. We never sell your personal information to third parties.</p>
             <p><strong>Contact:</strong> For privacy questions or data deletion requests, contact <strong>himanshu@coseworld.com</strong>.</p>`
    },
    terms: {
      title: 'Terms & Conditions (Editable Draft)',
      html: `<p><strong>Effective Date:</strong> November 2026</p>
             <p>By using <strong>coseworld.com</strong>, you agree to these terms. Project deliverables, timelines, and pricing are defined in individual written agreements prior to starting work.</p>
             <p><strong>Authorized Security Testing Only:</strong> All cybersecurity assessments, vulnerability scans, and ethical hacking services are performed exclusively on domains and systems for which the client provides formal written authorization.</p>`
    }
  };

  document.querySelectorAll('[data-open-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-open-modal');
      if (legalContent[type] && legalModal) {
        legalTitle.textContent = legalContent[type].title;
        legalBody.innerHTML = legalContent[type].html;
        legalModal.hidden = false;
      }
    });
  });
  document.querySelector('[data-close-legal]')?.addEventListener('click', () => {
    legalModal.hidden = true;
  });

  // Admin Dashboard Modal & Secret URL (#admin or Ctrl + Shift + A)
  const adminModal = document.querySelector('[data-admin-modal]');
  const adminLoginForm = document.querySelector('[data-admin-login-form]');
  const adminDashboard = document.querySelector('[data-admin-dashboard]');
  const adminAuthStatus = document.querySelector('[data-admin-auth-status]');
  const enquiriesBody = document.querySelector('[data-admin-enquiries-body]');
  const servicesBody = document.querySelector('[data-admin-services-body]');
  const projectsBody = document.querySelector('[data-admin-projects-body]');
  const enquiryCount = document.querySelector('[data-enquiry-count]');

  const checkSecretAdminUrl = () => {
    if (window.location.hash.toLowerCase() === SECRET_ADMIN_HASH.toLowerCase() && adminModal) {
      adminModal.hidden = false;
    }
  };

  checkSecretAdminUrl();
  window.addEventListener('hashchange', checkSecretAdminUrl);

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && (event.key === 'A' || event.key === 'a')) {
      event.preventDefault();
      if (adminModal) {
        adminModal.hidden = !adminModal.hidden;
      }
    }
  });

  document.querySelector('[data-close-admin]')?.addEventListener('click', () => {
    if (adminModal) adminModal.hidden = true;
    if (window.location.hash.toLowerCase() === SECRET_ADMIN_HASH.toLowerCase()) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });

  document.querySelectorAll('[data-admin-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const target = tabBtn.getAttribute('data-admin-tab');
      document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-admin-panel') !== target;
      });
      document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
        btn.classList.toggle('button-ghost', btn !== tabBtn);
      });
    });
  });

  const loadAdminData = async () => {
    const client = await ensureSupabaseLoaded();
    if (!client) return;

    const { data: contacts, error: errContacts } = await client
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (errContacts) {
      enquiriesBody.innerHTML = `<tr><td colspan="5">Error loading enquiries: ${errContacts.message}</td></tr>`;
    } else if (contacts) {
      enquiryCount.textContent = contacts.length;
      enquiriesBody.innerHTML = contacts.length
        ? contacts.map((row) => `
          <tr>
            <td>${new Date(row.created_at).toLocaleDateString()}</td>
            <td><strong>${row.full_name}</strong><br>${row.email}<br>${row.phone || ''}</td>
            <td>${row.service_required}<br><small>${row.project_budget || ''}</small></td>
            <td>${row.project_description}</td>
            <td>
              <select data-status-id="${row.id}">
                <option value="pending" ${row.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="contacted" ${row.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                <option value="completed" ${row.status === 'completed' ? 'selected' : ''}>Completed</option>
              </select>
            </td>
          </tr>
        `).join('')
        : '<tr><td colspan="5">No enquiries submitted yet.</td></tr>';

      enquiriesBody.querySelectorAll('[data-status-id]').forEach((select) => {
        select.addEventListener('change', async () => {
          await client
            .from('contacts')
            .update({ status: select.value })
            .eq('id', select.getAttribute('data-status-id'));
        });
      });
    }

    const { data: services } = await client
      .from('services')
      .select('*')
      .order('created_at', { ascending: true });

    if (services && servicesBody) {
      servicesBody.innerHTML = services.map((s) => `
        <tr>
          <td><strong>${s.title}</strong></td>
          <td>${s.category}</td>
          <td>${s.description}</td>
          <td>
            <input type="checkbox" data-toggle-service="${s.id}" ${s.is_active ? 'checked' : ''}>
          </td>
        </tr>
      `).join('');

      servicesBody.querySelectorAll('[data-toggle-service]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
          await client
            .from('services')
            .update({ is_active: checkbox.checked, updated_at: new Date().toISOString() })
            .eq('id', checkbox.getAttribute('data-toggle-service'));
        });
      });
    }

    const { data: projects } = await client
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (projects && projectsBody) {
      projectsBody.innerHTML = projects.map((p) => `
        <tr>
          <td><strong>${p.title}</strong></td>
          <td>${p.category}</td>
          <td>${(p.technologies || []).join(', ')}</td>
          <td>
            <input type="checkbox" data-toggle-project="${p.id}" ${p.is_published ? 'checked' : ''}>
          </td>
        </tr>
      `).join('');

      projectsBody.querySelectorAll('[data-toggle-project]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
          await client
            .from('projects')
            .update({ is_published: checkbox.checked, updated_at: new Date().toISOString() })
            .eq('id', checkbox.getAttribute('data-toggle-project'));
        });
      });
    }
  };

  document.querySelector('[data-add-service-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const client = await ensureSupabaseLoaded();
    if (!client) return;
    const fd = new FormData(e.target);
    const title = fd.get('title').trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await client.from('services').insert([{
      title,
      slug,
      category: fd.get('category').trim(),
      description: fd.get('description').trim(),
      is_active: true
    }]);
    e.target.reset();
    loadAdminData();
  });

  document.querySelector('[data-add-project-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const client = await ensureSupabaseLoaded();
    if (!client) return;
    const fd = new FormData(e.target);
    const title = fd.get('title').trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const techs = (fd.get('technologies') || '').split(',').map((t) => t.trim()).filter(Boolean);
    await client.from('projects').insert([{
      title,
      slug,
      category: fd.get('category').trim(),
      technologies: techs,
      project_url: fd.get('project_url')?.trim() || '#contact',
      description: fd.get('description').trim(),
      is_demo: false,
      is_published: true
    }]);
    e.target.reset();
    loadAdminData();
  });

  adminLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const client = await ensureSupabaseLoaded();
    if (!client) {
      adminAuthStatus.textContent = 'Could not load Supabase config from .env. Make sure npm run dev is running.';
      return;
    }
    const fd = new FormData(adminLoginForm);
    adminAuthStatus.textContent = 'Signing in…';
    const { data, error } = await client.auth.signInWithPassword({
      email: fd.get('email'),
      password: fd.get('password')
    });
    if (error) {
      adminAuthStatus.textContent = error.message;
      return;
    }
    adminLoginForm.hidden = true;
    adminDashboard.hidden = false;
    document.querySelector('[data-admin-user-label]').textContent = `Signed in as ${data.user.email}`;
    loadAdminData();
  });

  document.querySelector('[data-admin-refresh]')?.addEventListener('click', loadAdminData);
  document.querySelector('[data-admin-logout]')?.addEventListener('click', async () => {
    await supabaseClient?.auth.signOut();
    adminDashboard.hidden = true;
    adminLoginForm.hidden = false;
    adminAuthStatus.textContent = '';
  });

  // Hero 3D Pointer Motion & Scroll Reveal
  const hero = document.querySelector('[data-hero]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (hero && !reducedMotion.matches) {
    let frameRequested = false;
    let pointerX = 50;
    let pointerY = 50;

    const renderHeroMotion = () => {
      hero.style.setProperty('--pointer-x', `${pointerX}%`);
      hero.style.setProperty('--pointer-y', `${pointerY}%`);
      hero.style.setProperty('--tilt-x', `${(pointerX - 50) * 0.09}deg`);
      hero.style.setProperty('--tilt-y', `${(pointerY - 50) * -0.075}deg`);
      frameRequested = false;
    };

    hero.addEventListener('pointermove', (event) => {
      const bounds = hero.getBoundingClientRect();
      pointerX = ((event.clientX - bounds.left) / bounds.width) * 100;
      pointerY = ((event.clientY - bounds.top) / bounds.height) * 100;
      if (!frameRequested) {
        frameRequested = true;
        requestAnimationFrame(renderHeroMotion);
      }
    });

    hero.addEventListener('pointerleave', () => {
      pointerX = 50;
      pointerY = 50;
      if (!frameRequested) {
        frameRequested = true;
        requestAnimationFrame(renderHeroMotion);
      }
    });

    const updateHeroScroll = () => {
      const bounds = hero.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -bounds.top / Math.max(bounds.height, 1)));
      hero.style.setProperty('--hero-scroll', progress.toFixed(3));
      hero.style.setProperty('--hero-shift', `${(progress * 28).toFixed(1)}px`);
      hero.style.setProperty('--scan-shift', `${(progress * -45).toFixed(1)}px`);
    };

    updateHeroScroll();
    window.addEventListener('scroll', updateHeroScroll, { passive: true });
  }

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }
})();