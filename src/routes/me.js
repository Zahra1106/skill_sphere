import { Router } from 'express';
import { asyncHandler, HttpError } from '../errors.js';
import {
  assertImage, idSchema, locationUpdate, parse, photoUpdate, profileUpdate, progressUpdate,
} from '../validators.js';

const now = () => Date.now();

export function meRouter({ db }) {
  const r = Router();

  /** Profiles are created lazily on the first request after email verification. */
  async function ensureUser(user) {
    const name = user.name || (user.email ? user.email.split('@')[0] : '');
    await db.run(
      'INSERT OR IGNORE INTO users (uid, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [user.uid, name, user.email, now(), now()],
    );
  }

  async function profileJson(uid) {
    const [u, interestRows, progressRows] = await Promise.all([
      db.get('SELECT * FROM users WHERE uid = ?', [uid]),
      db.all('SELECT sub_id FROM interests WHERE uid = ?', [uid]),
      db.all('SELECT sub_id, topic_index FROM progress WHERE uid = ? ORDER BY topic_index', [uid]),
    ]);
    const progress = {};
    for (const row of progressRows) (progress[row.sub_id] ??= []).push(row.topic_index);
    return {
      uid: u.uid,
      name: u.name,
      email: u.email,
      phone: u.phone,
      photo: u.photo,
      location: u.lat == null ? null : { city: u.city ?? '', lat: u.lat, lng: u.lng },
      interests: interestRows.map((x) => x.sub_id),
      progress,
    };
  }

  r.get('/me', asyncHandler(async (req, res) => {
    await ensureUser(req.user);
    res.json(await profileJson(req.user.uid));
  }));

  r.put('/me', asyncHandler(async (req, res) => {
    const { name, phone } = parse(profileUpdate, req.body);
    await ensureUser(req.user);
    await db.run('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE uid = ?',
      [name, phone, now(), req.user.uid]);
    res.json(await profileJson(req.user.uid));
  }));

  r.put('/me/photo', asyncHandler(async (req, res) => {
    const { photo } = parse(photoUpdate, req.body);
    if (photo) assertImage(photo);
    await ensureUser(req.user);
    await db.run('UPDATE users SET photo = ?, updated_at = ? WHERE uid = ?', [photo, now(), req.user.uid]);
    res.json({ ok: true });
  }));

  r.put('/me/location', asyncHandler(async (req, res) => {
    const { lat, lng, city } = parse(locationUpdate, req.body);
    await ensureUser(req.user);
    await db.run('UPDATE users SET lat = ?, lng = ?, city = ?, updated_at = ? WHERE uid = ?',
      [lat, lng, city, now(), req.user.uid]);
    res.json({ ok: true });
  }));

  // ---- Saved skills (bookmarks) ----
  r.put('/me/interests/:subId', asyncHandler(async (req, res) => {
    const subId = parse(idSchema, req.params.subId);
    await ensureUser(req.user);
    await db.run('INSERT OR IGNORE INTO interests (uid, sub_id) VALUES (?, ?)', [req.user.uid, subId]);
    res.json({ ok: true });
  }));

  r.delete('/me/interests/:subId', asyncHandler(async (req, res) => {
    const subId = parse(idSchema, req.params.subId);
    await db.run('DELETE FROM interests WHERE uid = ? AND sub_id = ?', [req.user.uid, subId]);
    res.json({ ok: true });
  }));

  // ---- Learning progress ----
  r.put('/me/progress/:subId/:index', asyncHandler(async (req, res) => {
    const subId = parse(idSchema, req.params.subId);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index > 49) {
      throw new HttpError(400, 'validation_error', 'index: Invalid topic index');
    }
    const { done } = parse(progressUpdate, req.body);
    await ensureUser(req.user);
    if (done) {
      await db.run('INSERT OR IGNORE INTO progress (uid, sub_id, topic_index) VALUES (?, ?, ?)',
        [req.user.uid, subId, index]);
    } else {
      await db.run('DELETE FROM progress WHERE uid = ? AND sub_id = ? AND topic_index = ?',
        [req.user.uid, subId, index]);
    }
    res.json({ ok: true });
  }));

  // ---- Jobs this user applied to ----
  r.get('/me/applied', asyncHandler(async (req, res) => {
    const rows = await db.all('SELECT job_id FROM applications WHERE uid = ?', [req.user.uid]);
    res.json({ ids: rows.map((x) => x.job_id) });
  }));

  // ---- Delete all data of this user (the app then deletes the Firebase account) ----
  r.delete('/me', asyncHandler(async (req, res) => {
    const uid = req.user.uid;
    await db.batch([
      ['DELETE FROM applications WHERE job_id IN (SELECT id FROM jobs WHERE owner_uid = ?)', [uid]],
      ['DELETE FROM applications WHERE uid = ?', [uid]],
      ['DELETE FROM jobs WHERE owner_uid = ?', [uid]],
      ['DELETE FROM colleges WHERE owner_uid = ?', [uid]],
      ['DELETE FROM software_houses WHERE owner_uid = ?', [uid]],
      ['DELETE FROM students WHERE uid = ?', [uid]],
      ['DELETE FROM interests WHERE uid = ?', [uid]],
      ['DELETE FROM progress WHERE uid = ?', [uid]],
      ['DELETE FROM users WHERE uid = ?', [uid]],
    ]);
    res.json({ ok: true });
  }));

  return r;
}
