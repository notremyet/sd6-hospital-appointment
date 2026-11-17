// ---------- Message layouts (Flex Message) ----------
const HOSPITAL_NAME = process.env.HOSPITAL_NAME || 'SIIT Hospital';
const HOSPITAL_PHONE = process.env.HOSPITAL_PHONE || '021234567'; // placeholder number

const COLORS = {
  confirm: '#22C55E',
  decline: '#EF4444',
  headerReminder: '#EBDDF7',
  headerConfirmed: '#D3F2DC',
  headerDeclined: '#F8D0D0',
  rescheduleBox: '#FDECEC',
  headerWarning: '#FDE68A',
  headerReschedule: '#D6E8FB',
  headerPrivacy: '#E5E7EB',
  infoBox: '#F1F1F1',
  muted: '#888888',
};

// '2026-11-14' -> '14 November 2026'
function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// '2026-11-14' -> 'Sat 14 Nov' (short enough for a Quick Reply button)
function formatShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

// '09:00:00' -> '09:00'
function formatTime(timeStr) {
  return timeStr.slice(0, 5);
}

function infoRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.muted, flex: 2 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', wrap: true, flex: 5 },
    ],
  };
}

// Appointment details box (reused by most cards)
function appointmentInfoBox(appt) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: COLORS.infoBox,
    cornerRadius: 'md',
    paddingAll: 'md',
    spacing: 'sm',
    margin: 'md',
    contents: [
      infoRow('Doctor', appt.doctor_name),
      infoRow('Dept.', appt.department_name),
      infoRow('Date', formatDate(appt.appointment_date)),
      infoRow('Time', formatTime(appt.appointment_time)),
    ],
  };
}

function hospitalFooter() {
  return { type: 'text', text: `🏥 ${HOSPITAL_NAME}`, size: 'xs', color: COLORS.muted, margin: 'md' };
}

// Confirm / Decline buttons (used by the reminder card and the Confirmation Required card)
function responseButtons(appointmentId) {
  return [
    {
      type: 'button',
      style: 'primary',
      color: COLORS.confirm,
      height: 'sm',
      action: {
        type: 'postback',
        label: 'Confirm Appointment',
        data: `action=confirm&appointment_id=${appointmentId}`,
        displayText: 'Confirm Appointment',
      },
    },
    {
      type: 'button',
      style: 'primary',
      color: COLORS.decline,
      height: 'sm',
      action: {
        type: 'postback',
        label: 'Decline Appointment',
        data: `action=decline&appointment_id=${appointmentId}`,
        displayText: 'Decline Appointment',
      },
    },
  ];
}

function postbackButton(label, data, style = 'secondary', color) {
  return {
    type: 'button',
    style,
    height: 'sm',
    ...(color ? { color } : {}),
    action: { type: 'postback', label, data, displayText: label },
  };
}

// "Reschedule" link-style button (less prominent than Confirm)
function rescheduleLinkButton(appointmentId, label = 'Reschedule') {
  return postbackButton(label, `action=reschedule&appointment_id=${appointmentId}`, 'link');
}

// Buttons for an already-confirmed appointment: reschedule / cancel
function manageButtons(appointmentId) {
  return [
    postbackButton('Reschedule', `action=reschedule&appointment_id=${appointmentId}`),
    postbackButton('Cancel Appointment', `action=cancel&appointment_id=${appointmentId}`),
  ];
}

// Figure 12: Reminder page
function reminderMessage(appt) {
  const id = appt.appointment_id;
  return {
    type: 'flex',
    altText: `Appointment reminder: ${formatDate(appt.appointment_date)} ${formatTime(appt.appointment_time)}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerReminder,
        contents: [{ type: 'text', text: '📅 Appointment Reminder', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `Hello, ${appt.patient_name}.`, size: 'sm', wrap: true },
          { type: 'text', text: 'You have an upcoming appointment:', size: 'sm', wrap: true },
          appointmentInfoBox(appt),
          { type: 'text', text: 'Will you attend this appointment?', size: 'sm', weight: 'bold', margin: 'lg' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...responseButtons(id),
          rescheduleLinkButton(id),
          hospitalFooter(),
        ],
      },
    },
  };
}

// Figure 13: Confirmation page
function confirmedMessage(appt) {
  const bullet = (text) => ({ type: 'text', text: `• ${text}`, size: 'xs', wrap: true, color: '#555555' });
  return {
    type: 'flex',
    altText: 'Your appointment has been confirmed',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerConfirmed,
        contents: [{ type: 'text', text: '✅ Appointment Confirmed', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `Thank you, ${appt.patient_name}.`, size: 'sm', wrap: true },
          { type: 'text', text: 'Your confirmation has been recorded successfully.', size: 'sm', wrap: true },
          appointmentInfoBox(appt),
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'xs',
            contents: [
              { type: 'text', text: 'Preparation', size: 'sm', weight: 'bold' },
              bullet('Please arrive 15 minutes early'),
              bullet('Bring your ID card or hospital card'),
              bullet('Follow the preparation instructions given by your doctor'),
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'Plans changed? You can reschedule or cancel here.', size: 'xs', color: COLORS.muted, wrap: true },
          ...manageButtons(appt.appointment_id),
          hospitalFooter(),
        ],
      },
    },
  };
}

// Figure 14: ask why the patient cannot attend (Quick Reply)
function askDeclineReasonMessage(appointmentId, reasons) {
  return {
    type: 'text',
    text: 'Your appointment has been marked as declined.\nPlease select a reason from the buttons below.',
    quickReply: {
      items: Object.entries(reasons).map(([code, label]) => ({
        type: 'action',
        action: {
          type: 'postback',
          label,
          data: `action=decline_reason&appointment_id=${appointmentId}&reason=${code}`,
          displayText: label,
        },
      })),
    },
  };
}

// Figure 15: Decline page
function declinedMessage(appt, reasonText) {
  return {
    type: 'flex',
    altText: 'Your appointment has been marked as declined',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerDeclined,
        contents: [{ type: 'text', text: '❎ Appointment Declined', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'Your appointment has been marked as declined.', size: 'sm', wrap: true },
          appointmentInfoBox(appt),
          { type: 'text', text: `Reason: ${reasonText}`, size: 'sm', wrap: true, margin: 'md' },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: COLORS.rescheduleBox,
            cornerRadius: 'md',
            paddingAll: 'md',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'Need a new date?', size: 'sm', weight: 'bold' },
              { type: 'text', text: 'Pick a new date and time yourself. No phone call needed.', size: 'xs', wrap: true },
              postbackButton('Choose a New Date', `action=reschedule&appointment_id=${appt.appointment_id}`, 'primary', COLORS.decline),
              {
                type: 'button',
                style: 'link',
                height: 'sm',
                action: { type: 'uri', label: 'Call Hospital', uri: `tel:${HOSPITAL_PHONE}` },
              },
            ],
          },
          hospitalFooter(),
        ],
      },
    },
  };
}

// Figure 16: Confirmation Required page (sent when the response deadline has passed)
function confirmationRequiredMessage(appt) {
  return {
    type: 'flex',
    altText: 'Please confirm your appointment',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerWarning,
        contents: [{ type: 'text', text: '⚠️ Confirmation Required', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `Hello, ${appt.patient_name}.`, size: 'sm', wrap: true },
          { type: 'text', text: 'We have not received your response regarding your upcoming appointment.', size: 'sm', wrap: true },
          appointmentInfoBox(appt),
          {
            type: 'text',
            text: 'Will you attend? You can still respond below.',
            size: 'sm',
            weight: 'bold',
            wrap: true,
            margin: 'lg',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...responseButtons(appt.appointment_id),
          rescheduleLinkButton(appt.appointment_id),
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: { type: 'uri', label: 'Call Hospital', uri: `tel:${HOSPITAL_PHONE}` },
          },
          hospitalFooter(),
        ],
      },
    },
  };
}

// ---------- My Appointments (Rich Menu) ----------
const STATUS_STYLE = {
  Pending: { label: '⏳ Pending Confirmation', bg: COLORS.headerWarning },
  Confirmed: { label: '✅ Confirmed', bg: COLORS.headerConfirmed },
  Declined: { label: '❎ Declined', bg: COLORS.headerDeclined },
};

function appointmentStatusBubble(appt) {
  const style = STATUS_STYLE[appt.confirmation_status];
  const id = appt.appointment_id;
  const buttons = {
    Pending: [...responseButtons(id), rescheduleLinkButton(id)],
    Confirmed: manageButtons(id),
    Declined: [postbackButton('Choose a New Date', `action=reschedule&appointment_id=${id}`)],
  };
  const footerContents = [...buttons[appt.confirmation_status], hospitalFooter()];
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: style.bg,
      contents: [{ type: 'text', text: style.label, weight: 'bold', size: 'md' }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [appointmentInfoBox(appt)],
    },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerContents },
  };
}

// Show several appointments as a swipeable carousel
function myAppointmentsMessage(appts) {
  return {
    type: 'flex',
    altText: `Your appointments (${appts.length})`,
    contents: { type: 'carousel', contents: appts.map(appointmentStatusBubble) },
  };
}

// Unrecognised input (CB3) + shortcut buttons
function fallbackMessage() {
  return {
    type: 'text',
    text: 'Sorry, I did not understand that message.\nPlease choose from the menu below.',
    quickReply: {
      items: ['My Appointments', 'Help'].map((text) => ({
        type: 'action',
        action: { type: 'message', label: text, text },
      })),
    },
  };
}

// ---------- Reschedule / Cancel ----------
function quickReplyText(text, items) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: items.map(({ label, data }) => ({
        type: 'action',
        action: { type: 'postback', label, data, displayText: label },
      })),
    },
  };
}

// Step 1: choose a date
function chooseDateMessage(appt, dates) {
  return quickReplyText(
    'Please choose a new date 📅\n' +
    `Doctor: ${appt.doctor_name}\n` +
    `Current: ${formatDate(appt.appointment_date)} ${formatTime(appt.appointment_time)}\n\n` +
    'Tap a date from the buttons below.',
    dates.map((d) => ({
      label: formatShortDate(d.slot_date),
      data: `action=reschedule_date&appointment_id=${appt.appointment_id}&date=${d.slot_date}`,
    }))
  );
}

// Step 2: choose a time
function chooseTimeMessage(appt, date, slots) {
  return quickReplyText(
    `Please choose a time on ${formatDate(date)} ⏰`,
    [
      ...slots.map((s) => ({
        label: `${formatTime(s.slot_time)} (${s.remaining} left)`,
        data: `action=reschedule_time&appointment_id=${appt.appointment_id}&slot_id=${s.slot_id}`,
      })),
      { label: '← Other date', data: `action=reschedule&appointment_id=${appt.appointment_id}` },
    ].slice(0, 13)
  );
}

// Step 3: summary before confirming (prevents mis-taps)
function confirmRescheduleMessage(appt, slot) {
  const row = (label, value, bold) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.muted, flex: 2 },
      { type: 'text', text: value, size: 'sm', wrap: true, flex: 5, ...(bold ? { weight: 'bold' } : {}) },
    ],
  });
  return {
    type: 'flex',
    altText: 'Confirm reschedule',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerReschedule,
        contents: [{ type: 'text', text: '🔄 Confirm Reschedule', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          row('Doctor', appt.doctor_name),
          row('Current', `${formatDate(appt.appointment_date)} ${formatTime(appt.appointment_time)}`),
          row('New', `${formatDate(slot.slot_date)} ${formatTime(slot.slot_time)}`, true),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          postbackButton('Confirm Reschedule',
            `action=reschedule_confirm&appointment_id=${appt.appointment_id}&slot_id=${slot.slot_id}`,
            'primary', COLORS.confirm),
          postbackButton('Pick Another Time', `action=reschedule&appointment_id=${appt.appointment_id}`, 'link'),
        ],
      },
    },
  };
}

// Step 4: rescheduled
function rescheduledMessage(appt, oldDate, oldTime) {
  return {
    type: 'flex',
    altText: 'Your appointment has been rescheduled',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerConfirmed,
        contents: [{ type: 'text', text: '✅ Appointment Rescheduled', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'Your new appointment:', size: 'sm' },
          appointmentInfoBox(appt),
          {
            type: 'text',
            text: `(Previously ${formatDate(oldDate)} ${formatTime(oldTime)})`,
            size: 'xs', color: COLORS.muted, wrap: true, margin: 'md',
          },
          { type: 'text', text: 'This new appointment has been recorded as confirmed.', size: 'sm', wrap: true, margin: 'md' },
          hospitalFooter(),
        ],
      },
    },
  };
}

// Cancelling a confirmed appointment: ask again first
function confirmCancelMessage(appt) {
  return {
    type: 'flex',
    altText: 'Confirm cancellation',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerDeclined,
        contents: [{ type: 'text', text: 'Cancel this appointment?', weight: 'bold', size: 'md' }],
      },
      body: { type: 'box', layout: 'vertical', contents: [appointmentInfoBox(appt)] },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          postbackButton('Yes, Cancel', `action=cancel_confirm&appointment_id=${appt.appointment_id}`, 'primary', COLORS.decline),
          postbackButton('Reschedule Instead', `action=reschedule&appointment_id=${appt.appointment_id}`),
          postbackButton('Keep Appointment', 'action=dismiss', 'link'),
        ],
      },
    },
  };
}

// Button pressed on an old card after responding: offer next steps instead of a phone call
function alreadyAnsweredMessage(appt) {
  const id = appt.appointment_id;
  if (appt.confirmation_status === 'Confirmed') {
    return quickReplyText(
      'You have already confirmed this appointment ✅\nTo make a change, choose from the buttons below.',
      [
        { label: 'Reschedule', data: `action=reschedule&appointment_id=${id}` },
        { label: 'Cancel Appointment', data: `action=cancel&appointment_id=${id}` },
      ]
    );
  }
  return quickReplyText(
    'This appointment is already marked as declined.\nTo book a new date, tap the button below.',
    [{ label: 'Choose a New Date', data: `action=reschedule&appointment_id=${id}` }]
  );
}

// ---------- PDPA ----------
// Consent card (shown before registration)
function consentMessage(summary, version) {
  return {
    type: 'flex',
    altText: 'Consent to use your personal data',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLORS.headerPrivacy,
        contents: [{ type: 'text', text: '🔒 Personal Data Consent', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: 'Before you start, please read and give your consent under the Personal Data Protection Act (PDPA).',
            size: 'sm', wrap: true,
          },
          ...summary.map((line) => ({ type: 'text', text: `• ${line}`, size: 'xs', wrap: true, color: '#555555' })),
          { type: 'text', text: `Version ${version}`, size: 'xxs', color: COLORS.muted, margin: 'md' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          postbackButton('I Agree', 'action=consent_accept', 'primary', COLORS.confirm),
          postbackButton('I Do Not Agree', 'action=consent_decline'),
          postbackButton('Read Full Notice', 'action=privacy_full', 'link'),
        ],
      },
    },
  };
}

// Ask again before withdrawing consent
function withdrawConfirmMessage() {
  return {
    type: 'flex',
    altText: 'Confirm consent withdrawal',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'Withdraw your consent?', weight: 'bold', size: 'md' },
          {
            type: 'text',
            text: 'Your LINE account will be unlinked from your patient record and you will no longer receive appointment messages on LINE.\n' +
                  'Your appointments stay unchanged. Staff will contact you by phone instead.',
            size: 'sm', wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          postbackButton('Yes, Withdraw', 'action=consent_withdraw_confirm', 'primary', COLORS.decline),
          postbackButton('Keep Using', 'action=dismiss_privacy', 'link'),
        ],
      },
    },
  };
}

module.exports = {
  reminderMessage,
  confirmedMessage,
  askDeclineReasonMessage,
  declinedMessage,
  confirmationRequiredMessage,
  myAppointmentsMessage,
  chooseDateMessage,
  chooseTimeMessage,
  confirmRescheduleMessage,
  rescheduledMessage,
  confirmCancelMessage,
  alreadyAnsweredMessage,
  consentMessage,
  withdrawConfirmMessage,
  fallbackMessage,
  appointmentInfoBox,
  hospitalFooter,
  formatDate,
  formatTime,
  COLORS,
};
