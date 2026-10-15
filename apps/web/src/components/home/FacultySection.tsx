'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTeachers } from '@/hooks';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { PillTabs } from '@/components/landing/PillTabs';
import { TeacherCard } from './TeacherCard';

const TABS = [
  { id: 'ALL', label: 'All teachers' },
  { id: 'MALE', label: 'Ustadh' },
  { id: 'FEMALE', label: 'Ustadha' },
];

/** Home-page teacher preview: the first four real, bookable teachers. */
export const FacultySection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  const { teachers } = useTeachers(activeTab);

  return (
    <section id="faculty" className="bg-white py-20 md:py-32">
      <div className="site-container">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <div className="mb-3">
              <Eyebrow>Our teachers</Eyebrow>
            </div>
            <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-[#10201b] break-normal">
              Vetted scholars, patient educators
            </h2>
            <p className="mt-3 text-[16px] md:text-[18.5px] text-[#3c4a45] leading-relaxed">
              Every teacher completes our hiring pipeline and safeguarding training before being offered to a family.
            </p>
          </div>
          <div className="shrink-0">
            <PillTabs items={TABS} activeId={activeTab} onChange={(id) => setActiveTab(id as 'ALL' | 'MALE' | 'FEMALE')} />
          </div>
        </div>

        {teachers.length === 0 ? (
          <p className="text-sm text-[#6b7772] text-center py-8">No teachers to show for this filter yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {teachers.slice(0, 4).map((teacher) => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/teachers"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#143a2f] hover:text-[#0f2c24] underline underline-offset-4"
          >
            <span>Browse all teachers</span>
            <ArrowRight className="w-4 h-4 text-[#c49a55]" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
};
