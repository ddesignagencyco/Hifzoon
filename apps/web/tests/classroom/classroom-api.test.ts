import { describe, it, expect } from 'vitest';
import {
  classroomApi,
  classroomSocketUrl,
  isFakeVideoUrl,
  joinWindow,
  participantRoleLabel,
  roomIdFromUrl,
  validateBandwidthQuery,
} from '@/lib/api/modules/classroom';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const CID = 'class-1';
const snapshot = {
  classId: CID,
  status: 'LIVE',
  startsAt: '2026-10-15T13:00:00.000Z',
  endsAt: '2026-10-15T13:30:00.000Z',
  layout: 'MADANI_15',
  tajweedColours: false,
  page: 3,
  highlight: { surah: 2, ayah: 5, wordIndex: 1 },
  participants: [],
  serverTime: '2026-10-15T13:05:00.000Z',
};

describe('classroom API module', () => {
  it('requests a room token with an empty body', async () => {
    const api = mockApi({
      [`POST /classroom/classes/${CID}/token`]: {
        status: 201,
        body: envelope({ sub: 'u1', cid: CID, role: 'TEACHER', studentId: null, token: 'abc.sig', url: 'fake://room/r1', expiresAt: '2026-10-15T13:20:00Z' }),
      },
    });
    const token = await classroomApi.token(CID);
    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].body).toEqual({});
    expect(token.role).toBe('TEACHER');
    expect(token.url).toBe('fake://room/r1');
  });

  it('surfaces the FR-CLS-01 window refusal', async () => {
    mockApi({
      [`POST /classroom/classes/${CID}/token`]: apiError(400, 'VALIDATION_FAILED', 'FR-CLS-01: the room opens 10 minutes before the class starts'),
    });
    await expect(classroomApi.token(CID)).rejects.toMatchObject({ status: 400, message: expect.stringContaining('FR-CLS-01') });
  });

  it('reads the state snapshot', async () => {
    mockApi({ [`GET /classroom/classes/${CID}/state`]: { body: envelope(snapshot) } });
    const s = await classroomApi.state(CID);
    expect(s.page).toBe(3);
    expect(s.highlight).toEqual({ surah: 2, ayah: 5, wordIndex: 1 });
  });

  it('reads attendance and closes it', async () => {
    const api = mockApi({
      [`GET /classroom/classes/${CID}/attendance`]: {
        body: envelope({ classId: CID, participants: [], summary: { studentsPresent: 0, averageMinutes: 0, guardiansPresent: 0, stillConnected: 0 } }),
      },
      [`POST /classroom/classes/${CID}/attendance/close`]: { body: envelope({ closed: 2 }) },
    });
    const a = await classroomApi.attendance(CID);
    expect(a.summary.studentsPresent).toBe(0);
    const closed = await classroomApi.closeAttendance(CID);
    expect(closed.closed).toBe(2);
    expect(api.calls[1].method).toBe('POST');
  });

  it('posts teacher controls with the DTO shapes', async () => {
    const api = mockApi({
      [`POST /classroom/classes/${CID}/page`]: (c) => ({ body: envelope({ ...(c.body as object), layout: 'MADANI_15' }) }),
      [`POST /classroom/classes/${CID}/highlight`]: (c) => ({ body: envelope(c.body) }),
      [`POST /classroom/classes/${CID}/layout`]: (c) => ({ body: envelope(c.body) }),
      [`POST /classroom/classes/${CID}/tajweed`]: (c) => ({ body: envelope({ tajweedColours: (c.body as { enabled: boolean }).enabled }) }),
    });
    expect(await classroomApi.setPage(CID, 12)).toEqual({ page: 12, layout: 'MADANI_15' });
    expect(await classroomApi.setHighlight(CID, { surah: 1, ayah: 2, wordIndex: 0 })).toEqual({ surah: 1, ayah: 2, wordIndex: 0 });
    expect(await classroomApi.setLayout(CID, 'INDOPAK_13')).toEqual({ layout: 'INDOPAK_13' });
    expect(await classroomApi.setTajweed(CID, true)).toEqual({ tajweedColours: true });
    expect(api.calls.map((c) => c.body)).toEqual([
      { page: 12 },
      { surah: 1, ayah: 2, wordIndex: 0 },
      { layout: 'INDOPAK_13' },
      { enabled: true },
    ]);
  });

  it('reads recording consent and starts recording', async () => {
    const api = mockApi({
      [`GET /classroom/classes/${CID}/recording/consent`]: {
        body: envelope({ allowed: true, students: [{ studentId: 's1', displayName: 'Amina', consented: true }], missing: [] }),
      },
      [`POST /classroom/classes/${CID}/recording/start`]: { status: 201, body: envelope({ started: true, egressId: 'e1', deleteAfter: '2027-01-13T00:00:00Z' }) },
    });
    const consent = await classroomApi.recordingConsent(CID);
    expect(consent.allowed).toBe(true);
    const started = await classroomApi.startRecording(CID);
    expect(started.started).toBe(true);
    expect(api.calls[1].body).toEqual({});
  });

  it('passes CONSENT_REQUIRED details through on a refused recording', async () => {
    mockApi({
      [`POST /classroom/classes/${CID}/recording/start`]: apiError(403, 'CONSENT_REQUIRED', 'FR-CLS-12: consent required', { missing: ['Yusuf'] }),
    });
    await expect(classroomApi.startRecording(CID)).rejects.toMatchObject({ status: 403, code: 'CONSENT_REQUIRED', details: { missing: ['Yusuf'] } });
  });

  it('builds the bandwidth advice query with integers', async () => {
    const api = mockApi({
      'GET /classroom/bandwidth-advice': { body: envelope({ tier: 'AUDIO_ONLY', publishVideo: false, publishAudio: true, requestResolution: '0', reason: 'x' }) },
    });
    const advice = await classroomApi.bandwidthAdvice({ rttMs: 1200.4, downlinkKbps: 80, packetLossPercent: 20 });
    expect(api.calls[0].url).toContain('/classroom/bandwidth-advice?rttMs=1200&downlinkKbps=80&packetLossPercent=20');
    expect(advice.publishVideo).toBe(false);
  });
});

describe('classroom helpers', () => {
  const startsAt = '2026-10-15T13:00:00.000Z';
  const endsAt = '2026-10-15T13:30:00.000Z';
  it('mirrors the 10-minute join window', () => {
    expect(joinWindow(startsAt, endsAt, Date.parse('2026-10-15T12:49:00Z'))).toBe('early');
    expect(joinWindow(startsAt, endsAt, Date.parse('2026-10-15T12:51:00Z'))).toBe('open');
    expect(joinWindow(startsAt, endsAt, Date.parse('2026-10-15T13:39:00Z'))).toBe('open');
    expect(joinWindow(startsAt, endsAt, Date.parse('2026-10-15T13:41:00Z'))).toBe('closed');
  });

  it('recognises the fake video provider and the room id', () => {
    expect(isFakeVideoUrl('fake://room/fake-room-1')).toBe(true);
    expect(isFakeVideoUrl('wss://video.example.com')).toBe(false);
    expect(roomIdFromUrl('fake://room/fake-room-1')).toBe('fake-room-1');
  });

  it('validates BandwidthQueryDto bounds', () => {
    expect(validateBandwidthQuery({ rttMs: 100, downlinkKbps: 1000 })).toBeNull();
    expect(validateBandwidthQuery({ rttMs: 20000, downlinkKbps: 1000 })).toMatch(/Round-trip/);
    expect(validateBandwidthQuery({ rttMs: 1, downlinkKbps: -1 })).toMatch(/Downlink/);
    expect(validateBandwidthQuery({ rttMs: 1, downlinkKbps: 1, packetLossPercent: 101 })).toMatch(/Packet loss/);
  });

  it('derives the socket namespace URL from the API base and labels roles', () => {
    expect(classroomSocketUrl('http://localhost:4000/api/v1')).toBe('http://localhost:4000/classroom');
    expect(classroomSocketUrl('not a url')).toBe('http://localhost:4000/classroom');
    expect(participantRoleLabel('GUARDIAN_VIEWER')).toBe('Guardian (watching)');
  });
});
