import { describe, it, expect, afterAll } from 'vitest';
import { bookingApi, hasDataCollectionConsent, searchWindow, OpenSlot } from '@/lib/api/modules/public-booking';
import { contentApi } from '@/lib/api/modules/content-public';
import { loginUser, registerUser, fetchTeachers, fetchPlans } from '@/lib/api/client';
import { ApiClientError } from '@/lib/api/http';
import { Role } from '@/lib/types';
import { actAsAnonymous, uniq } from '../helpers/live';

/** Live public-site flows: catalogue, CMS, FAQ and the full guardian trial booking. */
describe('live API — public site', () => {
  afterAll(() => actAsAnonymous());

  it('serves real open slots in the visitor zone', async () => {
    actAsAnonymous();
    const slots = await bookingApi.openSlots({ ...searchWindow(14), visitorZone: 'Asia/Karachi', durationMinutes: 30, limit: 50 });
    expect(Array.isArray(slots)).toBe(true);
    for (const s of slots) {
      expect(s.visitorZone).toBe('Asia/Karachi');
      expect(new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()).toBe(30 * 60_000);
    }
  });

  it('serves real teachers and per-currency plan prices without fabrication', async () => {
    actAsAnonymous();
    const [teachers, plans] = await Promise.all([fetchTeachers(), fetchPlans()]);
    expect(teachers.every((t) => t.source === 'api')).toBe(true);
    expect(teachers.every((t) => t.audioSampleUrl === undefined && t.experienceYears === undefined)).toBe(true);
    expect(plans.every((p) => p.source === 'api')).toBe(true);
    expect(plans.some((p) => typeof p.pricesMinor.GBP === 'number')).toBe(true);
  });

  it('reads a course with levels and lessons by code', async () => {
    const course = await contentApi.courseDetail('HIFZ');
    expect(course.code).toBe('HIFZ');
    expect(course.levels.length).toBeGreaterThan(0);
    expect(Array.isArray(course.levels[0].lessonTemplates)).toBe(true);
  });

  it('lists published content and reads one by slug', async () => {
    const posts = await contentApi.list({ limit: 10 });
    expect(posts.length).toBeGreaterThan(0);
    const page = await contentApi.bySlug(posts[0].slug);
    expect(page.title).toBe(posts[0].title);
    await expect(contentApi.bySlug(`missing-${uniq()}`)).rejects.toMatchObject({ status: 404 });
  });

  it('accepts a public FAQ question for moderation', async () => {
    const question = `Integration question ${uniq()}?`;
    const created = await contentApi.submitFaq({ question });
    expect(created.question).toBe(question);
    expect(created.approved).toBe(false);
    const approved = await contentApi.faqs();
    expect(approved.some((f) => f.question === question)).toBe(false);
  });

  it('books a trial end-to-end for a new guardian', async () => {
    actAsAnonymous();
    const email = `${uniq('guardian')}@example.com`;
    const password = 'Integration!Pass2026';
    const registered = await registerUser({ email, password, name: 'Integration Guardian', timeZone: 'Europe/London', role: Role.GUARDIAN });
    expect(registered.success).toBe(true);
    const login = await loginUser(email, password);
    expect(login.success).toBe(true);

    expect(await bookingApi.myFamilies()).toEqual([]);
    const family = await bookingApi.createFamily({ name: 'Integration family', country: 'GB', timeZone: 'Europe/London' });
    const child = await bookingApi.addChild(family.id, {
      displayName: 'Test Learner',
      birthYear: new Date().getUTCFullYear() - 8,
      gender: 'FEMALE',
    });
    expect(child.requiresConsent).toBe(true);

    // Booking is refused until DATA_COLLECTION consent exists.
    const catalogue = await contentApi.catalogue();
    const hifz = catalogue.find((c) => c.code === 'HIFZ')!;
    const slots: OpenSlot[] = await bookingApi.openSlots({ ...searchWindow(21), visitorZone: 'Europe/London', durationMinutes: 30, limit: 200 });
    expect(slots.length).toBeGreaterThan(0);

    const attempt = (slot: OpenSlot) =>
      bookingApi.book({
        teacherId: slot.teacherId,
        courseId: hifz.id,
        studentId: child.id,
        startsAt: slot.startsAt,
        durationMinutes: 30,
        roomType: 'ONE_TO_ONE',
        type: 'TRIAL',
      });

    await expect(attempt(slots[0])).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });

    await bookingApi.grantDataCollection(child.id);
    expect(hasDataCollectionConsent(await bookingApi.consent(child.id))).toBe(true);

    // Other suites may book the same slots, so try a few distinct ones.
    const pool = [...slots].sort(() => Math.random() - 0.5).slice(0, 8);
    let booked = null;
    for (const slot of pool) {
      try {
        booked = await attempt(slot);
        expect(booked.startsAt).toBe(new Date(slot.startsAt).toISOString());
        break;
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.status !== 409) throw error;
      }
    }
    expect(booked?.id).toBeTruthy();
    expect(new Date(booked!.endsAt).getTime() - new Date(booked!.startsAt).getTime()).toBe(30 * 60_000);
  });
});
