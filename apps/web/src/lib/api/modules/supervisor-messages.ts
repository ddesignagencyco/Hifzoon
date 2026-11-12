import { http } from '../http';

export interface SupervisedThread {
  id: string;
  family: { id: string; name: string };
  teacher: { id: string; name: string };
  studentId: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
}

export interface SupervisedThreadPage {
  items: SupervisedThread[];
  total: number;
  page: number;
  limit: number;
}

export interface SupervisedThreadDetail {
  thread: { id: string; family: { id: string; name: string }; teacher: { id: string; name: string }; studentId: string | null };
  readOnly: true;
  messages: Array<{ id: string; body: string; sentAt: string; from: 'TEACHER' | 'GUARDIAN'; senderName: string }>;
}

const enc = encodeURIComponent;

export const supervisorMessagesApi = {
  threads: (q: { teacherId?: string; q?: string; page?: number; limit?: number }) =>
    http.get<SupervisedThreadPage>('/supervision/messages/threads', { query: q }),
  /** Opening a thread is audited (`par.messages.supervisorView`); it never marks anything read. */
  thread: (id: string) => http.get<SupervisedThreadDetail>(`/supervision/messages/threads/${enc(id)}`),
};
