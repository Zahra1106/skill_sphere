import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src/app.js';
import { createTokenVerifier } from '../src/auth.js';
import { openDb } from '../src/db.js';

const PROJECT = 'test-project';
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let server;
let db;
let tmpDir;
let base;
let privateKey;

before(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  Object.assign(jwk, { kid: 'k1', alg: 'RS256', use: 'sig' });

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillsphere-test-'));
  db = await openDb({ url: `file:${path.join(tmpDir, 'test.db')}` });

  const app = createApp({
    db,
    verify: createTokenVerifier({ projectId: PROJECT, jwks: createLocalJWKSet({ keys: [jwk] }) }),
    config: { corsOrigins: [], requireVerifiedEmail: true, rateLimitMax: 10_000 },
  });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  try {
    // On Windows the SQLite file can stay locked for a moment; never fail the
    // run because of temp-file cleanup (the OS clears the temp folder anyway).
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* ignore */
  }
});

async function token(uid, claims = {}, project = PROJECT) {
  return new SignJWT({
    email: `${uid}@example.com`,
    email_verified: true,
    name: `User ${uid}`,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject(uid)
    .setIssuer(`https://securetoken.google.com/${project}`)
    .setAudience(project)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

async function api(method, path, { as, body, bearer } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = bearer ?? (as ? await token(as) : null);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const validJob = {
  title: 'Flutter Developer',
  company: 'Acme Soft',
  type: 'Full-time',
  city: 'Lahore',
  salary: 'PKR 80,000',
  skills: 'Flutter, Firebase',
  description: 'Build and maintain our mobile apps with the team.',
};

test('health is public', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});

test('auth: missing, garbage, wrong project and unverified tokens are rejected', async () => {
  assert.equal((await api('GET', '/api/v1/me')).status, 401);
  assert.equal((await api('GET', '/api/v1/me', { bearer: 'garbage' })).status, 401);
  assert.equal((await api('GET', '/api/v1/me', { bearer: await token('a', {}, 'other-project') })).status, 401);
  const unverified = await api('GET', '/api/v1/me', { bearer: await token('a', { email_verified: false }) });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.json.error.code, 'email_not_verified');
});

test('GET /me creates the profile from token claims, then PUT /me updates it', async () => {
  const me = await api('GET', '/api/v1/me', { as: 'u1' });
  assert.equal(me.status, 200);
  assert.equal(me.json.name, 'User u1');
  assert.equal(me.json.email, 'u1@example.com');
  assert.deepEqual(me.json.interests, []);
  assert.deepEqual(me.json.progress, {});

  const upd = await api('PUT', '/api/v1/me', { as: 'u1', body: { name: 'Ayesha Khan', phone: '0300 1234567' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.json.name, 'Ayesha Khan');
  assert.equal(upd.json.phone, '0300 1234567');

  const bad = await api('PUT', '/api/v1/me', { as: 'u1', body: { name: '   ' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'validation_error');
});

test('invalid JSON gets a clean 400', async () => {
  const res = await fetch(`${base}/api/v1/me`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${await token('u1')}`, 'Content-Type': 'application/json' },
    body: '{nope',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'invalid_json');
});

test('interests and learning progress persist in /me', async () => {
  assert.equal((await api('PUT', '/api/v1/me/interests/dev_web', { as: 'u2' })).status, 200);
  assert.equal((await api('PUT', '/api/v1/me/interests/dev_web', { as: 'u2' })).status, 200); // idempotent
  assert.equal((await api('PUT', '/api/v1/me/interests/ai_ml', { as: 'u2' })).status, 200);
  await api('PUT', '/api/v1/me/progress/dev_web/2', { as: 'u2', body: { done: true } });
  await api('PUT', '/api/v1/me/progress/dev_web/0', { as: 'u2', body: { done: true } });
  await api('PUT', '/api/v1/me/progress/ai_ml/1', { as: 'u2', body: { done: true } });
  await api('PUT', '/api/v1/me/progress/ai_ml/1', { as: 'u2', body: { done: false } });

  let me = (await api('GET', '/api/v1/me', { as: 'u2' })).json;
  assert.deepEqual(me.interests.sort(), ['ai_ml', 'dev_web']);
  assert.deepEqual(me.progress, { dev_web: [0, 2] });

  await api('DELETE', '/api/v1/me/interests/ai_ml', { as: 'u2' });
  me = (await api('GET', '/api/v1/me', { as: 'u2' })).json;
  assert.deepEqual(me.interests, ['dev_web']);

  assert.equal((await api('PUT', '/api/v1/me/progress/Bad Id/1', { as: 'u2', body: { done: true } })).status, 400);
  assert.equal((await api('PUT', '/api/v1/me/progress/dev_web/99', { as: 'u2', body: { done: true } })).status, 400);
  assert.equal((await api('PUT', '/api/v1/me/progress/dev_web/1', { as: 'u2', body: {} })).status, 400);
});

test('photo: only real JPEG/PNG images are accepted', async () => {
  assert.equal((await api('PUT', '/api/v1/me/photo', { as: 'u3', body: { photo: 'bm90IGFuIGltYWdl' } })).status, 400);
  assert.equal((await api('PUT', '/api/v1/me/photo', { as: 'u3', body: { photo: '<script>' } })).status, 400);
  assert.equal((await api('PUT', '/api/v1/me/photo', { as: 'u3', body: { photo: TINY_PNG } })).status, 200);
  assert.equal((await api('GET', '/api/v1/me', { as: 'u3' })).json.photo, TINY_PNG);
  assert.equal((await api('PUT', '/api/v1/me/photo', { as: 'u3', body: { photo: null } })).status, 200);
  assert.equal((await api('GET', '/api/v1/me', { as: 'u3' })).json.photo, null);
});

test('location is saved on the profile', async () => {
  const r = await api('PUT', '/api/v1/me/location', { as: 'u4', body: { lat: 31.4504, lng: 73.135, city: 'Faisalabad, Pakistan' } });
  assert.equal(r.status, 200);
  const me = (await api('GET', '/api/v1/me', { as: 'u4' })).json;
  assert.deepEqual(me.location, { city: 'Faisalabad, Pakistan', lat: 31.4504, lng: 73.135 });
  assert.equal((await api('PUT', '/api/v1/me/location', { as: 'u4', body: { lat: 999, lng: 0 } })).status, 400);
});

test('forms: student upserts, college and software house are validated', async () => {
  const student = { name: 'Ali', email: 'ali@example.com', phone: '0300 1234567', gender: 'Male', city: 'Lahore' };
  assert.equal((await api('POST', '/api/v1/students', { as: 's1', body: student })).status, 201);
  assert.equal((await api('POST', '/api/v1/students', { as: 's1', body: { ...student, city: 'Multan' } })).status, 201);
  assert.equal((await api('POST', '/api/v1/students', { as: 's1', body: { ...student, city: 'Mars' } })).status, 400);

  const college = { name: 'Future IT College', email: 'info@fic.pk', phone: '0412345678', city: 'Faisalabad', address: 'Main Blvd', description: 'Computer science and software engineering.' };
  assert.equal((await api('POST', '/api/v1/colleges', { as: 'c1', body: college })).status, 201);
  assert.equal((await api('POST', '/api/v1/colleges', { as: 'c1', body: { ...college, email: 'nope' } })).status, 400);
  const list = await api('GET', '/api/v1/colleges?city=Faisalabad', { as: 'anyone' });
  assert.equal(list.json.colleges.length, 1);
  assert.equal((await api('GET', '/api/v1/colleges?city=Quetta', { as: 'anyone' })).json.colleges.length, 0);

  assert.equal((await api('GET', '/api/v1/software-houses/mine', { as: 'sh1' })).json.name, null);
  const sh = { name: 'Acme Soft', email: 'hr@acme.pk', phone: '0300 1234567', website: 'www.acme.pk', city: 'Lahore', teamSize: '11-50', description: 'We build mobile apps.' };
  assert.equal((await api('POST', '/api/v1/software-houses', { as: 'sh1', body: sh })).status, 201);
  assert.equal((await api('GET', '/api/v1/software-houses/mine', { as: 'sh1' })).json.name, 'Acme Soft');
});

test('jobs: post, browse, filter, apply, applicants, ownership and cascade delete', async () => {
  // Make sure applicant profiles exist with a name + phone.
  await api('PUT', '/api/v1/me', { as: 'student1', body: { name: 'Sara Student', phone: '0301 1111111' } });

  const created = await api('POST', '/api/v1/jobs', { as: 'owner1', body: validJob });
  assert.equal(created.status, 201);
  const jobId = created.json.id;
  assert.equal((await api('POST', '/api/v1/jobs', { as: 'owner1', body: { ...validJob, type: 'Hobby' } })).status, 400);
  await api('POST', '/api/v1/jobs', { as: 'owner2', body: { ...validJob, title: 'React Intern', type: 'Internship', city: 'Karachi', skills: 'React' } });

  // Browse + filters
  const all = (await api('GET', '/api/v1/jobs', { as: 'student1' })).json.jobs;
  assert.ok(all.length >= 2);
  assert.equal(all[0].createdAt >= all.at(-1).createdAt, true);
  assert.equal((await api('GET', '/api/v1/jobs?city=Karachi', { as: 'student1' })).json.jobs.every((j) => j.city === 'Karachi'), true);
  assert.equal((await api('GET', '/api/v1/jobs?q=react', { as: 'student1' })).json.jobs.length, 1);
  assert.equal((await api('GET', '/api/v1/jobs?q=%25', { as: 'student1' })).json.jobs.length, 0); // % is escaped
  assert.equal((await api('GET', '/api/v1/jobs?limit=abc', { as: 'student1' })).status, 400);

  // Applying
  assert.equal((await api('POST', `/api/v1/jobs/${jobId}/apply`, { as: 'student1' })).status, 201);
  assert.equal((await api('POST', `/api/v1/jobs/${jobId}/apply`, { as: 'student1' })).status, 201); // idempotent
  const own = await api('POST', `/api/v1/jobs/${jobId}/apply`, { as: 'owner1' });
  assert.equal(own.status, 403);
  assert.equal(own.json.error.code, 'own_job');
  assert.equal((await api('POST', '/api/v1/jobs/00000000-0000-4000-8000-000000000000/apply', { as: 'student1' })).status, 404);
  assert.equal((await api('POST', '/api/v1/jobs/not-a-uuid/apply', { as: 'student1' })).status, 400);
  assert.deepEqual((await api('GET', '/api/v1/me/applied', { as: 'student1' })).json.ids, [jobId]);

  // Owner view
  const mine = (await api('GET', '/api/v1/jobs/mine', { as: 'owner1' })).json.jobs;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].applicantCount, 1);
  const applicants = (await api('GET', `/api/v1/jobs/${jobId}/applicants`, { as: 'owner1' })).json.applicants;
  assert.equal(applicants.length, 1);
  assert.equal(applicants[0].name, 'Sara Student');
  assert.equal(applicants[0].phone, '0301 1111111');

  // Strangers cannot see applicants or delete
  assert.equal((await api('GET', `/api/v1/jobs/${jobId}/applicants`, { as: 'student1' })).status, 403);
  assert.equal((await api('DELETE', `/api/v1/jobs/${jobId}`, { as: 'student1' })).status, 403);

  // Delete cascades to applications
  assert.equal((await api('DELETE', `/api/v1/jobs/${jobId}`, { as: 'owner1' })).status, 200);
  assert.equal((await api('DELETE', `/api/v1/jobs/${jobId}`, { as: 'owner1' })).status, 404);
  assert.deepEqual((await api('GET', '/api/v1/me/applied', { as: 'student1' })).json.ids, []);
});

test('DELETE /me removes everything the user owns', async () => {
  const job = await api('POST', '/api/v1/jobs', { as: 'goner', body: validJob });
  await api('POST', `/api/v1/jobs/${job.json.id}/apply`, { as: 'other' });
  await api('PUT', '/api/v1/me/interests/dev_web', { as: 'goner' });
  await api('POST', '/api/v1/students', { as: 'goner', body: { name: 'G', email: 'g@example.com', phone: '0300 1234567', gender: 'Other', city: 'Lahore' } });

  assert.equal((await api('DELETE', '/api/v1/me', { as: 'goner' })).status, 200);
  assert.equal((await api('GET', '/api/v1/jobs/mine', { as: 'goner' })).json.jobs.length, 0);
  assert.deepEqual((await api('GET', '/api/v1/me/applied', { as: 'other' })).json.ids, []);
  const fresh = (await api('GET', '/api/v1/me', { as: 'goner' })).json; // recreated blank
  assert.deepEqual(fresh.interests, []);
});

test('unknown routes return a JSON 404', async () => {
  const r = await api('GET', '/api/v1/nope', { as: 'u1' });
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'not_found');
});
