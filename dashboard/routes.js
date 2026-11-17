// ---------- Web pages for nurses / staff ----------
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const q = require('./queries');

const router = express.Router();

// Parse form bodies (dashboard only, never touches /webhook)
router.use(express.urlencoded({ extended: false }));

router.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
}));

// Formatting helpers available in every view
router.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.path = req.path;
  res.locals.fmtDate = (d) =>
    d ? new Date(`${String(d).slice(0, 10)}T00:00:00`)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  res.locals.fmtTime = (t) => (t ? String(t).slice(0, 5) : '-');
  res.locals.fmtDateTime = (dt) =>
    dt ? `${res.locals.fmtDate(dt)}, ${String(dt).slice(11, 16)}` : '-';
  next();
});

// ---------- Login (DB4) ----------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const { username = '', password = '' } = req.body;
    const user = await q.findStaffByUsername(username.trim());
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).render('login', { error: 'Invalid username or password' });
    }
    // New session after login to prevent session fixation
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: user.staff_id, name: user.full_name, role: user.role };
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Every page below requires login
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// ---------- Home (Figure 5) ----------
router.get('/', requireLogin, async (req, res, next) => {
  try {
    res.render('home', { stats: await q.getStats() });
  } catch (err) { next(err); }
});

// ---------- Appointment List (Figure 6) ----------
router.get('/appointments', requireLogin, async (req, res, next) => {
  try {
    const filters = {
      q: (req.query.q || '').trim(),
      date: req.query.date || 'upcoming',
      status: req.query.status || 'all',
      page: req.query.page || 1,
    };
    const result = await q.listAppointments(filters);
    res.render('appointments', { ...result, filters });
  } catch (err) { next(err); }
});

// ---------- Follow-up List (Figure 7) ----------
router.get('/follow-ups', requireLogin, async (req, res, next) => {
  try {
    const search = (req.query.q || '').trim();
    res.render('follow-ups', { rows: await q.listFollowUps({ q: search }), search });
  } catch (err) { next(err); }
});

// ---------- Appointment Status (Figure 8–11) ----------
router.get('/appointments/:id', requireLogin, async (req, res, next) => {
  try {
    const detail = await q.getAppointmentDetail(Number(req.params.id));
    if (!detail) return res.status(404).send('Appointment not found');
    res.render('appointment', { ...detail, saved: req.query.saved === '1' });
  } catch (err) { next(err); }
});

router.post('/appointments/:id/status', requireLogin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status, followUpResult = 'Open', note = '' } = req.body;
    if (!['Pending', 'Confirmed', 'Declined'].includes(status)) {
      return res.status(400).send('Invalid status');
    }
    if (!['Open', 'Unreachable'].includes(followUpResult)) {
      return res.status(400).send('Invalid follow-up result');
    }
    await q.updateStatusByStaff(id, { status, followUpResult, note: note.trim().slice(0, 1000) });
    res.redirect(`/appointments/${id}?saved=1`);
  } catch (err) { next(err); }
});

module.exports = router;
