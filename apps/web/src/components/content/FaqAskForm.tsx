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
    <form onSubmit={onSubmit} className={`rounded-[24px] border border-[#e6dfd1] bg-white p-5 sm:p-6 space-y-3 ${className}`} noValidate>
      <div>
        <label htmlFor="faq-question" className="block font-fraunces text-lg text-[#10201b]">
          Didn&apos;t find your answer?
        </label>
        <p className="text-xs text-[#6b7772] mt-0.5">
          Ask us — our team answers questions and adds the useful ones here. Please don&apos;t include personal details.
        </p>
      </div>
      <textarea
        id="faq-question"
        rows={3}
        maxLength={FAQ_QUESTION_MAX}
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value);
          if (error) setError(null);
        }}
        aria-invalid={!!error}
        aria-describedby={error ? 'faq-question-error' : undefined}
        placeholder="e.g. Can siblings share one class?"
        className={`w-full px-4 py-3 rounded-2xl border ${error ? 'border-red' : 'border-[#e6dfd1]'} bg-[#faf7f1] text-sm text-[#10201b] focus:outline-none focus:ring-2 focus:ring-[#c49a55]`}
      />
      {error && (
        <p id="faq-question-error" className="sr-only">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submit.isPending}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#143a2f] text-white text-sm font-medium hover:bg-[#0f2c24] disabled:opacity-60 cursor-pointer"
      >
        {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
        {submit.isPending ? 'Sending…' : 'Send question'}
      </button>
    </form>
  );
}
