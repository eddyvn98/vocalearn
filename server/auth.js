import {randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt = promisify(scryptCb);
const digest = value => createHash('sha256').update(value).digest('hex');
const cookieToken = req => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('voca_session='))?.slice(13);
const ttl = 30 * 86400000;
export function sessionUser(db, req) {
  const token = cookieToken(req);
  if (!token || token.length > 200) return null;
  return db.prepare('SELECT users.id,users.email FROM sessions JOIN users ON sessions.user_id=users.id WHERE token=? AND expires>?')
    .get(digest(token), Date.now()) ?? null;
}
export function cookie(value, secure, clear = false) {
  return `voca_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : ttl / 1000}${secure ? '; Secure' : ''}`;
}
export async function authenticate(db, body, register, allowSignup) {
  const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || password.length < 12 || password.length > 200) throw new Error('Use a valid email and a password of 12-200 characters');
  let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (register) {
    if (!allowSignup) throw new Error('Registration is disabled');
    if (user) throw new Error('Unable to create account');
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    user = {id: randomUUID(), email, salt, hash};
    db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(user.id, email, hash, salt);
  } else {
    const candidate = await scrypt(password, user?.salt ?? '0000000000000000', 64);
    if (!user || !timingSafeEqual(Buffer.from(user.hash, 'hex'), candidate)) throw new Error('Email or password is incorrect');
  }
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), user.id, Date.now() + ttl);
  return {token, user: {id: user.id, email: user.email}};
}
export function logout(db, req) {
  const token = cookieToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
}
