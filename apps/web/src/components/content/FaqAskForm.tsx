'use client';

import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useSubmitFaq } from '@/hooks/useContent';
import { useToast } from '@/components/ui/toast';
import { FAQ_QUESTION_MAX, validateFaqQuestion } from '@/lib/api/modules/content-public';

/**
 * "Ask a question" → `POST /faq`. Submissions are stored unapproved and only appear
 * publicly once a moderator answers and approves them.
 */
export function FaqAskForm({ className = '' }: { className?: string }) {
  const submit = useSubmitFaq();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateFaqQuestion(question);
    setError(problem);
    if (problem) {
      toast.error(problem);
      return;
    }
    submit.mutate(
      { question },
      {
        onSuccess: () => {
          setQuestion('');
          toast.success('Thank you — your question was sent to our team for review.');
        },
        onError: (err) => toast.error(err),
      },
    );
  };

  return (
    <div className={`rounded-[28px] border border-[#e6dfd1] bg-white p-6 sm:p-8 lg:p-10 shadow-card ${className}`}>
      <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" noValidate>
        <div className="lg:col-span-5 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f6ecd9] text-[#a97f3c] text-[11px] font-bold uppercase tracking-wider">
            Academic Helpdesk
          </div>
          <label htmlFor="faq-question" className="block font-fraunces text-2xl sm:text-3xl text-[#10201b] leading-tight">
            Didn&apos;t find your answer?
          </label>
          <p className="text-sm text-[#6b7772] leading-relaxed">
            Ask us — our academic team answers questions directly and publishes the most helpful ones here. Please don&apos;t include sensitive personal details.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row lg:flex-col gap-2 text-xs text-[#3c4a45]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#143a2f]" aria-hidden />
              <span>Direct academic team response</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#143a2f]" aria-hidden />
              <span>Zero promotional calls or spam</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-3">
          <div className="relative">
            <textarea
              id="faq-question"
              rows={4}
              maxLength={FAQ_QUESTION_MAX}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'faq-question-error' : undefined}
              placeholder="e.g. Can siblings share one class? What happens if our teacher is unwell?"
              className={`w-full px-4 py-3.5 rounded-2xl border ${error ? 'border-red ring-1 ring-red/30' : 'border-[#e6dfd1]'} bg-[#faf7f1] text-sm text-[#10201b] placeholder:text-[#8a9691] focus:outline-none focus:ring-2 focus:ring-[#c49a55] focus:bg-white transition-all`}
            />
            <div className="absolute right-3.5 bottom-3.5 text-[11px] text-[#8a9691] pointer-events-none select-none">
              {question.length}/{FAQ_QUESTION_MAX}
            </div>
          </div>

          {error && (
            <p id="faq-question-error" className="text-xs text-red font-medium">
              {error}
            </p>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-[#6b7772]">
              Submissions undergo academic review prior to publication.
            </p>
            <button
              type="submit"
              disabled={submit.isPending}
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-[#143a2f] text-white text-sm font-semibold hover:bg-[#0f2c24] active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer shadow-xs shrink-0"
            >
              {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
              {submit.isPending ? 'Sending…' : 'Send question'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
