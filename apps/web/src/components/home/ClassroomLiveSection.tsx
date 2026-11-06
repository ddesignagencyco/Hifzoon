'use client';

import React from 'react';
import { RefreshCw, Tag, Smartphone, ArrowRight } from 'lucide-react';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { IconTile } from '@/components/landing/IconTile';
import { Button } from '@/components/landing/Button';
import { LiveClassroom } from './classroom-demo/LiveClassroom';

/**
 * "The Hifzoon classroom" with a live, auto-playing demo inside a laptop frame.
 * Side by side from xl; below that the demo sits under the copy at a readable size.
 * Replaces ClassroomSection on the homepage (which is kept untouched for revert).
 * The demo clock lives inside <LiveClassroom />, so this copy never re-renders per tick.
 */
export const ClassroomLiveSection: React.FC = () => {
  return (
    <section id="classroom" className="bg-[#faf7f1] py-20 md:py-32">
      <div className="site-container">
        <div className="grid grid-cols-1 items-center gap-12 xl:grid-cols-[0.78fr_1.22fr] xl:gap-16">
          {/* Left column: copy */}
          <div className="space-y-6">
            <Eyebrow>The Hifzoon classroom</Eyebrow>

            <h2 className="font-fraunces text-[34px] md:text-[50px] font-normal leading-[1.12] text-[#10201b]">
              A virtual classroom built only for the Quran
            </h2>

            <div className="grid gap-6 pt-2 md:grid-cols-3 md:gap-8 xl:grid-cols-1 xl:gap-6">
              <div className="flex items-start gap-4">
                <IconTile>
                  <RefreshCw />
                </IconTile>
                <div>
                  <h3 className="font-semibold text-[17px] text-[#10201b]">Pages and word highlights in sync</h3>
                  <p className="mt-1 text-[14.5px] text-[#6b7772] leading-relaxed">
                    The teacher guides your child&apos;s eye word by word, with under 500ms latency.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <IconTile>
                  <Tag />
                </IconTile>
                <div>
                  <h3 className="font-semibold text-[17px] text-[#10201b]">Mistakes tagged in one tap</h3>
                  <p className="mt-1 text-[14.5px] text-[#6b7772] leading-relaxed">
                    Every correction is saved to the lesson card, not lost in a chat.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <IconTile>
                  <Smartphone />
                </IconTile>
                <div>
                  <h3 className="font-semibold text-[17px] text-[#10201b]">Parents see every lesson</h3>
                  <p className="mt-1 text-[14.5px] text-[#6b7772] leading-relaxed">
                    Notes, audio and attendance land in the parent portal after class.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button href="/book-trial" variant="gold" icon={<ArrowRight />} iconPosition="right">
                Try it in a free trial
              </Button>
            </div>
          </div>

          {/* Right column (below the copy until xl): an illustrated class, not a recording */}
          <div className="min-w-0">
            <LiveClassroom />
            <p className="mt-2 text-center text-[12px] text-muted">
              Illustration of a Hifzoon class. Names are examples, not real students or teachers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
