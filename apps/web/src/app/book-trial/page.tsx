'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  CalendarCheck, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Globe, 
  ArrowLeft, 
  ArrowRight, 
  Download, 
  Sparkles, 
  Check,
  BookOpen,
  Award,
  Video
} from 'lucide-react';
import { CourseType } from '@/lib/types';
import { COURSES_DATA } from '@/lib/data/mock-data';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/landing/Button';

export default function BookTrialPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [studentName, setStudentName] = useState('');
  const [studentAge, setStudentAge] = useState<number>(8);
  const [courseCode, setCourseCode] = useState<CourseType>(CourseType.QAIDA);
  const [teacherGender, setTeacherGender] = useState<'ANY' | 'MALE' | 'FEMALE'>('ANY');
  const [language, setLanguage] = useState('English');

  // Timezone & Slots State
  const [timeZone, setTimeZone] = useState('Europe/London');
  const [selectedDate, setSelectedDate] = useState('Tomorrow');
  const [selectedSlot, setSelectedSlot] = useState('17:00');

  // Guardian State
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [learningNotes, setLearningNotes] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(true);

  // Booking Result State
  const [bookingId, setBookingId] = useState('');

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimeZone(detected);
    } catch {
      setTimeZone('Europe/London');
    }
  }, []);

  const availableDates = [
    { label: 'Tomorrow', date: 'Thu, Oct 15' },
    { label: 'In 2 Days', date: 'Fri, Oct 16' },
    { label: 'Weekend', date: 'Sat, Oct 17' },
    { label: 'Next Week', date: 'Mon, Oct 19' },
  ];

  const timeSlots = [
    { period: 'Morning Slots', slots: ['09:00 AM', '10:30 AM', '11:45 AM'] },
    { period: 'Afternoon Slots', slots: ['02:00 PM', '03:30 PM', '04:30 PM'] },
    { period: 'Evening Slots', slots: ['05:30 PM', '06:45 PM', '07:30 PM', '08:15 PM'] },
  ];

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (!selectedSlot) return;
    setStep(3);
  };

  const handleSubmitBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardianName.trim() || !guardianEmail.trim() || !guardianConsent) return;

    const id = 'TRL-' + Math.floor(100000 + Math.random() * 900000);
    setBookingId(id);
    setStep(4);
  };

  const downloadIcsCalendar = () => {
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Hifzoon Quran Academy//EN
BEGIN:VEVENT
UID:${bookingId}@hifzoon.com
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART:${new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z
SUMMARY:Free 1-on-1 Quran Evaluation Class - Hifzoon Academy
DESCRIPTION:Your private 30-min evaluation class with a vetted scholar is confirmed.
URL:https://hifzoon.com/classroom/${bookingId}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `hifzoon-trial-${bookingId}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/25 selection:text-[#0a1f19]">
      <Header />

      <main className="flex-1">
        {/* Hero Header Banner */}
        <section className="bg-[#0f2c24] text-white py-12 md:py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden border-b border-white/10">
          <div
            className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
            aria-hidden="true"
          />
          <div className="max-w-[1360px] mx-auto text-center relative z-10">
            {/* Top Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-[#c49a55] border border-[#c49a55]/30 text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              <span>30-Minute Private Evaluation · 100% Free · No Card Required</span>
            </div>

            <h1 className="font-fraunces text-[32px] sm:text-[44px] md:text-[52px] font-normal tracking-tight text-white mb-3">
              Schedule a Free Trial Class
            </h1>
            <p className="text-[#c4d3cd] text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Pair your child with an audited, patient Quran scholar suited to their exact age, Makharij articulation, and reading foundation.
            </p>

            {/* 3 Trust Signals */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 pt-6 text-xs text-[#c4d3cd]">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#c49a55]" />
                <span>COPPA &amp; UK Child-Safe</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-[#c49a55]" />
                <span>Verified Sanad &amp; Ijazah</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#c49a55]" />
                <span>Synchronized Mushaf Classroom</span>
              </div>
            </div>
          </div>
        </section>

        {/* Form Container */}
        <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
          {/* Step Indicator */}
          {step < 4 && (
            <div className="mb-8">
              <div className="grid grid-cols-3 text-center text-xs font-semibold text-[#6b7772] mb-3 font-sans">
                <span className={step >= 1 ? 'text-[#143a2f] font-bold' : ''}>
                  1. Student Details
                </span>
                <span className={step >= 2 ? 'text-[#143a2f] font-bold' : ''}>
                  2. Date &amp; Local Time
                </span>
                <span className={step >= 3 ? 'text-[#143a2f] font-bold' : ''}>
                  3. Guardian Contact
                </span>
              </div>
              <div className="w-full bg-[#e6dfd1] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#143a2f] h-full transition-all duration-300 rounded-full"
                  style={{ width: step === 1 ? '33.3%' : step === 2 ? '66.6%' : '100%' }}
                />
              </div>
            </div>
          )}

          {/* STEP 1: Student Information */}
          {step === 1 && (
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card">
              <div className="mb-6 space-y-1">
                <div className="text-xs text-[#a97f3c] font-semibold uppercase tracking-wider">
                  Step 1 of 3
                </div>
                <h2 className="text-2xl sm:text-3xl font-fraunces font-normal text-[#10201b]">
                  Student Details
                </h2>
                <p className="text-xs sm:text-sm text-[#6b7772] leading-relaxed">
                  Tell us about the learner so we select the best teacher and syllabus level.
                </p>
              </div>

              <form onSubmit={handleNextStep1} className="space-y-6">
                {/* Student Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Student&apos;s Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="e.g. Rayan, Sarah, Hamza"
                    className="w-full px-4 py-3 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]"
                  />
                </div>

                {/* Student Age */}
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Student&apos;s Age: <span className="text-[#143a2f] font-bold">{studentAge >= 18 ? 'Adult 18+' : `${studentAge} years old`}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18].map((age) => (
                      <button
                        key={age}
                        type="button"
                        onClick={() => setStudentAge(age)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          studentAge === age
                            ? 'bg-[#143a2f] text-white shadow-xs'
                            : 'bg-[#faf7f1] text-[#3c4a45] hover:bg-[#f3eee4] border border-[#e6dfd1]'
                        }`}
                      >
                        {age >= 18 ? 'Adult 18+' : `${age} yrs`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Program Selection */}
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Course Pathway of Interest
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {COURSES_DATA.slice(0, 4).map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setCourseCode(c.code)}
                        className={`cursor-pointer p-4 rounded-2xl border text-left transition-all ${
                          courseCode === c.code
                            ? 'border-[#143a2f] bg-[#f0f6f3] shadow-xs'
                            : 'border-[#e6dfd1] bg-[#faf7f1] hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-fraunces text-sm font-medium text-[#10201b]">{c.title}</span>
                          {courseCode === c.code && <Check className="w-4 h-4 text-[#143a2f]" />}
                        </div>
                        <div className="text-[11px] text-[#6b7772] mt-1 line-clamp-1">{c.tagline}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Teacher Gender Preference */}
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Teacher Gender Preference
                  </label>
                  <div className="grid grid-cols-3 gap-2.5 text-xs font-medium">
                    {(['ANY', 'MALE', 'FEMALE'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setTeacherGender(g)}
                        className={`py-2.5 px-2 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
                          teacherGender === g
                            ? 'bg-[#143a2f] text-white border-[#143a2f] shadow-xs font-semibold'
                            : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white'
                        }`}
                      >
                        {g === 'ANY' ? 'No Preference' : g === 'MALE' ? 'Male (Ustadh)' : 'Female (Ustadha)'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preferred Language */}
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Instruction Language
                  </label>
                  <div className="flex gap-2">
                    {['English', 'Urdu', 'Arabic'].map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          language === lang
                            ? 'bg-[#143a2f] text-white shadow-xs'
                            : 'bg-[#faf7f1] text-[#3c4a45] hover:bg-[#f3eee4] border border-[#e6dfd1]'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Step 1 */}
                <div className="pt-4">
                  <Button
                    variant="green"
                    size="default"
                    type="submit"
                    icon={<ArrowRight />}
                    iconPosition="right"
                    className="w-full"
                  >
                    Continue to Date &amp; Time Selection
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 2: Time Selection */}
          {step === 2 && (
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card">
              <div className="mb-6 space-y-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-medium text-[#6b7772] hover:text-[#10201b] flex items-center gap-1.5 mb-2.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Student Details
                </button>
                <div className="text-xs text-[#a97f3c] font-semibold uppercase tracking-wider">
                  Step 2 of 3
                </div>
                <h2 className="text-2xl sm:text-3xl font-fraunces font-normal text-[#10201b]">
                  Select Class Time
                </h2>
                <p className="text-xs sm:text-sm text-[#6b7772]">
                  All slots are displayed in your detected local timezone. Classes run 30 minutes.
                </p>

                {/* Timezone Switcher */}
                <div className="mt-4 p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-[#3c4a45]">
                    <Globe className="w-4 h-4 text-[#1c4c3e]" />
                    <span>Timezone: <strong>{timeZone}</strong></span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {['America/New_York', 'Europe/London', 'Asia/Dubai', 'Asia/Karachi'].map((tz) => (
                      <button
                        key={tz}
                        type="button"
                        onClick={() => setTimeZone(tz)}
                        className={`text-[11px] px-3 py-1 rounded-full transition-all cursor-pointer ${
                          timeZone === tz
                            ? 'bg-[#143a2f] text-white font-bold'
                            : 'bg-white border border-[#e6dfd1] text-[#3c4a45] hover:bg-[#f3eee4]'
                        }`}
                      >
                        {tz.split('/')[1].replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date Selection */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2.5">
                  Choose Day
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {availableDates.map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => setSelectedDate(d.label)}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        selectedDate === d.label
                          ? 'border-[#143a2f] bg-[#f0f6f3] shadow-xs'
                          : 'border-[#e6dfd1] bg-[#faf7f1] hover:bg-white'
                      }`}
                    >
                      <div className="text-xs font-bold text-[#10201b]">{d.label}</div>
                      <div className="text-[11px] text-[#6b7772] mt-0.5">{d.date}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Slots */}
              <div className="space-y-4 mb-8">
                {timeSlots.map((group) => (
                  <div key={group.period}>
                    <div className="text-[11px] font-bold text-[#a97f3c] uppercase tracking-wider mb-2">
                      {group.period}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {group.slots.map((slot) => {
                        const isSelected = selectedSlot === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2.5 px-3 rounded-full text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                              isSelected
                                ? 'bg-[#143a2f] text-white border-[#143a2f] shadow-xs'
                                : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{slot}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-[#f3eee4] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-[#6b7772]">
                  Selected: <strong className="text-[#10201b]">{selectedDate} at {selectedSlot}</strong>
                </div>

                <Button
                  variant="green"
                  size="default"
                  onClick={handleNextStep2}
                  icon={<ArrowRight />}
                  iconPosition="right"
                >
                  Continue to Guardian Contact
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Guardian Details */}
          {step === 3 && (
            <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-10 shadow-card">
              <div className="mb-6 space-y-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs font-medium text-[#6b7772] hover:text-[#10201b] flex items-center gap-1.5 mb-2.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Time Selection
                </button>
                <div className="text-xs text-[#a97f3c] font-semibold uppercase tracking-wider">
                  Step 3 of 3
                </div>
                <h2 className="text-2xl sm:text-3xl font-fraunces font-normal text-[#10201b]">
                  Guardian Information
                </h2>
                <p className="text-xs sm:text-sm text-[#6b7772]">
                  We will send the verified classroom entry link and calendar invitation directly to you.
                </p>
              </div>

              <form onSubmit={handleSubmitBooking} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                      Parent / Guardian Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="e.g. Dr. Aisha Rahman"
                      className="w-full px-4 py-3 rounded-full border border-[#e6dfd1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] bg-[#faf7f1]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={guardianEmail}
                      onChange={(e) => setGuardianEmail(e.target.value)}
                      placeholder="aisha@example.com"
                      className="w-full px-4 py-3 rounded-full border border-[#e6dfd1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] bg-[#faf7f1]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    WhatsApp Contact Number
                  </label>
                  <input
                    type="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="+44 7123 456789"
                    className="w-full px-4 py-3 rounded-full border border-[#e6dfd1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] bg-[#faf7f1]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Notes for Teacher (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={learningNotes}
                    onChange={(e) => setLearningNotes(e.target.value)}
                    placeholder="e.g. Shy student, needs gentle encouragement with Makharij, knows Arabic alphabet"
                    className="w-full px-4 py-3 rounded-2xl border border-[#e6dfd1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] bg-[#faf7f1]"
                  />
                </div>

                <div className="p-4 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={guardianConsent}
                    onChange={(e) => setGuardianConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-[#e6dfd1] text-[#143a2f] focus:ring-[#c49a55]"
                  />
                  <label htmlFor="consent" className="text-xs text-[#3c4a45] leading-relaxed cursor-pointer">
                    I confirm I am the parent/guardian and agree to Hifzoon&apos;s COPPA-compliant child safety guidelines. Contact details are masked from teachers.
                  </label>
                </div>

                <div className="pt-2">
                  <Button variant="gold" size="default" type="submit" className="w-full font-semibold whitespace-nowrap shrink-0">
                    Confirm Free Evaluation Booking (No Card Required)
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 4: Booking Confirmation Plaque */}
          {step === 4 && (
            <div className="bg-white rounded-[28px] border-2 border-[#c49a55] p-8 sm:p-12 shadow-card text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-[#f0f6f3] text-[#143a2f] border-2 border-[#c49a55] flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3.5 py-1 rounded-full bg-[#f6ecd9] text-[#a97f3c] text-xs font-bold uppercase tracking-wider border border-[#c49a55]/30">
                  Booking Reference: #{bookingId}
                </span>
                <h2 className="text-2xl sm:text-4xl font-fraunces font-normal text-[#10201b]">
                  Evaluation Class Scheduled!
                </h2>
                <p className="text-sm text-[#6b7772] max-w-md mx-auto leading-relaxed">
                  A calendar invite and verified classroom link have been emailed to <strong>{guardianEmail}</strong>.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] max-w-md mx-auto text-left text-xs space-y-2.5">
                <div className="flex justify-between border-b border-[#f3eee4] pb-2">
                  <span className="text-[#6b7772]">Student:</span>
                  <span className="font-semibold text-[#10201b]">{studentName} ({studentAge} yrs)</span>
                </div>
                <div className="flex justify-between border-b border-[#f3eee4] pb-2">
                  <span className="text-[#6b7772]">Course Track:</span>
                  <span className="font-semibold text-[#10201b]">{courseCode}</span>
                </div>
                <div className="flex justify-between border-b border-[#f3eee4] pb-2">
                  <span className="text-[#6b7772]">Scheduled Time:</span>
                  <span className="font-semibold text-[#10201b]">{selectedDate} at {selectedSlot}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7772]">Timezone:</span>
                  <span className="font-semibold text-[#10201b]">{timeZone}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
                <Button variant="outline" size="sm" onClick={downloadIcsCalendar} icon={<Download />} className="whitespace-nowrap shrink-0">
                  Add to Calendar (.ics)
                </Button>
                <Button variant="gold" size="sm" href="/" className="whitespace-nowrap shrink-0">
                  Return to Academy Homepage
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
