'use client';

import React from 'react';
import { RefreshCw, Tag, Smartphone, ArrowRight } from 'lucide-react';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { IconTile } from '@/components/landing/IconTile';
import { Button } from '@/components/landing/Button';
import { LiveClassroom } from './classroom-demo/LiveClassroom';

/**
 * "The Hifzoon classroom" with a live, auto-playing demo inside a laptop frame.
 * Replaces ClassroomSection on the homepage (which is kept untouched for revert).
 * The demo clock lives inside <LiveClassroom />, so this copy never re-renders per tick.
 */
export const ClassroomLiveSection: React.FC = () => {
  return (
    <section id="classroom" className="bg-[#faf7f1] py-20 md:py-32">
      <div className="site-container">
        <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-12 lg:gap-14 items-center">
          {/* Left column: copy */}
          <div className="space-y-6">
            <Eyebrow>The Hifzoon classroom</Eyebrow>

            <h2 className="font-fraunces text-[34px] md:text-[50px] font-normal leading-[1.12] text-[#10201b]">
              A virtual classroom built only for the Quran
            </h2>

            <div className="space-y-6 pt-2">
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

          {/* Right column: laptop with live, interactive meeting demo */}
          <LiveClassroom />
        </div>
      </div>
    </section>
  );
};
