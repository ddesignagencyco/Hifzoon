'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Badge, Card, CardBody, CardHeader, Checkbox, EmptyState, Field, Modal, PageHeader, QueryState, TextInput, UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useRubrics, useSaveRubric } from '@/hooks/useQa';
import { useAdminRoles } from '@/components/admin/system/shared';
import { Rubric, RubricCriterion, validateRubric } from '@/lib/api/modules/qa';

/** Super-admin rubric editor. A rubric any review used is read-only: make a new version and activate it. */
export function RubricManager() {
  const { isSuperAdmin } = useAdminRoles();
  const query = useRubrics();
  const save = useSaveRubric();
  const toast = useToast();
  const [editing, setEditing] = useState<Rubric | 'new' | null>(null);

  if (!isSuperAdmin) return <Card><EmptyState title="Super admin only" /></Card>;
  return (
    <>
      <PageHeader eyebrow="Quality" title="Review rubric" description="The active rubric decides the criteria on every new class review."
        actions={<UiButton icon={<Plus className="w-4 h-4" aria-hidden />} onClick={() => setEditing('new')}>New rubric</UiButton>} />
      <QueryState query={query} empty={<EmptyState title="No rubrics yet" />}>
        {(rows) => (
          <div className="space-y-4">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardHeader title={<span>{r.name} {r.active && <Badge tone="green">Active</Badge>}</span>} description={`${r.criteria.length} criteria · used by ${r.reviewCount} review${r.reviewCount === 1 ? '' : 's'}`}
                  action={<div className="flex gap-2">
                    {!r.active && <UiButton size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate({ kind: 'activate', id: r.id }, { onSuccess: () => toast.success(`${r.name} is now active`), onError: (e) => toast.error(e) })}>Activate</UiButton>}
                    <UiButton size="sm" variant="secondary" onClick={() => setEditing(r)}>{r.editable ? 'Edit' : 'New version'}</UiButton>
                  </div>} />
                <CardBody>
                  <ul className="text-sm text-ink-2 space-y-1">
                    {r.criteria.map((c) => <li key={c.key}>{c.label} <span className="text-xs text-muted">· {c.key} · weight {c.weight}</span></li>)}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      {editing && <RubricModal rubric={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RubricModal({ rubric, onClose }: { rubric: Rubric | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveRubric();
  // A used rubric cannot change in place (409): editing it creates the next version instead.
  const inPlace = rubric?.editable === true;
  const [name, setName] = useState(rubric ? (inPlace ? rubric.name : `${rubric.name} (v2)`) : '');
  const [criteria, setCriteria] = useState<RubricCriterion[]>(rubric?.criteria ?? [{ key: '', label: '', weight: 1 }]);
  const [activate, setActivate] = useState(false);
  const setC = (i: number, p: Partial<RubricCriterion>) => setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateRubric(name, criteria);
    if (err) return toast.error(err);
    const body = { name: name.trim(), criteria };
    const opts = { onSuccess: () => { toast.success('Rubric saved'); onClose(); }, onError: (x: unknown) => toast.error(x) };
    if (inPlace && rubric) save.mutate({ kind: 'update', id: rubric.id, body }, opts);
    else save.mutate({ kind: 'create', body: { ...body, activate } }, opts);
  };

  return (
    <Modal open onClose={() => (save.isPending ? undefined : onClose())} title={rubric ? (inPlace ? 'Edit rubric' : 'New rubric version') : 'New rubric'} size="lg">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Rubric">
        {rubric && !inPlace && <Alert tone="neutral">Past reviews used this rubric, so it stays as it was. This saves a new rubric you can activate.</Alert>}
        <Field label="Name" htmlFor="rb-name" required><TextInput id="rb-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-2">Criteria (key: lowercase letters, digits, _ · weight 1–5)</p>
          {criteria.map((c, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr_70px_auto] gap-2 items-center">
              <TextInput aria-label={`Key ${i + 1}`} placeholder="key" value={c.key} maxLength={31} onChange={(e) => setC(i, { key: e.target.value })} />
              <TextInput aria-label={`Label ${i + 1}`} placeholder="What is observed" value={c.label} maxLength={120} onChange={(e) => setC(i, { label: e.target.value })} />
              <TextInput aria-label={`Weight ${i + 1}`} type="number" min={1} max={5} value={c.weight} onChange={(e) => setC(i, { weight: Number(e.target.value) })} />
              <UiButton size="sm" variant="secondary" aria-label={`Remove criterion ${i + 1}`} disabled={criteria.length === 1} onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))} icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />} />
            </div>
          ))}
          <UiButton size="sm" variant="secondary" disabled={criteria.length >= 20} onClick={() => setCriteria((cs) => [...cs, { key: '', label: '', weight: 1 }])} icon={<Plus className="w-3.5 h-3.5" aria-hidden />}>Add criterion</UiButton>
        </div>
        {!inPlace && <Checkbox id="rb-activate" label="Make this the active rubric" checked={activate} onChange={setActivate} />}
        <div className="flex justify-end gap-2 pt-1">
          <UiButton variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</UiButton>
          <UiButton type="submit" loading={save.isPending}>Save rubric</UiButton>
        </div>
      </form>
    </Modal>
  );
}
