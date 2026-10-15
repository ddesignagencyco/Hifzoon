'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Highlighter, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Sparkles, 
  CalendarCheck,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { MistakeType } from '@/lib/types';

interface TaggedMistake {
  word: string;
  type: MistakeType;
  label: string;
}

export const InteractiveClassroomDemo: React.FC = () => {
  const [layout, setLayout] = useState<'MADANI' | 'INDOPAK'>('MADANI');
  const [tajweedOn, setTajweedOn] = useState(true);
  const [simulatedWeakNet, setSimulatedWeakNet] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState<TaggedMistake[]>([
    { word: 'الرَّحْمَٰنِ', type: MistakeType.VOWEL_HARAKAH, label: 'Kasrah missed on Noon' }
  ]);

  const wordsSurahIkhlas = [
    { id: 'w1', text: 'قُلْ', ayah: 1, rule: 'qalqalah', hint: 'Heavy Qaf with Sukoon' },
    { id: 'w2', text: 'هُوَ', ayah: 1, rule: '', hint: '' },
    { id: 'w3', text: 'اللَّهُ', ayah: 1, rule: 'madd', hint: 'Lafz-ul-Jalalah' },
    { id: 'w4', text: 'أَحَدٌ', ayah: 1, rule: 'qalqalah', hint: 'Qalqalah Kubra on Dal' },
    { id: 'w5', text: 'اللَّهُ', ayah: 2, rule: '', hint: '' },
    { id: 'w6', text: 'الصَّمَدُ', ayah: 2, rule: 'qalqalah', hint: 'Qalqalah Kubra' },
    { id: 'w7', text: 'لَمْ', ayah: 3, rule: 'ikhfa', hint: 'Meem Sakinah Izhar' },
    { id: 'w8', text: 'يَلِدْ', ayah: 3, rule: 'qalqalah', hint: 'Qalqalah Sughra on Dal' },
    { id: 'w9', text: 'وَلَمْ', ayah: 3, rule: '', hint: '' },
    { id: 'w10', text: 'يُولَدْ', ayah: 3, rule: 'qalqalah', hint: 'Qalqalah Kubra on stop' },
    { id: 'w11', text: 'وَلَمْ', ayah: 4, rule: '', hint: '' },
    { id: 'w12', text: 'يَكُن', ayah: 4, rule: 'idgham', hint: 'Idgham with Ghunnah' },
    { id: 'w13', text: 'لَّهُ', ayah: 4, rule: 'ghunnah', hint: 'Idgham Bila Ghunnah' },
    { id: 'w14', text: 'كُفُوًا', ayah: 4, rule: '', hint: '' },
    { id: 'w15', text: 'أَحَدٌ', ayah: 4, rule: 'qalqalah', hint: 'Qalqalah Kubra' },
  ];

  const handleWordClick = (wordText: string) => {
    setSelectedWord(wordText);
  };

  const addMistake = (type: MistakeType, label: string) => {
    if (!selectedWord) return;
    setMistakes((prev) => [
      ...prev.filter((m) => m.word !== selectedWord),
      { word: selectedWord, type, label }
    ]);
    setSelectedWord(null);
  };

  const clearMistakes = () => {
    setMistakes([]);
    setSelectedWord(null);
  };

  return (
    <section id="classroom-demo" className="py-20 bg-[#FAF8F5] border-b border-[#E7E1D7] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="max-w-3xl mx-auto text-center mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-[#F4EFEA] border border-[#DCD5C9] text-[11px] font-semibold text-[#143D33] tracking-wide uppercase">
            <BookOpen className="w-3.5 h-3.5 text-[#9E7D53]" />
            <span>Interactive Pedagogical Demonstration</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl font-normal text-[#1A221E] font-serif">
            A Virtual Classroom Designed Solely for the Quran
          </h2>
          
          <p className="text-xs sm:text-sm text-[#424D48] leading-relaxed">
            Unlike generic conference software, Hifzoon provides an authorized digital Mushaf that synchronizes pages and word highlights in real time (&lt;500ms). Tap words below to test teacher error tagging and Tajweed overlays.
          </p>
        </div>

        {/* Classroom Frame */}
        <div className="bg-[#182320] rounded-sm border border-[#2D3F3A] shadow-xl overflow-hidden text-white">
          
          {/* Top Control Bar */}
          <div className="bg-[#101917] px-4 py-3 border-b border-[#283833] flex flex-wrap items-center justify-between gap-3 text-xs">
            
            {/* Left: Script selection & Tajweed toggle */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[#8E9E98] text-[11px] font-medium">Mushaf Layout:</span>
              <div className="flex bg-[#182320] rounded-sm p-0.5 border border-[#2D3F3A]">
                <button
                  type="button"
                  onClick={() => setLayout('MADANI')}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-xs transition-colors ${
                    layout === 'MADANI' ? 'bg-[#143D33] text-white' : 'text-[#8E9E98] hover:text-white'
                  }`}
                >
                  Madani (15-Line)
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('INDOPAK')}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-xs transition-colors ${
                    layout === 'INDOPAK' ? 'bg-[#143D33] text-white' : 'text-[#8E9E98] hover:text-white'
                  }`}
                >
                  IndoPak (16-Line)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setTajweedOn(!tajweedOn)}
                className={`px-3 py-1 rounded-sm border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                  tajweedOn 
                    ? 'bg-[#143D33] border-[#386657] text-[#D8C2A0]' 
                    : 'bg-[#182320] border-[#2D3F3A] text-[#8E9E98]'
                }`}
              >
                <Sparkles className="w-3 h-3 text-[#D8C2A0]" />
                <span>Tajweed Overlay {tajweedOn ? 'Active' : 'Off'}</span>
              </button>
            </div>

            {/* Right: Low bandwidth simulation & reset */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSimulatedWeakNet(!simulatedWeakNet)}
                className={`px-3 py-1 rounded-sm border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                  simulatedWeakNet 
                    ? 'bg-[#7A3E1D] border-[#A85A2D] text-white' 
                    : 'bg-[#182320] border-[#2D3F3A] text-[#8E9E98] hover:text-white'
                }`}
              >
                {simulatedWeakNet ? <WifiOff className="w-3.5 h-3.5 text-[#F5B58C]" /> : <Wifi className="w-3.5 h-3.5 text-[#52A388]" />}
                <span>{simulatedWeakNet ? 'Bandwidth 800 Kbps (Video Dropped, Audio Running)' : 'Test Low Bandwidth (1 Mbps)'}</span>
              </button>

              {mistakes.length > 0 && (
                <button
                  type="button"
                  onClick={clearMistakes}
                  className="text-[11px] text-[#8E9E98] hover:text-[#D8C2A0] underline"
                >
                  Reset Tags
                </button>
              )}
            </div>

          </div>

          {/* Classroom Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            
            {/* Left: Authentic Mushaf Page (8 Cols) */}
            <div className="lg:col-span-8 p-6 lg:p-8 bg-[#FCFAF5] text-[#1A221E] border-b lg:border-b-0 lg:border-r border-[#283833] relative">
              
              {/* Surah Header Block with Understated Border */}
              <div className="border border-[#DCD5C9] bg-white rounded-xs p-3 mb-6 text-center shadow-xs">
                <div className="text-[10px] uppercase tracking-widest text-[#7A5E35] font-sans font-bold">
                  Surah Al-Ikhlas (The Sincerity) • سورة الإخلاص
                </div>
                <div className="font-arabic text-xl sm:text-2xl text-[#143D33] font-normal mt-1">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>
              </div>

              {/* Instructional Notice */}
              <div className="mb-4 text-xs text-[#424D48] bg-[#F4EFEA] border border-[#DCD5C9] rounded-xs p-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Highlighter className="w-3.5 h-3.5 text-[#9E7D53]" />
                  <span><strong>Teacher Tool:</strong> Click any Arabic word below to record a vocal correction.</span>
                </span>
                <span className="text-[10px] font-mono text-[#6B7670] hidden sm:inline">
                  &lt; 500ms sync latency
                </span>
              </div>

              {/* Surah Words with Interactive Vocal Tagging */}
              <div className="font-arabic text-2xl sm:text-3xl lg:text-[34px] leading-[2.6] text-right py-4 px-2 select-none">
                {wordsSurahIkhlas.map((item) => {
                  const mistake = mistakes.find((m) => m.word === item.text);
                  const isSelected = selectedWord === item.text;
                  let colorClass = '';

                  if (tajweedOn) {
                    if (item.rule === 'qalqalah') colorClass = 'tajweed-qalqalah';
                    if (item.rule === 'idgham') colorClass = 'tajweed-idgham';
                    if (item.rule === 'ghunnah') colorClass = 'tajweed-ghunnah';
                    if (item.rule === 'ikhfa') colorClass = 'tajweed-ikhfa';
                    if (item.rule === 'madd') colorClass = 'tajweed-madd';
                  }

                  return (
                    <React.Fragment key={item.id}>
                      <span
                        onClick={() => handleWordClick(item.text)}
                        className={`inline-block cursor-pointer px-2 py-0.5 rounded-xs transition-all ${
                          mistake 
                            ? 'bg-[#FEE2E2] text-[#991B1B] border border-[#F87171] font-bold' 
                            : isSelected 
                              ? 'bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]' 
                              : 'hover:bg-[#F4EFEA]'
                        } ${colorClass}`}
                        title={item.hint || 'Click to tag mistake'}
                      >
                        {item.text}
                        {mistake && (
                          <span className="mr-1 text-[9px] font-sans font-bold bg-[#B91C1C] text-white px-1 py-0.2 rounded-xs align-top">
                            {mistake.type.split('_')[0]}
                          </span>
                        )}
                      </span>{' '}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Tajweed Color Legend */}
              {tajweedOn && (
                <div className="mt-8 pt-4 border-t border-[#E7E1D7] flex flex-wrap items-center gap-4 text-xs text-[#424D48]">
                  <span className="font-bold text-[#1A221E] text-[11px] uppercase tracking-wider">Tajweed Rules:</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#B91C1C]" /> Qalqalah</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#B45309]" /> Ghunnah</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#15803D]" /> Idgham</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#6D28D9]" /> Ikhfa</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#92400E]" /> Madd</span>
                </div>
              )}

              {/* Mistake Picker Modal (SRS FR-REC-01) */}
              {selectedWord && (
                <div className="absolute inset-x-6 top-20 bg-white rounded-sm shadow-xl border border-[#9E7D53] p-5 z-20">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#E7E1D7]">
                    <div>
                      <span className="text-[10px] text-[#6B7670] uppercase font-bold tracking-wider">Tag Vocal Correction</span>
                      <h4 className="font-arabic text-xl font-bold text-[#143D33]">{selectedWord}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedWord(null)}
                      className="text-xs text-[#6B7670] hover:text-[#1A221E]"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="text-[11px] font-bold text-[#1A221E] mb-2 uppercase tracking-wide">
                    Select Error Category:
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => addMistake(MistakeType.LETTER_MAKHRAJ, 'Makhraj / Articulation error')}
                      className="p-2 text-left text-xs rounded-xs border border-[#DCD5C9] hover:bg-[#F9F6F0] hover:border-[#9E7D53]"
                    >
                      <div className="font-bold text-[#1A221E]">1. Makhraj (Letter)</div>
                      <div className="text-[10px] text-[#6B7670]">Throat/tongue point</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => addMistake(MistakeType.VOWEL_HARAKAH, 'Harakah error')}
                      className="p-2 text-left text-xs rounded-xs border border-[#DCD5C9] hover:bg-[#F9F6F0] hover:border-[#9E7D53]"
                    >
                      <div className="font-bold text-[#1A221E]">2. Harakah (Vowel)</div>
                      <div className="text-[10px] text-[#6B7670]">Fatha/Kasra/Damma</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => addMistake(MistakeType.TAJWEED_RULE, 'Tajweed rule missed')}
                      className="p-2 text-left text-xs rounded-xs border border-[#DCD5C9] hover:bg-[#F9F6F0] hover:border-[#9E7D53]"
                    >
                      <div className="font-bold text-[#1A221E]">3. Tajweed Rule</div>
                      <div className="text-[10px] text-[#6B7670]">Ghunnah or Qalqalah</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => addMistake(MistakeType.SKIPPED_WORD, 'Skipped word')}
                      className="p-2 text-left text-xs rounded-xs border border-[#DCD5C9] hover:bg-[#F9F6F0] hover:border-[#9E7D53]"
                    >
                      <div className="font-bold text-[#1A221E]">4. Skipped Word</div>
                      <div className="text-[10px] text-[#6B7670]">Omitted letter/word</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => addMistake(MistakeType.ADDED_WORD, 'Added word')}
                      className="p-2 text-left text-xs rounded-xs border border-[#DCD5C9] hover:bg-[#F9F6F0] hover:border-[#9E7D53]"
                    >
                      <div className="font-bold text-[#1A221E]">5. Added Word</div>
                      <div className="text-[10px] text-[#6B7670]">Extraneous sound</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => addMistake(MistakeType.STOP_WAQF, 'Improper stop')}
                      className="p-2 text-left text-xs rounded-xs border border-[#DCD5C9] hover:bg-[#F9F6F0] hover:border-[#9E7D53]"
                    >
                      <div className="font-bold text-[#1A221E]">6. Waqf (Stop)</div>
                      <div className="text-[10px] text-[#6B7670]">Incomplete breath</div>
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Right: Real-time Lesson Card & Attendance (4 Cols) */}
            <div className="lg:col-span-4 p-6 bg-[#131D1A] flex flex-col justify-between space-y-6">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#283833] text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#D8C2A0]" />
                    Pre-filled Lesson Card
                  </span>
                  <span className="text-[10px] font-mono text-[#52A388]">
                    SRS FR-REC-04
                  </span>
                </div>

                {/* Lesson Card Portions */}
                <div className="space-y-2.5 text-xs">
                  <div className="bg-[#182320] p-3 rounded-xs border border-[#283833]">
                    <div className="flex justify-between items-center text-[#8E9E98] text-[11px] mb-1">
                      <span className="font-medium text-[#C9D4CE]">Sabaq (Current Reading)</span>
                      <span className="text-[#52A388] font-bold">Grade: EXCELLENT</span>
                    </div>
                    <div className="text-white font-medium">Surah Al-Ikhlas (Verses 1 to 4)</div>
                  </div>

                  {/* Mistakes Logged */}
                  <div className="bg-[#182320] p-3 rounded-xs border border-[#283833]">
                    <div className="flex justify-between items-center text-[#8E9E98] text-[11px] mb-2">
                      <span className="font-medium text-[#F87171]">Logged Corrections ({mistakes.length})</span>
                      <span className="text-[10px] text-[#8E9E98]">Archived in study log</span>
                    </div>

                    {mistakes.length === 0 ? (
                      <p className="text-[#6B7670] text-xs italic">
                        No corrections marked. Click words on the left.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {mistakes.map((m, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-[#101917] px-2.5 py-1 rounded-xs border border-[#283833]">
                            <span className="font-arabic text-sm text-[#D8C2A0]">{m.word}</span>
                            <span className="text-[10px] text-[#C9D4CE]">{m.type.replace('_', ' ')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Adaptive Bandwidth Degradation Banner */}
                  <div className={`p-3 rounded-xs border text-xs transition-colors ${
                    simulatedWeakNet 
                      ? 'bg-[#2E180E] border-[#A85A2D] text-[#F5B58C]' 
                      : 'bg-[#10241E] border-[#204E40] text-[#A7D1C4]'
                  }`}>
                    <div className="font-semibold mb-0.5">
                      {simulatedWeakNet ? 'Adaptive Video Fallback Active' : 'Optimal WebRTC Connection'}
                    </div>
                    <p className="text-[11px] leading-relaxed text-[#C9D4CE]">
                      {simulatedWeakNet 
                        ? 'Bandwidth dropped below 1 Mbps. Video paused automatically; crystal-clear audio and Mushaf highlight sync continue uninterrupted (FR-CLS-11).' 
                        : 'WebRTC audio/video running with real-time bi-directional Socket.IO page synchronization.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-4 border-t border-[#283833]">
                <Link
                  href="/book-trial"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xs text-xs font-semibold text-white bg-[#143D33] hover:bg-[#0E2B24] border border-[#386657] transition-colors"
                >
                  <CalendarCheck className="w-3.5 h-3.5 text-[#D8C2A0]" />
                  <span>Experience Classroom in Free Trial</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

            </div>

          </div>

        </div>

        {/* Dignified Institutional Comparison (Zoom vs Hifzoon) */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-sm bg-white border border-[#E7E1D7] shadow-xs">
            <div className="flex items-center gap-2 text-[#991B1B] font-semibold text-xs uppercase tracking-wider mb-3">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>Conventional Remote Teaching (Zoom &amp; WhatsApp)</span>
            </div>
            <ul className="space-y-2 text-xs text-[#424D48]">
              <li className="flex items-start gap-2">
                <span className="text-[#991B1B]">•</span>
                <span>Screen shares compress and blur fine Arabic vowel markings (Harakat).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#991B1B]">•</span>
                <span>Teachers cannot guide a child&apos;s gaze word-by-word without latency.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#991B1B]">•</span>
                <span>Assignments and lesson records get buried in personal chat logs.</span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-sm bg-white border border-[#DCD5C9] shadow-xs">
            <div className="flex items-center gap-2 text-[#143D33] font-semibold text-xs uppercase tracking-wider mb-3">
              <CheckCircle2 className="w-4 h-4 text-[#143D33] shrink-0" />
              <span>The Hifzoon Academy Standard</span>
            </div>
            <ul className="space-y-2 text-xs text-[#424D48]">
              <li className="flex items-start gap-2">
                <span className="text-[#143D33]">•</span>
                <span>Native, authorized vector Mushaf script that stays razor-sharp at any zoom.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#143D33]">•</span>
                <span>Sub-500ms word highlighting that precisely maintains pupil concentration.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#143D33]">•</span>
                <span>Systematic 604-page memorization tracking and monthly competency reports.</span>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </section>
  );
};
