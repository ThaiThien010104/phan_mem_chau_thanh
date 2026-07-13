const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    connectionTimeout: Number(process.env.MAIL_TIMEOUT_MS || 5000),
    greetingTimeout: Number(process.env.MAIL_TIMEOUT_MS || 5000),
    socketTimeout: Number(process.env.MAIL_TIMEOUT_MS || 5000),
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
}

function isMailConfigured() {
  return Boolean(
    process.env.MAIL_HOST &&
    process.env.MAIL_HOST !== 'smtp.example.com' &&
    process.env.MAIL_USER &&
    process.env.MAIL_PASS &&
    process.env.MAIL_PASS !== 'your_password'
  );
}

async function sendTaskStageEmail({ to, taskCode, fromStage, toStage }) {
  if (!to || !isMailConfigured()) {
    return;
  }

  const transporter = createTransporter();
  const subject = `[${taskCode}] Ho so chuyen buoc ${fromStage || 'N/A'} -> ${toStage}`;
  const text = `Ho so ${taskCode} da duoc chuyen tu ${fromStage || 'N/A'} sang ${toStage}.`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    text,
  });
}

module.exports = {
  sendTaskStageEmail,
};
