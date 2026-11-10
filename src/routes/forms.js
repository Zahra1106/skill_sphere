import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { collegeForm, parse, softwareHouseForm, studentForm } from '../validators.js';

const now = () => Date.now();

export function formsRouter({ db }) {
  const r = Router();

  // One application per student (re-submitting updates it).
  r.post('/students', asyncHandler(async (req, res) => {
    const f = parse(studentForm, req.body);
    await db.run(`
      INSERT INTO students (uid, name, email, phone, gender, city, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        name = excluded.name, email = excluded.email, phone = excluded.phone,
        gender = excluded.gender, city = excluded.city, updated_at = excluded.updated_at
    `, [req.user.uid, f.name, f.email, f.phone, f.gender, f.city, now(), now()]);
    res.status(201).json({ ok: true });
  }));

  r.post('/colleges', asyncHandler(async (req, res) => {
    const f = parse(collegeForm, req.body);
    const { lastInsertRowid } = await db.run(`
      INSERT INTO colleges (owner_uid, name, email, phone, city, address, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.uid, f.name, f.email, f.phone, f.city, f.address, f.description, now()]);
    res.status(201).json({ id: lastInsertRowid });
  }));

  // Used by the (upcoming) colleges directory.
  r.get('/colleges', asyncHandler(async (req, res) => {
    const city = typeof req.query.city === 'string' && req.query.city ? req.query.city : null;
    const colleges = await db.all(`
      SELECT id, name, email, phone, city, address, description, created_at AS createdAt
      FROM colleges WHERE (? IS NULL OR city = ?) ORDER BY created_at DESC LIMIT 200
    `, [city, city]);
    res.json({ colleges });
  }));

  r.post('/software-houses', asyncHandler(async (req, res) => {
    const f = parse(softwareHouseForm, req.body);
    const { lastInsertRowid } = await db.run(`
      INSERT INTO software_houses
        (owner_uid, name, email, phone, website, city, team_size, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.uid, f.name, f.email, f.phone, f.website, f.city, f.teamSize, f.description, now()]);
    res.status(201).json({ id: lastInsertRowid });
  }));

  // Name of the company this user registered (prefills "Post a job").
  r.get('/software-houses/mine', asyncHandler(async (req, res) => {
    const row = await db.get(
      'SELECT name FROM software_houses WHERE owner_uid = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.uid],
    );
    res.json({ name: row?.name ?? null });
  }));

  return r;
}
