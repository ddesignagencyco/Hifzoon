'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Circle,
  Clock,
  ListPlus,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CountrySelect,
  Field,
  QueryState,
  Select,
  TextArea,
  TextInput,
  UiButton,
  formatDate,
  formatDateTime,
  humanize,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useCompleteCrmTask, useCrmLead, useUpdateLead } from '@/hooks/useCrm';
import { useCourses } from '@/hooks/useCourses';
import { LeadDetail, LeadStatus, UpdateLeadInput, nextLeadStatuses } from '@/lib/api/modules/crm';
import { cn } from '@/lib/utils';
import { CreateTaskDialog, MoveLeadDialog } from './CrmWorkspace';
import { Initial, STAGE, StageDot, countryName, dueLabel, sourceLabel, taskTitle } from './crm-ui';

/** The path a lead normally takes; LOST can happen from any open stage. */
const JOURNEY: LeadStatus[] = ['NEW', 'TRIAL_BOOKED', 'TRIAL_DONE', 'WON'];

/** `/admin/crm/leads/:id` — one family enquiry, from first contact to enrolment. */
export function LeadDetailView({ leadId }: { leadId: string }) {
  const lead = useCrmLead(leadId);
  return (
    <>
      <Link href="/admin/crm" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> CRM
      </Link>
      <QueryState query={lead} loadingLabel="Loading lead…">
        {(l) => <Detail lead={l} />}
      </QueryState>
    </>
  );
}

function Detail({ lead }: { lead: LeadDetail }) {
  const [moving, setMoving] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const closed = nextLeadStatuses(lead.status).length === 0;

  return (
    <div className="space-y-6">
      <Hero lead={lead} closed={closed} onMove={() => setMoving(true)} onAddTask={() => setAddingTask(true)} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="min-w-0 space-y-6">
          <ContactCard lead={lead} />
          <div className="grid gap-6 md:grid-cols-2">
            <TrialCard lead={lead} />
            <FamilyCard lead={lead} />
          </div>
          <NotesCard lead={lead} />
        </div>
        <div className="space-y-6 lg:sticky lg:top-20">
          <TasksCard lead={lead} closed={closed} onAdd={() => setAddingTask(true)} />
          <TimelineCard lead={lead} />
        </div>
      </div>

      {moving && <MoveLeadDialog lead={lead} onClose={() => setMoving(false)} />}
      {addingTask && <CreateTaskDialog lead={lead} onClose={() => setAddingTask(false)} />}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function Hero({
  lead,
  closed,
  onMove,
  onAddTask,
}: {
  lead: LeadDetail;
  closed: boolean;
  onMove: () => void;
  onAddTask: () => void;
}) {
  const place = [lead.city, lead.region, lead.country ? countryName(lead.country) : null].filter(Boolean).join(', ');
  return (
    <Card className="overflow-hidden">
      <div className={cn('h-1.5', STAGE[lead.status].bar)} aria-hidden />
      <CardBody className="space-y-5 pt-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Initial name={lead.contactName} className="h-14 w-14 text-xl" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Lead</p>
              <h1 className="mt-0.5 truncate font-fraunces text-2xl text-ink sm:text-3xl">{lead.contactName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <span className={cn('rounded-full px-2.5 py-1', STAGE[lead.status].soft)}>
                  <StageDot status={lead.status} />
                </span>
                {lead.source && <Badge tone="neutral">{sourceLabel(lead.source)}</Badge>}
                {place && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden /> {place}
                  </span>
                )}
                <span className="text-muted">· Added {formatDate(lead.createdAt)}</span>
              </div>
            </div>
          </div>
          {!closed && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <UiButton variant="secondary" icon={<ListPlus className="h-4 w-4" aria-hidden />} onClick={onAddTask}>
                Add task
              </UiButton>
              <UiButton icon={<ArrowRight className="h-4 w-4" aria-hidden />} onClick={onMove}>
                Move stage
              </UiButton>
            </div>
          )}
        </div>
        <Journey status={lead.status} lostReason={lead.lostReason} />
      </CardBody>
    </Card>
  );
}

function Journey({ status, lostReason }: { status: LeadStatus; lostReason: string | null }) {
  const reached = status === 'LOST' ? -1 : JOURNEY.indexOf(status);
  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-4 gap-2" aria-label="Lead journey">
        {JOURNEY.map((s, i) => {
          const done = reached >= i;
          return (
            <li key={s} aria-current={status === s ? 'step' : undefined} className="min-w-0">
              <div className={cn('h-1.5 rounded-full', done ? STAGE[s].bar : 'bg-sand')} />
              <p className={cn('mt-1.5 truncate text-[11px] font-semibold', done ? 'text-ink' : 'text-muted')}>{STAGE[s].label}</p>
            </li>
          );
        })}
      </ol>
      {status === 'LOST' && (
        <p className="flex items-start gap-1.5 rounded-xl bg-red/5 px-3 py-2 text-xs text-red">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Closed without enrolling{lostReason ? `: ${lostReason}` : '.'}
          </span>
        </p>
      )}
    </div>
  );
}

// ── Contact and location ─────────────────────────────────────────────────────

type ContactForm = Record<'contactName' | 'email' | 'phone' | 'country' | 'region' | 'city' | 'postcode' | 'courseInterest' | 'childAge', string>;

function toForm(lead: LeadDetail): ContactForm {
  return {
    contactName: lead.contactName,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    country: lead.country ?? '',
    region: lead.region ?? '',
    city: lead.city ?? '',
    postcode: lead.postcode ?? '',
    courseInterest: lead.courseInterest ?? '',
    childAge: lead.childAge ? String(lead.childAge) : '',
  };
}

function ContactCard({ lead }: { lead: LeadDetail }) {
  const toast = useToast();
  const update = useUpdateLead(lead.id);
  const { courses } = useCourses();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContactForm>(() => toForm(lead));
  const set = (k: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const whatsapp = lead.phone ? `https://wa.me/${lead.phone.replace(/[^\d]/g, '')}` : null;

  const save = () => {
    const age = form.childAge.trim() ? Number(form.childAge) : null;
    if (!form.contactName.trim()) return toast.error('A lead needs a name.');
    if (age !== null && (!Number.isInteger(age) || age < 3 || age > 18)) return toast.error('Child’s age is 3 to 18.');
    const blank = (v: string) => (v.trim() ? v.trim() : null);
    const body: UpdateLeadInput = {
      contactName: form.contactName.trim(),
      email: blank(form.email),
      phone: blank(form.phone),
      country: blank(form.country),
      region: blank(form.region),
      city: blank(form.city),
      postcode: blank(form.postcode),
      courseInterest: blank(form.courseInterest),
      childAge: age,
    };
    update.mutate(body, {
      onSuccess: () => {
        toast.success('Lead updated');
        setEditing(false);
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <Card>
      <CardHeader
        title="Contact & location"
        description="How to reach the family, where they are, and what they asked about."
        action={
          !editing && (
            <UiButton
              size="sm"
              variant="secondary"
              icon={<Pencil className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                setForm(toForm(lead));
                setEditing(true);
              }}
            >
              Edit
            </UiButton>
          )
        }
      />
      <CardBody className="space-y-4">
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="lead-name" required>
                <TextInput id="lead-name" value={form.contactName} onChange={set('contactName')} maxLength={160} />
              </Field>
              <Field label="Email" htmlFor="lead-email">
                <TextInput id="lead-email" type="email" value={form.email} onChange={set('email')} maxLength={320} />
              </Field>
              <Field label="Phone or WhatsApp" htmlFor="lead-phone">
                <TextInput id="lead-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={32} />
              </Field>
              <Field label="Country" htmlFor="lead-country">
                <CountrySelect id="lead-country" value={form.country} onChange={(country) => setForm((f) => ({ ...f, country }))} />
              </Field>
              <Field label="Region / state" htmlFor="lead-region">
                <TextInput id="lead-region" value={form.region} onChange={set('region')} maxLength={120} />
              </Field>
              <Field label="City" htmlFor="lead-city">
                <TextInput id="lead-city" value={form.city} onChange={set('city')} maxLength={120} />
              </Field>
              <Field label="Postcode" htmlFor="lead-postcode">
                <TextInput id="lead-postcode" value={form.postcode} onChange={set('postcode')} maxLength={20} />
              </Field>
              <Field label="Course of interest" htmlFor="lead-course">
                <Select
                  id="lead-course"
                  value={form.courseInterest}
                  onChange={(e) => setForm((f) => ({ ...f, courseInterest: e.target.value }))}
                >
                  <option value="">Not decided</option>
                  {courses.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.title}
                    </option>
                  ))}
                  {/* A code no longer offered still shows, rather than silently changing. */}
                  {form.courseInterest && !courses.some((c) => c.code === form.courseInterest) && (
                    <option value={form.courseInterest}>{humanize(form.courseInterest)}</option>
                  )}
                </Select>
              </Field>
              <Field label="Child’s age" htmlFor="lead-age">
                <TextInput id="lead-age" type="number" min={3} max={18} value={form.childAge} onChange={set('childAge')} />
              </Field>
            </div>
            <div className="flex gap-2">
              <UiButton loading={update.isPending} onClick={save}>
                Save changes
              </UiButton>
              <UiButton variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </UiButton>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className={actionLink}>
                  <Phone className="h-3.5 w-3.5" aria-hidden /> Call
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={actionLink}>
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className={actionLink}>
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Email
                </a>
              )}
              {!lead.phone && !lead.email && <p className="text-xs text-muted">No phone or email on record yet.</p>}
            </div>
            <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label="Email" value={lead.email} />
              <Fact label="Phone" value={lead.phone} />
              <Fact label="Country" value={lead.country ? countryName(lead.country) : null} />
              <Fact label="Region / state" value={lead.region} />
              <Fact label="City" value={lead.city} />
              <Fact label="Postcode" value={lead.postcode} />
              <Fact
                label="Course of interest"
                value={lead.courseInterest ? courses.find((c) => c.code === lead.courseInterest)?.title ?? humanize(lead.courseInterest) : null}
              />
              <Fact label="Child’s age" value={lead.childAge ? `${lead.childAge} years` : null} />
              <Fact label="Owner" value={lead.owner?.name ?? 'Unassigned'} />
            </dl>
          </>
        )}
      </CardBody>
    </Card>
  );
}

const actionLink =
  'inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-green-800 hover:border-gold/60 hover:bg-sand/50';

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-sand/60 px-3 py-2">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-sm', value ? 'text-ink' : 'text-muted')}>{value || '—'}</dd>
    </div>
  );
}

// ── Trial and family ─────────────────────────────────────────────────────────

function TrialCard({ lead }: { lead: LeadDetail }) {
  const t = lead.trial;
  return (
    <Card>
      <CardHeader title="Trial class" />
      <CardBody>
        {t ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-green-700" aria-hidden />
              <span className="font-semibold text-ink">{formatDateTime(t.startsAt)}</span>
              <Badge tone={t.status === 'COMPLETED' ? 'green' : t.status === 'CANCELLED' ? 'red' : 'blue'}>{humanize(t.status)}</Badge>
            </div>
            <p className="flex items-center gap-2 text-ink-2">
              <BookOpen className="h-4 w-4 text-muted" aria-hidden /> {t.course.name}
            </p>
            <p className="flex items-center gap-2 text-ink-2">
              <UserRound className="h-4 w-4 text-muted" aria-hidden /> {t.teacher.user.name}
            </p>
            <Link href="/admin/trials" className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline">
              Open Trials & placement <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted">No trial booked yet. It appears here as soon as one is, from the website or by the office.</p>
        )}
      </CardBody>
    </Card>
  );
}

function FamilyCard({ lead }: { lead: LeadDetail }) {
  const f = lead.family;
  const year = new Date().getFullYear();
  return (
    <Card>
      <CardHeader title="Family" />
      <CardBody>
        {f ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Users className="h-4 w-4 text-green-700" aria-hidden /> {f.name}
            </p>
            <p className="text-xs text-ink-2">
              {[f.country ? countryName(f.country) : null, f.timeZone.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
            </p>
            {f.students.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {f.students.map((s) => (
                  <li key={s.id} className="rounded-full bg-sand px-3 py-1 text-xs text-ink">
                    {s.displayName} <span className="text-muted">· {year - s.birthYear}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">No learners added yet.</p>
            )}
            {lead.contactUser && (
              <p className="text-xs text-ink-2">
                Account: <span className="font-semibold text-ink">{lead.contactUser.name}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Not linked to a family account yet. It links itself when they book a trial.</p>
        )}
      </CardBody>
    </Card>
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────

function NotesCard({ lead }: { lead: LeadDetail }) {
  const toast = useToast();
  const update = useUpdateLead(lead.id);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const dirty = notes !== (lead.notes ?? '');
  return (
    <Card>
      <CardHeader title="Notes" description="What the family said, preferences, anything the next person should know." />
      <CardBody className="space-y-3">
        <TextArea aria-label="Notes" rows={5} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">{notes.length}/4000</span>
          <UiButton
            size="sm"
            disabled={!dirty}
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { notes: notes.trim() ? notes : null },
                { onSuccess: () => toast.success('Notes saved'), onError: (err) => toast.error(err) },
              )
            }
          >
            Save notes
          </UiButton>
        </div>
      </CardBody>
    </Card>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────

function TasksCard({ lead, closed, onAdd }: { lead: LeadDetail; closed: boolean; onAdd: () => void }) {
  const toast = useToast();
  const complete = useCompleteCrmTask();
  const [now] = useState(() => Date.now());
  const open = lead.tasks.filter((t) => t.status === 'OPEN');
  const rest = lead.tasks.filter((t) => t.status !== 'OPEN');
  return (
    <Card>
      <CardHeader
        title="Follow-ups"
        description={open.length ? `${open.length} open` : 'Nothing open'}
        action={
          !closed && (
            <UiButton size="sm" variant="secondary" icon={<ListPlus className="h-3.5 w-3.5" aria-hidden />} onClick={onAdd}>
              Add
            </UiButton>
          )
        }
      />
      <CardBody className="space-y-2">
        {lead.tasks.length === 0 && <p className="text-sm text-muted">No follow-ups yet.</p>}
        {open.map((t) => {
          const due = dueLabel(t.dueAt, now);
          return (
            <div key={t.id} className="rounded-xl border border-line p-3">
              <p className="text-sm font-semibold text-ink">{taskTitle(t)}</p>
              <p className={cn('mt-0.5 flex items-center gap-1 text-[11px]', due.overdue ? 'text-red' : due.today ? 'text-amber-700' : 'text-muted')}>
                <Clock className="h-3 w-3" aria-hidden /> {due.text} · {formatDateTime(t.dueAt)}
                {t.assignee ? ` · ${t.assignee.name}` : ''}
              </p>
              <UiButton
                size="sm"
                variant="secondary"
                className="mt-2"
                icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                loading={complete.isPending && complete.variables === t.id}
                onClick={() => complete.mutate(t.id, { onSuccess: () => toast.success('Follow-up done'), onError: (err) => toast.error(err) })}
              >
                Mark done
              </UiButton>
            </div>
          );
        })}
        {rest.length > 0 && (
          <ul className="space-y-1 pt-1">
            {rest.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-xs text-muted">
                {t.status === 'DONE' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span className="line-through decoration-muted/40">{taskTitle(t)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineEntry {
  at: string;
  title: string;
  detail?: string;
  tone: 'green' | 'red' | 'gold' | 'muted';
}

const FIELD_LABEL: Record<string, string> = {
  contactName: 'name',
  courseInterest: 'course',
  childAge: 'child’s age',
  ownerId: 'owner',
  postcode: 'postcode',
};

function timeline(lead: LeadDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { at: lead.createdAt, title: `Lead added${lead.source ? ` from ${sourceLabel(lead.source).toLowerCase()}` : ''}`, tone: 'gold' },
  ];
  for (const h of lead.history) {
    const by = h.actor?.name ? ` by ${h.actor.name}` : '';
    if (h.action.startsWith('crm.lead.status.')) {
      const status = h.action.slice('crm.lead.status.'.length) as LeadStatus;
      const reason = typeof h.after?.lostReason === 'string' ? h.after.lostReason : undefined;
      entries.push({ at: h.at, title: `Moved to ${STAGE[status]?.label ?? humanize(status)}${by}`, detail: reason, tone: status === 'LOST' ? 'red' : 'green' });
    } else if (h.action === 'crm.lead.update') {
      const fields = Object.keys(h.after ?? {}).map((k) => FIELD_LABEL[k] ?? humanize(k).toLowerCase());
      entries.push({ at: h.at, title: `Details edited${by}`, detail: fields.length ? `Changed ${fields.join(', ')}` : undefined, tone: 'muted' });
    }
  }
  if (lead.trial) entries.push({ at: lead.trial.startsAt, title: `Trial class: ${lead.trial.course.name}`, detail: `With ${lead.trial.teacher.user.name}`, tone: 'green' });
  for (const t of lead.tasks) {
    if (t.completedAt) entries.push({ at: t.completedAt, title: `Follow-up done: ${taskTitle(t)}`, tone: 'muted' });
  }
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const DOT: Record<TimelineEntry['tone'], string> = {
  green: 'text-green-600',
  red: 'text-red',
  gold: 'text-gold',
  muted: 'text-muted',
};

function TimelineCard({ lead }: { lead: LeadDetail }) {
  const entries = timeline(lead);
  return (
    <Card>
      <CardHeader title="Timeline" description="Newest first." />
      <CardBody>
        <ol className="relative ml-2 space-y-4 border-l border-line">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="ml-4">
              <span className={cn('absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white', DOT[e.tone])}>
                <Circle className="h-3 w-3 fill-current" aria-hidden />
              </span>
              <p className="text-sm text-ink">{e.title}</p>
              {e.detail && <p className="text-xs text-ink-2">{e.detail}</p>}
              <p className="text-[11px] text-muted">{formatDateTime(e.at)}</p>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
