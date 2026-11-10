import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { asyncHandler, HttpError } from '../errors.js';
import { jobForm, jobsQuery, parse, uuidSchema } from '../validators.js';

const now = () => Date.now();

const JOB_COLUMNS = `
  j.id, j.title, j.company, j.type, j.city, j.salary, j.skills, j.description,
  j.owner_uid AS ownerUid, j.created_at AS createdAt
`;

export function jobsRouter({ db }) {
  const r = Router();

  async function loadJob(rawId) {
    const id = parse(uuidSchema, rawId);
    const job = await db.get('SELECT id, owner_uid AS ownerUid FROM jobs WHERE id = ?', [id]);
    if (!job) throw new HttpError(404, 'not_found', 'Job not found');
    return job;
  }

  function assertOwner(job, uid) {
    if (job.ownerUid !== uid) throw new HttpError(403, 'forbidden', 'This job belongs to someone else');
  }

  // Browse all jobs (newest first). Filters are optional.
  r.get('/jobs', asyncHandler(async (req, res) => {
    const { limit, city, type, q } = parse(jobsQuery, req.query);
    const like = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    const c = city ?? null;
    const t = type ?? null;
    const jobs = await db.all(`
      SELECT ${JOB_COLUMNS} FROM jobs j
      WHERE (? IS NULL OR j.city = ?)
        AND (? IS NULL OR j.type = ?)
        AND (? IS NULL OR j.title LIKE ? ESCAPE '\\' OR j.company LIKE ? ESCAPE '\\' OR j.skills LIKE ? ESCAPE '\\')
      ORDER BY j.created_at DESC LIMIT ?
    `, [c, c, t, t, like, like, like, like, limit]);
    res.json({ jobs });
  }));

  // Jobs posted by me, with applicant counts (single query, no N+1).
  r.get('/jobs/mine', asyncHandler(async (req, res) => {
    const jobs = await db.all(`
      SELECT ${JOB_COLUMNS},
        (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS applicantCount
      FROM jobs j WHERE j.owner_uid = ? ORDER BY j.created_at DESC
    `, [req.user.uid]);
    res.json({ jobs });
  }));

  r.post('/jobs', asyncHandler(async (req, res) => {
    const f = parse(jobForm, req.body);
    const id = randomUUID();
    await db.run(`
      INSERT INTO jobs (id, owner_uid, title, company, type, city, salary, skills, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, req.user.uid, f.title, f.company, f.type, f.city, f.salary, f.skills, f.description, now()]);
    res.status(201).json({ id });
  }));

  r.delete('/jobs/:id', asyncHandler(async (req, res) => {
    const job = await loadJob(req.params.id);
    assertOwner(job, req.user.uid);
    await db.batch([
      ['DELETE FROM applications WHERE job_id = ?', [job.id]],
      ['DELETE FROM jobs WHERE id = ?', [job.id]],
    ]);
    res.json({ ok: true });
  }));

  // Apply with the applicant's own profile (never trusted from the request body).
  r.post('/jobs/:id/apply', asyncHandler(async (req, res) => {
    const job = await loadJob(req.params.id);
    if (job.ownerUid === req.user.uid) {
      throw new HttpError(403, 'own_job', 'You cannot apply to your own job');
    }
    const profile = await db.get('SELECT name, email, phone FROM users WHERE uid = ?', [req.user.uid]);
    const name = profile?.name || req.user.name || '';
    const email = profile?.email || req.user.email || '';
    await db.run(`
      INSERT OR IGNORE INTO applications (job_id, uid, name, email, phone, applied_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [job.id, req.user.uid, name, email, profile?.phone ?? '', now()]);
    res.status(201).json({ ok: true });
  }));

  r.get('/jobs/:id/applicants', asyncHandler(async (req, res) => {
    const job = await loadJob(req.params.id);
    assertOwner(job, req.user.uid);
    const applicants = await db.all(`
      SELECT uid, name, email, phone, applied_at AS appliedAt
      FROM applications WHERE job_id = ? ORDER BY applied_at DESC
    `, [job.id]);
    res.json({ applicants });
  }));

  return r;
}
