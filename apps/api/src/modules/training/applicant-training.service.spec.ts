import { ApplicantTrainingService } from './applicant-training.service';
import { COURSE_MODULES, QUESTION_BANK, QUIZ_RULES } from './applicant-course';

const allRead = Object.fromEntries(COURSE_MODULES.map((m) => [m.id, '2026-11-02T10:00:00.000Z']));

function build(training: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    id: 't1',
    status: 'IN_PROGRESS',
    courseVersion: 'v',
    tokenExpiresAt: new Date(Date.now() + 86_400_000),
    acknowledgements: allRead,
    termsAcceptedAt: new Date(),
    application: { applicantName: 'A', status: 'TRAINING' },
    attempts: [],
    ...training,
  };
  const attempts: Array<Record<string, unknown>> = [];
  const prisma = {
    applicantTraining: {
      findUnique: jest.fn(async () => state),
      findUniqueOrThrow: jest.fn(async () => ({
        applicationId: 'a1',
        bestScore: null,
        application: { applicantName: 'A' },
        attempts: attempts.filter((a) => a.submittedAt),
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(state, data),
      ),
    },
    applicantTrainingAttempt: {
      findMany: jest.fn(async () => attempts.filter((a) => a.submittedAt)),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `att${attempts.length + 1}`,
          startedAt: new Date(),
          submittedAt: null,
          ...data,
        };
        attempts.push(row);
        return row;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) =>
        attempts.find((a) => a.id === where.id),
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
          Object.assign(
            attempts.find((a) => a.id === where.id)!,
            data,
          ),
      ),
    },
    teacherApplication: {
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({ userId: null })),
    },
    teacherProfile: { updateMany: jest.fn(async () => ({ count: 0 })) },
    user: { findMany: jest.fn(async () => [{ id: 'staff1' }]) },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const crypto = { hashToken: (t: string) => `h:${t}`, issueOpaqueToken: () => 'tok' };
  const config = { value: { APP_WEB_URL: 'http://localhost:3000' } };
  const notifications = { emailAddress: jest.fn(), enqueue: jest.fn() };
  const service = new ApplicantTrainingService(
    prisma as never,
    crypto as never,
    config as never,
    notifications as never,
  );
  return { service, prisma, state, attempts, notifications };
}

const TOKEN = 'x'.repeat(40);
const key = (ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, QUESTION_BANK.find((q) => q.id === id)!.correct]));

describe('ApplicantTrainingService', () => {
  it('serves a quiz without the answer key, drawn from the bank', async () => {
    const { service } = build();
    const quiz = await service.startQuiz(TOKEN);
    expect(quiz.questions).toHaveLength(QUIZ_RULES.QUESTIONS_PER_ATTEMPT);
    expect(JSON.stringify(quiz)).not.toContain('"correct"');
  });

  it('refuses the quiz until every module is confirmed and the terms accepted', async () => {
    await expect(build({ acknowledgements: {} }).service.startQuiz(TOKEN)).rejects.toThrow(
      /every module/,
    );
    await expect(build({ termsAcceptedAt: null }).service.startQuiz(TOKEN)).rejects.toThrow(
      /terms/,
    );
  });

  it('passes on 80% and fills the application training dates', async () => {
    const { service, prisma, state, notifications } = build();
    const quiz = await service.startQuiz(TOKEN);
    state.attempts = [{ id: quiz.attemptId, submittedAt: null }];
    const answers = key(quiz.questions.map((q) => q.id));
    const wrong = quiz.questions[0].id;
    answers[wrong] = 'zz';
    const result = await service.submitQuiz(TOKEN, quiz.attemptId, answers);
    expect(result).toMatchObject({ passed: true, score: 9, percent: 90 });
    expect(state.status).toBe('PASSED');
    expect(prisma.teacherApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ safeguardingTrainingAt: expect.any(Date) }),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalled();
  });

  it('fails below the pass mark, then makes the applicant wait before another attempt', async () => {
    const { service, state } = build();
    const quiz = await service.startQuiz(TOKEN);
    state.attempts = [{ id: quiz.attemptId, submittedAt: null }];
    const result = await service.submitQuiz(TOKEN, quiz.attemptId, {});
    expect(result).toMatchObject({
      passed: false,
      score: 0,
      attemptsLeft: QUIZ_RULES.MAX_ATTEMPTS - 1,
    });
    expect(result.nextAttemptAt).toBeInstanceOf(Date);
    state.attempts = [];
    await expect(service.startQuiz(TOKEN)).rejects.toThrow(/waiting period/);
  });

  it('locks after the last failed attempt', async () => {
    const { service, state, attempts } = build();
    for (let i = 0; i < QUIZ_RULES.MAX_ATTEMPTS - 1; i += 1) {
      attempts.push({
        id: `old${i}`,
        submittedAt: new Date(Date.now() - 3 * 86_400_000),
        passed: false,
        questions: [],
        total: 10,
      });
    }
    const quiz = await service.startQuiz(TOKEN);
    state.attempts = [{ id: quiz.attemptId, submittedAt: null }];
    const result = await service.submitQuiz(TOKEN, quiz.attemptId, {});
    expect(result.passed).toBe(false);
    expect(state.status).toBe('LOCKED');
  });

  it('treats an unknown or expired token as not found', async () => {
    await expect(
      build({ tokenExpiresAt: new Date(Date.now() - 1000) }).service.session(TOKEN),
    ).rejects.toThrow();
    await expect(build().service.session('short')).rejects.toThrow();
  });
});
