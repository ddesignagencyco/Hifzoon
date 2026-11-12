'use client';

import React, { useRef } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useLessonFiles } from '@/hooks/useCourseExtras';
import { coursesExtrasApi, LESSON_FILE_ACCEPT, LessonFile, MAX_LESSON_FILES, validateLessonFile } from '@/lib/api/modules/courses-extras';

/** Attachments on a lesson (PDF, image, audio). Teachers get a fresh link each time they open the lesson. */
export function LessonFiles({ lessonId, files }: { lessonId: string; files: LessonFile[] }) {
  const toast = useToast();
  const { upload, remove } = useLessonFiles(lessonId);
  const input = useRef<HTMLInputElement>(null);

  const open = async (f: LessonFile) => {
    try {
      const { url } = await coursesExtrasApi.materialUrl(lessonId, f.id);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast.error(e);
    }
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateLessonFile(file);
    if (problem) return toast.error(problem);
    upload.mutate(file, { onSuccess: () => toast.success(`${file.name} added`), onError: (err) => toast.error(err) });
  };

  return (
    <section className="space-y-2" aria-labelledby={`files-${lessonId}`}>
      <div className="flex items-center justify-between">
        <h3 id={`files-${lessonId}`} className="text-xs font-semibold text-ink-2">Lesson files ({files.length}/{MAX_LESSON_FILES})</h3>
        <UiButton size="sm" variant="secondary" icon={<Upload className="w-3.5 h-3.5" aria-hidden />} loading={upload.isPending} disabled={files.length >= MAX_LESSON_FILES} onClick={() => input.current?.click()}>
          Add file
        </UiButton>
        <input ref={input} type="file" hidden accept={LESSON_FILE_ACCEPT} onChange={pick} aria-label="Choose a lesson file" />
      </div>
      <p className="text-[11px] text-muted">PDF up to 20 MB, JPEG/PNG up to 10 MB, MP3/M4A/WAV up to 25 MB.</p>
      {files.length === 0 ? (
        <p className="text-xs text-muted">No files yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <button type="button" className="flex min-w-0 items-center gap-2 text-left text-green-800 hover:underline cursor-pointer" onClick={() => open(f)}>
                <FileText className="w-4 h-4 shrink-0" aria-hidden /> <span className="truncate">{f.name}</span>
                <span className="text-[11px] text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              </button>
              <UiButton size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" aria-hidden />} disabled={remove.isPending} aria-label={`Remove ${f.name}`}
                onClick={() => remove.mutate(f.id, { onSuccess: () => toast.success('File removed'), onError: (err) => toast.error(err) })}>Remove</UiButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
