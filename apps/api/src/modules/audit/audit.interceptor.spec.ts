import { of } from 'rxjs';

import { AuditInterceptor } from './audit.interceptor';

function run(params: Record<string, string>) {
  const record = jest.fn(async () => undefined);
  const reflector = {
    get: () => ({ action: 'hir.interview.cancel', targetType: 'interview', captureBody: false }),
  };
  const interceptor = new AuditInterceptor(reflector as never, { record } as never);
  const request = { user: { id: 'u1' }, params, headers: {}, socket: {}, body: {} };
  const context = {
    getHandler: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  interceptor.intercept(context as never, { handle: () => of({ ok: true }) } as never).subscribe();
  return record;
}

describe('AuditInterceptor target id', () => {
  it('uses a kind-named path parameter such as :interviewId', () => {
    const record = run({ interviewId: 'int-1' });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'int-1' }));
  });

  it('prefers :id when the route has one', () => {
    const record = run({ id: 'app-1', documentId: 'doc-1' });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'app-1' }));
  });
});
