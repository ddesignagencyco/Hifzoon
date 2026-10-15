'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { 
  GraduationCap, 
  ShieldCheck, 
  Award, 
  CheckCircle2, 
  Clock, 
  Mic,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/landing/Button';
import { submitTeacherApplication } from '@/lib/api/client';
import { countryOptions, isCountryCode } from '@/lib/data/countries';
import { useToast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';

export default function ApplyTeacherPage() {
  const toast = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const countries = useMemo(() => countryOptions(), []);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [yearsExp, setYearsExp] = useState('5-8');
  const [isHafiz, setIsHafiz] = useState(true);
  const [hasSanad, setHasSanad] = useState(true);
  const [qiraat, setQiraat] = useState('Hafs ‘an ‘Asim');
  const [recitationLink, setRecitationLink] = useState('');

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'Please enter your full name.';
    if (name.trim().length > 160) errors.name = 'Name cannot exceed 160 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 320) errors.email = 'Enter a valid email address.';
    if (phone.trim().length > 32) errors.phone = 'Phone number cannot exceed 32 characters.';
    if (!isCountryCode(country)) errors.country = 'Choose your country of residence.';
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    const problems = Object.values(errors);
    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : 'Please fix the highlighted fields');
      return;
    }
    setIsSubmitting(true);
    const result = await submitTeacherApplication({
      applicantName: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      country, // ISO 3166-1 alpha-2, as the API's MaxLength(2) expects
      qualifications: {
        gender,
        yearsExp,
        isHafiz,
        hasSanad,
        qiraat,
        recitationLink,
      },
    });
    setIsSubmitting(false);
    if (result.success) setSubmitted(true);
    else toast.error(result.message);
  };

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1">
        {/* Full-Width Header */}
        <section className="bg-[#0f2c24] text-white py-16 md:py-24 px-6 sm:px-8 lg:px-10 relative overflow-hidden">
          <div
            className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
            aria-hidden="true"
          />
          <div className="max-w-[1360px] mx-auto text-center relative z-10">
            <h1 className="text-3xl sm:text-5xl font-fraunces font-normal tracking-tight text-white mb-4">
              Apply to Join the Hifzoon Faculty
            </h1>
            <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              We welcome certified, patient Huffaz and Tajweed scholars worldwide. Enjoy structured 1-on-1 teaching, punctual bi-weekly compensation, purpose-built classroom tools, and zero administrative burden.
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 lg:px-10 py-14">
          {/* 5-Step Academic Vetting Pipeline Banner */}
          <div className="mb-12 p-6 md:p-8 rounded-[28px] bg-white border border-[#e6dfd1] shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 pb-4 border-b border-[#f3eee4] gap-2">
              <h3 className="font-fraunces text-lg text-[#10201b] font-medium">
                Rigorous 5-Stage Faculty Selection Framework
              </h3>
              <span className="text-xs text-[#a97f3c] font-semibold">
                Acceptance Rate: &lt; 8% of applicants
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-xs">
              <div className="p-3.5 rounded-2xl bg-[#f0f6f3] text-[#143a2f] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#a97f3c] block">Stage 1</span>
                <span className="font-semibold block mt-1">Application</span>
                <span className="text-[10px] text-[#6b7772]">Recitation &amp; CV</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 2</span>
                <span className="font-semibold block mt-1">Audio Audit</span>
                <span className="text-[10px] text-[#6b7772]">Tajweed Board</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 3</span>
                <span className="font-semibold block mt-1">Live Demo</span>
                <span className="text-[10px] text-[#6b7772]">Pedagogy Check</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 4</span>
                <span className="font-semibold block mt-1">Identity &amp; Sanad</span>
                <span className="text-[10px] text-[#6b7772]">Credential Audit</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 5</span>
                <span className="font-semibold block mt-1">Safeguarding</span>
                <span className="text-[10px] text-[#6b7772]">Child Safety Code</span>
              </div>
            </div>
          </div>

          {submitted ? (
            <div className="bg-white rounded-[28px] border border-[#143a2f] p-8 sm:p-12 shadow-card text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#f0f6f3] text-[#1c4c3e] flex items-center justify-center mx-auto border border-[#c49a55]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-fraunces font-normal text-[#10201b]">
                Faculty Application Received
              </h2>
              <p className="text-sm text-[#6b7772] max-w-md mx-auto leading-relaxed">
                JazakAllah Khayran, {name}. Our Academic Review Board will audit your recitation recording and credentials. Qualified candidates receive an invitation for Stage 2 within 48 to 72 business hours.
              </p>
              <div className="pt-6">
                <Button variant="green" size="default" href="/">
                  Return to Academy Homepage
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-[28px] border border-[#e6dfd1] p-7 sm:p-10 shadow-card space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Full Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sheikh Bilal Ahmad"
                    aria-invalid={fieldErrors.name ? true : undefined}
                    aria-describedby={fieldErrors.name ? 'apply-name-error' : undefined}
                    className={`w-full px-4 py-3 rounded-full border ${fieldErrors.name ? 'border-red' : 'border-[#e6dfd1]'} bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]`}
                  />
                  {fieldErrors.name && <p id="apply-name-error" className="sr-only">{fieldErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Faculty Designation *
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setGender('MALE')}
                      className={`py-3 rounded-full border transition-all cursor-pointer ${
                        gender === 'MALE' 
                          ? 'bg-[#143a2f] text-white border-[#143a2f] shadow-xs' 
                          : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white'
                      }`}
                    >
                      Male (Ustadh)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('FEMALE')}
                      className={`py-3 rounded-full border transition-all cursor-pointer ${
                        gender === 'FEMALE' 
                          ? 'bg-[#143a2f] text-white border-[#143a2f] shadow-xs' 
                          : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white'
                      }`}
                    >
                      Female (Ustadha)
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="bilal@example.com"
                    aria-invalid={fieldErrors.email ? true : undefined}
                    aria-describedby={fieldErrors.email ? 'apply-email-error' : undefined}
                    className={`w-full px-4 py-3 rounded-full border ${fieldErrors.email ? 'border-red' : 'border-[#e6dfd1]'} bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]`}
                  />
                  {fieldErrors.email && <p id="apply-email-error" className="sr-only">{fieldErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    WhatsApp Contact Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+92 300 1234567"
                    aria-invalid={fieldErrors.phone ? true : undefined}
                    aria-describedby={fieldErrors.phone ? 'apply-phone-error' : undefined}
                    className={`w-full px-4 py-3 rounded-full border ${fieldErrors.phone ? 'border-red' : 'border-[#e6dfd1]'} bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]`}
                  />
                  {fieldErrors.phone && <p id="apply-phone-error" className="sr-only">{fieldErrors.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label htmlFor="apply-country" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Country of Residence *
                  </label>
                  <Select
                    id="apply-country"
                    appearance="pill"
                    placeholder="Choose a country…"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    aria-invalid={fieldErrors.country ? true : undefined}
                    aria-describedby={fieldErrors.country ? 'apply-country-error' : undefined}
                    controlClassName="min-h-[46px]"
                  >
                    <option value="">Choose a country…</option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {fieldErrors.country && <p id="apply-country-error" className="sr-only">{fieldErrors.country}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Online Teaching Exp *
                  </label>
                  <Select
                    value={yearsExp}
                    onChange={(e) => setYearsExp(e.target.value)}
                    appearance="pill"
                    aria-label="Years of teaching experience"
                    controlClassName="min-h-[46px]"
                  >
                    <option value="1-3">1 – 3 Years</option>
                    <option value="3-5">3 – 5 Years</option>
                    <option value="5-8">5 – 8 Years</option>
                    <option value="8+">8+ Years Experience</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                    Primary Qira’ah *
                  </label>
                  <input
                    type="text"
                    value={qiraat}
                    onChange={(e) => setQiraat(e.target.value)}
                    className="w-full px-4 py-3 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                  Sample Recitation Audio or Video Link *
                </label>
                <div className="relative">
                  <Mic className="w-4 h-4 text-[#6b7772] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    required
                    value={recitationLink}
                    onChange={(e) => setRecitationLink(e.target.value)}
                    placeholder="Google Drive, Dropbox, YouTube, or SoundCloud link"
                    className="w-full pl-11 pr-4 py-3 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b]"
                  />
                </div>
                <p className="text-[11px] text-[#6b7772] mt-1.5">
                  Recite Surah Al-Fatihah and 10 verses of your choice with Murattal recitation.
                </p>
              </div>

              <div className="pt-2">
                <Button
                  variant="green"
                  size="default"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full font-semibold"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit Application for Stage 1 Audit'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
