import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFaqs, submitTeacherApplication } from '@/lib/api/client';
import { KNOWLEDGE_BASE_FAQS } from '@/lib/data/baseline-catalog';

describe('API Client Layer Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch knowledge base FAQs from server if endpoint succeeds', async () => {
    const curatedFaqPayload = {
      data: [
        {
          id: 'faq-01',
          question: 'What is the lesson duration?',
          answer: 'Each private class is 30 or 45 minutes.',
          approved: true,
          sort: 1,
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => curatedFaqPayload,
    } as Response);

    const faqs = await fetchFaqs();

    expect(faqs).toHaveLength(1);
    expect(faqs[0].q).toBe('What is the lesson duration?');
  });

  it('should fall back to KNOWLEDGE_BASE_FAQS when server fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('500 Internal Server Error'));

    const faqs = await fetchFaqs();

    expect(faqs).toHaveLength(KNOWLEDGE_BASE_FAQS.length);
    expect(faqs[0].q).toBeTruthy();
  });

  it('should submit teacher application with valid payload', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ data: { applicationId: 'app-999' } }),
    } as Response);

    const result = await submitTeacherApplication({
      applicantName: 'Ustadh Omar',
      email: 'omar@example.com',
      country: 'EG',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('received');
  });

  it('reports a failed teacher application instead of masking it as success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ statusCode: 409, code: 'CONFLICT', message: 'Application already exists' }),
    } as Response);

    const result = await submitTeacherApplication({
      applicantName: 'Ustadh Omar',
      email: 'omar@example.com',
      country: 'EG',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('already in review');
  });

  it('reports validation failures with the server message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ statusCode: 400, code: 'VALIDATION_FAILED', message: 'Request validation failed' }),
    } as Response);

    const result = await submitTeacherApplication({ applicantName: 'X', email: 'bad' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Request validation failed');
  });
});
