'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Plus, Minus } from 'lucide-react';
import { FAQS_DATA } from '@/lib/data/mock-data';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { Button } from '@/components/landing/Button';

export const FAQSection: React.FC = () => {
  // All FAQ items closed by default
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="bg-[#faf7f1] py-20 md:py-32">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-12 lg:gap-16 items-start">
          {/* Left Column: Heading + Admissions Card */}
          <div className="space-y-6">
            <div>
              <div className="mb-3">
                <Eyebrow>Frequently Asked</Eyebrow>
              </div>
              <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-[#10201b] break-normal">
                Answers for prospective families
              </h2>
            </div>

            {/* White Contact Card (Desktop: below heading, Mobile: moves below accordion via flex/order) */}
            <div className="hidden lg:block bg-white rounded-[24px] p-6 md:p-7 border border-[#e6dfd1] shadow-card">
              <h3 className="font-semibold text-base text-[#10201b] mb-2">
                A question about your family’s schedule?
              </h3>
              <p className="text-xs text-[#6b7772] leading-relaxed mb-5">
                Book a 30-minute evaluation or talk to our admissions desk.
              </p>
              <Button
                variant="green"
                size="sm"
                href="/book-trial"
                className="w-full text-xs font-semibold"
              >
                Talk to admissions
              </Button>
            </div>
          </div>

          {/* Right Column: Accordion */}
          <div className="border-t border-[#e6dfd1]">
            {FAQS_DATA.map((faq, idx) => {
              const isOpen = openIndex === idx;

              return (
                <div
                  key={idx}
                  className="border-b border-[#e6dfd1] py-5 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(idx)}
                    aria-expanded={isOpen}
                    className="w-full text-left flex items-center justify-between gap-4 group cursor-pointer focus:outline-none"
                  >
                    <span className="font-fraunces text-[18px] md:text-[21px] font-normal text-[#10201b] group-hover:text-[#143a2f] transition-colors">
                      {faq.q}
                    </span>

                    {/* Round + / - indicator that turns green-800 when open */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isOpen
                          ? 'bg-[#143a2f] text-white'
                          : 'bg-[#f3eee4] text-[#6b7772] group-hover:bg-[#e6dfd1]'
                      }`}
                    >
                      {isOpen ? (
                        <Minus className="w-4 h-4 stroke-[2.5]" />
                      ) : (
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="pt-3.5 pr-10 text-[15px] md:text-[15.5px] text-[#3c4a45] leading-relaxed animate-in fade-in duration-200">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile Contact Card */}
          <div className="block lg:hidden bg-white rounded-[24px] p-6 border border-[#e6dfd1] shadow-card">
            <h3 className="font-semibold text-base text-[#10201b] mb-2">
              A question about your family’s schedule?
            </h3>
            <p className="text-xs text-[#6b7772] leading-relaxed mb-5">
              Book a 30-minute evaluation or talk to our admissions desk.
            </p>
            <Button
              variant="green"
              size="sm"
              href="/book-trial"
              className="w-full text-xs font-semibold"
            >
              Talk to admissions
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
