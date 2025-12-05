import { Resend } from 'resend';

let connectionSettings = null;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Authentication token not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

export async function getResendClient() {
  const creds = await getCredentials();
  return {
    client: new Resend(creds.apiKey),
    fromEmail: creds.fromEmail
  };
}

export async function sendPasswordResetEmail(toEmail, resetCode, resetLink) {
  const { client, fromEmail } = await getResendClient();
  
  await client.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: 'MooMoo.io - Password Reset Request',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested to reset your password for your MooMoo.io account.</p>
      <p>Your verification code is: <strong>${resetCode}</strong></p>
      <p>Or click this link to reset your password:</p>
      <a href="${resetLink}">Reset Password</a>
      <p>This code expires in 15 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  });
}
