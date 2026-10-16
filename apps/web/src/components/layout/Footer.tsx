import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Award, BookOpen } from 'lucide-react';
import { Logo } from '@/components/landing/Logo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#0a1f19] text-[#c4d3cd] pt-16 pb-12 border-t border-white/10">
      <div className="site-container">
        {/* Trust Row with 3 Items */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-12 mb-12 border-b border-white/10">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-[#c49a55] shrink-0 border border-white/10">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-white text-[14.5px]">
                COPPA &amp; UK Children&apos;s Code
              </h4>
              <p className="text-xs text-[#c4d3cd]/80 mt-1 leading-relaxed">
                Contact details masked. Verified parental consent for students under 13.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-[#c49a55] shrink-0 border border-white/10">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-white text-[14.5px]">
                Audited Azhari &amp; Madani faculty
              </h4>
              <p className="text-xs text-[#c4d3cd]/80 mt-1 leading-relaxed">
                Continuous Sanad and Ijazah in Hafs &apos;an &apos;Asim, verified.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-[#c49a55] shrink-0 border border-white/10">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-white text-[14.5px]">
                Authorized Quranic typography
              </h4>
              <p className="text-xs text-[#c4d3cd]/80 mt-1 leading-relaxed">
                Licensed Madani and IndoPak Mushaf fonts. Never generated or altered by AI.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-14">
          {/* Column 1: About (Spans 2 columns on lg) */}
          <div className="lg:col-span-2 space-y-4">
            <Logo dark={true} />
            <p className="text-xs md:text-sm text-[#c4d3cd]/80 leading-relaxed max-w-sm mt-3">
              Structured, private one-to-one Quranic education rooted in traditional scholarship, for Muslim families worldwide.
            </p>
            <div className="text-xs text-[#c49a55] font-medium pt-1">
              Global timezones supported · UTC−8 to UTC+10
            </div>
          </div>

          {/* Column 2: COURSES */}
          <div>
            <h4 className="text-[11px] font-bold text-[#c49a55] uppercase tracking-[0.16em] mb-4">
              COURSES
            </h4>
            <ul className="space-y-2.5 text-xs text-[#c4d3cd]">
              <li>
                <Link href="/courses/QAIDA" className="hover:text-white transition-colors">
                  Noorani &amp; Madani Qaida
                </Link>
              </li>
              <li>
                <Link href="/courses/NAZRA" className="hover:text-white transition-colors">
                  Nazra Quran
                </Link>
              </li>
              <li>
                <Link href="/courses/TAJWEED" className="hover:text-white transition-colors">
                  Applied Tajweed
                </Link>
              </li>
              <li>
                <Link href="/courses/HIFZ" className="hover:text-white transition-colors">
                  Comprehensive Hifz
                </Link>
              </li>
              <li>
                <Link href="/courses/MURAJAAH" className="hover:text-white transition-colors">
                  Muraja&apos;ah for Huffaz
                </Link>
              </li>
              <li>
                <Link href="/courses/IJAZAH" className="hover:text-white transition-colors">
                  Ijazah with Sanad
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: INSTITUTION */}
          <div>
            <h4 className="text-[11px] font-bold text-[#c49a55] uppercase tracking-[0.16em] mb-4">
              INSTITUTION
            </h4>
            <ul className="space-y-2.5 text-xs text-[#c4d3cd]">
              <li>
                <Link href="/teachers" className="hover:text-white transition-colors">
                  Faculty directory
                </Link>
              </li>
              <li>
                <Link href="/resources" className="hover:text-white transition-colors">
                  Resources &amp; FAQ
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  Tuition &amp; plans
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">
                  Parent portal
                </Link>
              </li>
              <li>
                <Link href="/apply-teacher" className="hover:text-white transition-colors">
                  Apply as a Teacher
                </Link>
              </li>
              <li>
                <Link href="/book-trial" className="hover:text-white transition-colors">
                  Schedule evaluation
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Portal login
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: SAFEGUARDING */}
          <div>
            <h4 className="text-[11px] font-bold text-[#c49a55] uppercase tracking-[0.16em] mb-4">
              SAFEGUARDING
            </h4>
            <ul className="space-y-2.5 text-xs text-[#c4d3cd]">
              <li>
                <Link href="/child-safety" className="hover:text-white transition-colors">
                  Child safeguarding code
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy policy (COPPA/GDPR)
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link href="/refunds" className="hover:text-white transition-colors">
                  Refund &amp; reschedule terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with © and WCAG 2.2 AA */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-[#6b7772] gap-4">
          <p>© 2026 Hifzoon Academy. All rights reserved.</p>
          <div className="text-xs text-[#c4d3cd]/60">
            WCAG 2.2 AA · Traditional Sanad &amp; pedagogical care
          </div>
        </div>
      </div>
    </footer>
  );
};
