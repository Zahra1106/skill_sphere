import { z } from 'zod';
import { HttpError } from './errors.js';

/** Validates `data` and throws a 400 with a user-friendly message. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    throw new HttpError(400, 'validation_error', field ? `${field}: ${issue.message}` : issue.message);
  }
  return result.data;
}

const text = (label, min, max) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} is too long`);

const optionalText = (max) => z.string().trim().max(max).optional().default('');

const phone = z
  .string({ error: 'Phone number is required' })
  .trim()
  .regex(/^[0-9+\s\-()]{10,20}$/, 'Enter a valid phone number');

const email = z.string({ error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email').max(120);

export const CITIES = [
  'Faisalabad', 'Lahore', 'Karachi', 'Islamabad',
  'Rawalpindi', 'Multan', 'Peshawar', 'Quetta',
];
export const GENDERS = ['Male', 'Female', 'Other'];
export const JOB_TYPES = ['Full-time', 'Part-time', 'Internship', 'Remote', 'Contract'];
export const TEAM_SIZES = ['1-10', '11-50', '51-200', '200+'];

const city = z.enum(CITIES, { error: 'Select a valid city' });

export const idSchema = z.string().regex(/^[a-z0-9_]{1,40}$/, 'Invalid id');
export const uuidSchema = z.string().uuid('Invalid id');

export const profileUpdate = z.object({
  name: text('Name', 1, 80),
  phone: z.string().trim().regex(/^[0-9+\s\-()]{0,20}$/, 'Enter a valid phone number').optional().default(''),
});

export const photoUpdate = z.object({
  photo: z.string().max(300_000, 'Photo is too large').nullable(),
});

export const locationUpdate = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  city: optionalText(120),
});

export const progressUpdate = z.object({ done: z.boolean() });

export const studentForm = z.object({
  name: text('Name', 1, 80),
  email,
  phone,
  gender: z.enum(GENDERS, { error: 'Select a valid gender' }),
  city,
});

export const collegeForm = z.object({
  name: text('College name', 2, 120),
  email,
  phone,
  city,
  address: text('Address', 3, 200),
  description: text('Description', 10, 1000),
});

export const softwareHouseForm = z.object({
  name: text('Company name', 2, 120),
  email,
  phone,
  website: optionalText(200),
  city,
  teamSize: z.enum(TEAM_SIZES, { error: 'Select a valid team size' }),
  description: text('Description', 10, 1000),
});

export const jobForm = z.object({
  title: text('Job title', 3, 120),
  company: text('Company name', 2, 120),
  type: z.enum(JOB_TYPES, { error: 'Select a valid job type' }),
  city,
  salary: optionalText(80),
  skills: text('Skills', 1, 300),
  description: text('Description', 20, 4000),
});

export const jobsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  city: z.string().trim().max(60).optional(),
  type: z.string().trim().max(30).optional(),
  q: z.string().trim().max(80).optional(),
});

/** Decodes a base64 image and checks it is a JPEG or PNG of sane size. */
export function assertImage(base64) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new HttpError(400, 'validation_error', 'photo: invalid image data');
  }
  const buf = Buffer.from(base64, 'base64');
  const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.length > 8 && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (!jpeg && !png) {
    throw new HttpError(400, 'validation_error', 'photo: only JPEG or PNG images are allowed');
  }
}
