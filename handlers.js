const pool = require('./db');
const {
  DECLINE_REASONS, loadOwnAppointment, recordResponse, saveDeclineReason,
} = require('./responses');
const {
  confirmedMessage, askDeclineReasonMessage, declinedMessage,
  myAppointmentsMessage, fallbackMessage,
  chooseDateMessage, chooseTimeMessage, confirmRescheduleMessage, rescheduledMessage,
  confirmCancelMessage, alreadyAnsweredMessage,
  consentMessage, withdrawConfirmMessage,
} = require('./messages');
const {
  CONSENT_VERSION, SUMMARY, FULL_NOTICE, hasConsent, recordConsent, withdrawConsent,
} = require('./pdpa');
const { getUpcomingAppointments, getAppointment } = require('./reminders');
const {
  checkRescheduleRules, getAvailableDates, getAvailableTimes, getSlot, rescheduleAppointment,
} = require('./reschedule');

const HELP_REGISTER =
  'Please register before using the service.\n' +
  'Type: register <HN> <phone number>\n' +
  'Example: register HN0001 0800000001';

const HELP_USAGE =
  'How to use this service\n\n' +
  '📅 You will receive a reminder card before your appointment date.\n' +
  '✅ Tap "Confirm Appointment" if you can attend.\n' +
  '❎ Tap "Decline Appointment" if you cannot, then select a reason.\n' +
  '📋 Tap "My Appointments" in the menu below to view your appointments and their status.\n' +
  '🔄 You can reschedule or cancel from the appointment card (at least 24 hours in advance).\n' +
  '🔒 Type "privacy policy" to read how your data is used, or "withdraw consent" to stop using the service.\n\n' +
  'If you do not respond in time, our staff will contact you by phone.';

// ---------- Main event handler ----------
async function handleEvent(event, client) {
  // Only handle 1:1 chats (ignore groups)
  if (event.source.type !== 'user') return;
  const userId = event.source.userId;

  // Patient added the bot as a friend (or unblocked it)
  if (event.type === 'follow') {
    const patient = await findPatientByLineId(userId);
    if (patient) {
      return reply(client, event, `Welcome back, ${patient.patient_name}.`);
    }
    const welcome = { type: 'text', text: 'Hello! Welcome to the outpatient appointment reminder service.' };
    if (!(await hasConsent(userId))) {
      return replyMessages(client, event, [welcome, consentMessage(SUMMARY, CONSENT_VERSION)]);
    }
    return replyMessages(client, event, [welcome, { type: 'text', text: HELP_REGISTER }]);
  }

  // Patient tapped a button on a card / Quick Reply
  if (event.type === 'postback') {
    return handlePostback(event, client);
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;
  const text = event.message.text.trim();
  const cmd = text.toLowerCase(); // commands are not case-sensitive

  // PDPA: reading the policy / withdrawing consent is always available
  if (cmd === 'privacy policy') {
    return reply(client, event, FULL_NOTICE);
  }
  if (cmd === 'withdraw consent') {
    if (!(await hasConsent(userId)) && !(await findPatientByLineId(userId))) {
      return reply(client, event, 'You have not given consent yet.');
    }
    return replyMessages(client, event, [withdrawConfirmMessage()]);
  }

  // Consent is required before registering or using the service
  if (!(await hasConsent(userId))) {
    return replyMessages(client, event, [consentMessage(SUMMARY, CONSENT_VERSION)]);
  }

  // Registration command
  const match = text.match(/^register\s+(\S+)\s+(\S+)$/i);
  if (match) {
    const result = await registerPatient(userId, match[1], match[2]);
    return reply(client, event, result);
  }
  if (cmd.startsWith('register')) {
    return reply(client, event, 'Invalid format.\n' + HELP_REGISTER);
  }

  // Everything else requires a registered patient
  const patient = await findPatientByLineId(userId);
  if (!patient) return reply(client, event, HELP_REGISTER);

  // Rich Menu buttons
  if (cmd === 'my appointments') {
    const appts = await getUpcomingAppointments(userId);
    if (appts.length === 0) return reply(client, event, 'You have no upcoming appointments.');
    return replyMessages(client, event, [myAppointmentsMessage(appts)]);
  }
  if (cmd === 'help') {
    return reply(client, event, HELP_USAGE);
  }

  // Unrecognised input (CB3)
  return replyMessages(client, event, [fallbackMessage()]);
}

// ---------- Card buttons / Quick Reply ----------
async function handlePostback(event, client) {
  const params = new URLSearchParams(event.postback.data);
  const action = params.get('action');

  // "Keep Appointment" button: nothing to change in the DB
  if (action === 'dismiss') return reply(client, event, 'Noted. Your appointment is unchanged.');

  // ----- PDPA -----
  const userId = event.source.userId;
  if (action === 'privacy_full') {
    return replyMessages(client, event, [
      { type: 'text', text: FULL_NOTICE },
      consentMessage(SUMMARY, CONSENT_VERSION),
    ]);
  }
  if (action === 'consent_accept') {
    if (!(await hasConsent(userId))) await recordConsent(userId);
    return reply(client, event, 'Thank you for your consent ✅\n\n' + HELP_REGISTER);
  }
  if (action === 'consent_decline') {
    return reply(client, event,
      'Noted. We will not store your data.\n' +
      'Our staff will contact you about appointments by phone as usual.\n' +
      'If you change your mind, send any message to start again.');
  }
  if (action === 'consent_withdraw_confirm') {
    await withdrawConsent(userId);
    return reply(client, event,
      'Your consent has been withdrawn.\n' +
      'You will no longer receive messages on LINE. Your appointments stay unchanged and our staff will contact you by phone.');
  }
  if (action === 'dismiss_privacy') {
    return reply(client, event, 'Noted. You can keep using the service as usual.');
  }

  // Appointment buttons require consent (covers tapping an old card after withdrawing)
  if (!(await hasConsent(userId))) {
    return replyMessages(client, event, [consentMessage(SUMMARY, CONSENT_VERSION)]);
  }

  const appointmentId = Number(params.get('appointment_id'));
  const { appt, error } = await loadOwnAppointment(appointmentId, userId);
  if (error) return reply(client, event, error);

  switch (action) {
    // ----- Confirm / Decline -----
    case 'confirm': {
      const changed = await recordResponse(appointmentId, 'Confirmed');
      if (!changed) return replyMessages(client, event, [alreadyAnsweredMessage(appt)]);
      return replyMessages(client, event, [confirmedMessage(appt)]);
    }
    case 'decline': {
      const changed = await recordResponse(appointmentId, 'Declined');
      if (!changed) return replyMessages(client, event, [alreadyAnsweredMessage(appt)]);
      return replyMessages(client, event, [askDeclineReasonMessage(appointmentId, DECLINE_REASONS)]);
    }
    case 'decline_reason': {
      const reasonText = DECLINE_REASONS[params.get('reason')];
      if (!reasonText) return reply(client, event, 'That reason was not recognised.');
      const saved = await saveDeclineReason(appointmentId, reasonText);
      if (!saved) return reply(client, event, 'A reason has already been recorded for this appointment.');
      return replyMessages(client, event, [declinedMessage(appt, reasonText)]);
    }

    // ----- Reschedule: choose date -> choose time -> confirm -----
    case 'reschedule': {
      const ruleError = checkRescheduleRules(appt);
      if (ruleError) return reply(client, event, ruleError);
      const dates = await getAvailableDates(appt);
      if (dates.length === 0) {
        return reply(client, event, 'Sorry, your doctor has no available time slots at the moment.\nPlease call the hospital.');
      }
      return replyMessages(client, event, [chooseDateMessage(appt, dates)]);
    }
    case 'reschedule_date': {
      const date = params.get('date') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(client, event, 'Invalid date.');
      const slots = await getAvailableTimes(appt, date);
      if (slots.length === 0) {
        return reply(client, event, 'That day is now full. Please tap "Reschedule" to choose another date.');
      }
      return replyMessages(client, event, [chooseTimeMessage(appt, date, slots)]);
    }
    case 'reschedule_time': {
      const slot = await getSlot(Number(params.get('slot_id')));
      if (!slot || slot.doctor_id !== appt.doctor_id) return reply(client, event, 'That time slot was not found.');
      return replyMessages(client, event, [confirmRescheduleMessage(appt, slot)]);
    }
    case 'reschedule_confirm': {
      const result = await rescheduleAppointment(
        appointmentId, event.source.userId, Number(params.get('slot_id'))
      );
      if (result.error) return reply(client, event, result.error);
      const updated = await getAppointment(appointmentId);
      return replyMessages(client, event, [rescheduledMessage(updated, result.oldDate, result.oldTime)]);
    }

    // ----- Cancel a confirmed appointment -----
    case 'cancel': {
      if (appt.confirmation_status !== 'Confirmed') {
        return replyMessages(client, event, [alreadyAnsweredMessage(appt)]);
      }
      return replyMessages(client, event, [confirmCancelMessage(appt)]);
    }
    case 'cancel_confirm': {
      const changed = await recordResponse(appointmentId, 'Declined', 'Confirmed');
      if (!changed) return reply(client, event, 'This appointment has already been cancelled.');
      return replyMessages(client, event, [askDeclineReasonMessage(appointmentId, DECLINE_REASONS)]);
    }

    default:
      return reply(client, event, 'Sorry, that action was not recognised.');
  }
}

// ---------- Link a LINE account to a patient ----------
async function registerPatient(lineUserId, hnInput, phoneInput) {
  const hn = hnInput.toUpperCase();
  const phone = phoneInput.replace(/\D/g, ''); // digits only

  // 1) Is this LINE account already linked?
  const linked = await findPatientByLineId(lineUserId);
  if (linked) {
    return `This LINE account is already registered to ${linked.hn} (${linked.patient_name}).`;
  }

  // 2) HN and phone number must both match
  const [rows] = await pool.query(
    'SELECT patient_id, hn, patient_name, line_user_id FROM patients WHERE hn = ? AND phone = ?',
    [hn, phone]
  );
  if (rows.length === 0) {
    return 'No matching record found. Please check your HN and phone number.';
  }
  const patient = rows[0];

  // 3) This HN is already linked to another LINE account
  if (patient.line_user_id) {
    return 'This HN is already registered to another LINE account. Please contact the hospital.';
  }

  // 4) Save
  try {
    const [result] = await pool.query(
      'UPDATE patients SET line_user_id = ? WHERE patient_id = ? AND line_user_id IS NULL',
      [lineUserId, patient.patient_id]
    );
    if (result.affectedRows === 0) {
      return 'This HN is already registered to another LINE account. Please contact the hospital.';
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return 'This LINE account is already registered.';
    }
    throw err;
  }

  return `Registration successful ✅\n${patient.patient_name} (${patient.hn})\n` +
         'You will receive a reminder before your appointment date.';
}

async function findPatientByLineId(lineUserId) {
  const [rows] = await pool.query(
    'SELECT patient_id, hn, patient_name FROM patients WHERE line_user_id = ?',
    [lineUserId]
  );
  return rows[0] || null;
}

function reply(client, event, text) {
  return replyMessages(client, event, [{ type: 'text', text }]);
}

function replyMessages(client, event, messages) {
  return client.replyMessage({ replyToken: event.replyToken, messages });
}

module.exports = { handleEvent };
