import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from './auth.mjs';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run admin -- you@example.com');
  process.exit(1);
}

let password;
if (process.stdin.isTTY) {
  const quiet = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: quiet, terminal: true });
  input.on('SIGINT', () => process.exit(130));
  try {
    process.stderr.write('Password (at least 14 characters): ');
    password = await input.question('');
    process.stderr.write('\nConfirm password: ');
    const confirmation = await input.question('');
    process.stderr.write('\n');
    if (password !== confirmation) {
      console.error('Passwords did not match.');
      process.exitCode = 1;
    }
  } finally {
    input.close();
  }
} else {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    password = line;
    break;
  }
}

if (!process.exitCode) {
  if (!password || password.length < 14 || Buffer.byteLength(password) > 256) {
    console.error('Use at least 14 characters and at most 256 bytes.');
    process.exitCode = 1;
  } else {
    const { db, transaction } = await import('./db.mjs');
    const hash = await hashPassword(password);
    transaction(() => {
      const user = db.prepare(`
        INSERT INTO admins(email, password_hash) VALUES (?, ?)
        ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
        RETURNING id
      `).get(email, hash);
      db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(user.id);
    });
    console.log(`Password set for ${email}.`);
  }
}
