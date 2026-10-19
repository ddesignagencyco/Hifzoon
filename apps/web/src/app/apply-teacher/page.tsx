'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { 
  GraduationCap, 
  ShieldCheck, 
  Award, 
  CheckCircle2, 
  Clock, 
  Mic, 
  Users, 
  DollarSign, 
  BookOpen, 
  ChevronRight,
  Globe,
  Loader2,
  FileCheck,
  Upload,
  Link as LinkIcon,
  Square,
  RotateCcw,
  Volume2,
  Play,
  AlertCircle,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/landing/Button';
import { submitTeacherApplication, type TeacherApplicationPayload } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/http';
import { UPLOAD_ACCEPT, uploadFile, validateUpload } from '@/lib/api/modules/uploads';
import { isCountryCode } from '@/lib/data/countries';
import { useToast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';
import { PhoneInput, CountrySelect } from '@/components/ui/primitives';

type DocumentType = keyof NonNullable<TeacherApplicationPayload['documents']>;

/** Optional supporting documents (`ApplicationDocumentType`), uploaded like the audition. */
const DOCUMENT_SLOTS: Array<{ type: DocumentType; label: string; hint: string }> = [
  { type: 'ID', label: 'Photo ID', hint: 'Passport or national ID' },
  { type: 'CERTIFICATE', label: 'Certificate', hint: 'Ijazah, sanad or degree' },
  { type: 'REFERENCE', label: 'Reference', hint: 'Letter from an institute or teacher' },
  { type: 'BACKGROUND_CHECK', label: 'Background check', hint: 'DBS or police clearance' },
];

type SubmitPhase = 'idle' | 'uploading-audio' | 'uploading-documents' | 'submitting';

function withoutKey<T extends object>(record: T, key: string): T {
  const next = { ...record } as Record<string, unknown>;
  delete next[key];
  return next as T;
}

export default function ApplyTeacherPage() {
  const toast = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const isSubmitting = submitPhase !== 'idle';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [yearsExp, setYearsExp] = useState('5-8');
  const [isHafiz, setIsHafiz] = useState(true);
  const [hasSanad, setHasSanad] = useState(true);
  const [qiraat, setQiraat] = useState('Hafs ‘an ‘Asim');
  const [recitationLink, setRecitationLink] = useState('');

  // 3-in-1 Recitation Audition State
  const [auditionMode, setAuditionMode] = useState<'RECORD' | 'UPLOAD' | 'LINK'>('RECORD');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  /** The recorded or chosen audition, uploaded to storage on submit (M34). */
  const [recitationFile, setRecitationFile] = useState<Blob | null>(null);
  const [documentFiles, setDocumentFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [micPermissionState, setMicPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [recordingError, setRecordingError] = useState<{
    title: string;
    message: string;
    isPermissionDenied: boolean;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor browser permission status in real-time
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setMicPermissionState('unsupported');
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setMicPermissionState('unsupported');
      return;
    }

    if (navigator?.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((permissionStatus) => {
          setMicPermissionState(permissionStatus.state as 'prompt' | 'granted' | 'denied');
          permissionStatus.onchange = () => {
            const nextState = permissionStatus.state as 'prompt' | 'granted' | 'denied';
            setMicPermissionState(nextState);
            if (nextState === 'granted') {
              setRecordingError(null);
            }
          };
        })
        .catch(() => {
          // Permissions API query for microphone not supported in some browsers
        });
    }
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const requestMicrophonePermission = async (autoStartRecording = false) => {
    setRecordingError(null);
    setIsRequestingPermission(true);

    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setRecordingError({
        title: 'Secure Connection Required (HTTPS / localhost)',
        message: 'Web browsers strictly require a secure connection (HTTPS or http://localhost) to access the microphone. Please open via http://localhost:3000 or upload an audio file instead.',
        isPermissionDenied: false,
      });
      setIsRequestingPermission(false);
      setMicPermissionState('unsupported');
      return false;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRecordingError({
        title: 'Microphone Not Supported',
        message: 'Microphone access is not supported by your current browser. Please upload an audio file or provide a link instead.',
        isPermissionDenied: false,
      });
      setIsRequestingPermission(false);
      setMicPermissionState('unsupported');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionState('granted');
      setRecordingError(null);
      setIsRequestingPermission(false);

      if (autoStartRecording) {
        startRecordingWithStream(stream);
      } else {
        stream.getTracks().forEach((track) => track.stop());
        toast.success('Microphone permission granted! You can now start recording.');
      }
      return true;
    } catch (err: unknown) {
      setIsRequestingPermission(false);
      const error = err as { name?: string; message?: string };
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        setMicPermissionState('denied');
        setRecordingError({
          title: 'Microphone Access Denied',
          message: 'Microphone access was denied or is blocked by your browser settings. Please allow access using the steps below and click "Request Permission Again", or switch to Upload Audio / Paste Link.',
          isPermissionDenied: true,
        });
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        setRecordingError({
          title: 'No Microphone Detected',
          message: 'No microphone input device was found connected to your computer. Please connect a microphone or use the Upload Audio tab.',
          isPermissionDenied: false,
        });
      } else if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
        setRecordingError({
          title: 'Microphone In Use',
          message: 'Your microphone appears to be in use by another app (Zoom, Teams, etc.). Please close other audio apps and try again.',
          isPermissionDenied: false,
        });
      } else {
        setRecordingError({
          title: 'Microphone Access Denied or Not Supported',
          message: 'Microphone access was denied or is not supported. Please allow permission using the browser address bar icon or upload an audio file instead.',
          isPermissionDenied: true,
        });
      }
      return false;
    }
  };

  const startRecordingWithStream = (stream: MediaStream) => {
    try {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Safari records MP4/AAC, Chrome and Firefox WebM/Opus: label the bytes truthfully.
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        const blobUrl = URL.createObjectURL(audioBlob);
        setAudioBlobUrl(blobUrl);
        setRecitationFile(audioBlob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setRecordingError({
        title: 'Recording Initialization Failed',
        message: 'Could not initialize audio recorder. Please upload an audio file instead.',
        isPermissionDenied: false,
      });
    }
  };

  const startRecording = () => {
    requestMicrophonePermission(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const clearRecording = () => {
    if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    setAudioBlobUrl(null);
    setRecitationFile(null);
    setUploadedFileName('');
    setRecordingDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      validateUpload('RECITATION_AUDIO', file);
    } catch (error) {
      toast.error(getErrorMessage(error));
      return;
    }
    setUploadedFileName(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
    setAudioBlobUrl(URL.createObjectURL(file));
    setRecitationFile(file);
    setFieldErrors((prev) => withoutKey(prev, 'recitation'));
  };

  const handleDocumentChange = (type: DocumentType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      validateUpload('APPLICATION_DOCUMENT', file);
    } catch (error) {
      const message = getErrorMessage(error);
      setFieldErrors((prev) => ({ ...prev, [`document_${type}`]: message }));
      toast.error(message);
      return;
    }
    setDocumentFiles((prev) => ({ ...prev, [type]: file }));
    setFieldErrors((prev) => withoutKey(prev, `document_${type}`));
  };

  const removeDocument = (type: DocumentType) => {
    setDocumentFiles((prev) => withoutKey(prev, type));
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'Please enter your full legal name.';
    if (name.trim().length > 160) errors.name = 'Name cannot exceed 160 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 320) errors.email = 'Enter a valid email address.';
    if (phone.trim().length > 32) errors.phone = 'Phone number cannot exceed 32 characters.';
    if (!isCountryCode(country)) errors.country = 'Choose your country of residence.';
    
    const hasAudio = Boolean(recitationFile || (recitationLink && recitationLink.trim().length > 3));
    if (!hasAudio) {
      errors.recitation = 'Please record your voice recitation, upload an audio file, or provide a link.';
    }
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
    const link = recitationLink.trim();

    // Direct-to-storage uploads (M34): the bytes go to the presigned URL and the API only
    // receives storage keys. A shared link is not uploaded: it travels in
    // `qualifications.recitationLink`.
    let recitationAudioKey: string | undefined;
    if (recitationFile) {
      setSubmitPhase('uploading-audio');
      try {
        recitationAudioKey = await uploadFile('RECITATION_AUDIO', recitationFile);
      } catch (error) {
        setSubmitPhase('idle');
        setFieldErrors({ recitation: 'Your recitation could not be uploaded.' });
        toast.error(`Your recitation could not be uploaded. ${getErrorMessage(error)}`);
        return;
      }
    }

    const documents: NonNullable<TeacherApplicationPayload['documents']> = {};
    const pendingDocuments = DOCUMENT_SLOTS.filter((slot) => documentFiles[slot.type]);
    if (pendingDocuments.length > 0) {
      setSubmitPhase('uploading-documents');
      for (const slot of pendingDocuments) {
        try {
          documents[slot.type] = await uploadFile('APPLICATION_DOCUMENT', documentFiles[slot.type]!);
        } catch (error) {
          setSubmitPhase('idle');
          setFieldErrors({ [`document_${slot.type}`]: `${slot.label} could not be uploaded.` });
          toast.error(`${slot.label} could not be uploaded. ${getErrorMessage(error)}`);
          return;
        }
      }
    }

    setSubmitPhase('submitting');
    const result = await submitTeacherApplication({
      applicantName: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      country, // ISO 3166-1 alpha-2
      recitationAudioKey,
      ...(Object.keys(documents).length > 0 ? { documents } : {}),
      qualifications: {
        gender,
        yearsExp,
        isHafiz,
        hasSanad,
        qiraat,
        ...(link ? { recitationLink: link } : {}),
        auditionMode,
      },
    });
    setSubmitPhase('idle');
    if (result.success) setSubmitted(true);
    else toast.error(result.message);
  };

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1">
        {/* Full-Width Grand Hero Banner */}
        <section className="bg-[#0f2c24] text-white py-14 md:py-20 relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="site-container relative z-10">
            
            {/* Breadcrumb Navigation */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#c4d3cd] mb-6">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              <Link href="/faculty" className="hover:text-white transition-colors">Faculty</Link>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              <span className="text-[#c49a55] font-medium">Join Academy Faculty</span>
            </nav>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
              <div className="max-w-3xl space-y-4">
                <h1 className="font-fraunces text-3xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-white leading-[1.1]">
                  Apply to Join the Hifzoon Faculty
                </h1>

                <p className="text-[#c4d3cd] text-base md:text-lg leading-relaxed max-w-2xl">
                  We invite certified, patient Huffaz and Tajweed scholars worldwide. Enjoy structured 1-on-1 teaching, punctual bi-weekly compensation, purpose-built classroom tools, and zero administrative burden.
                </p>

                {/* Key Faculty Highlights Chips */}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                    <DollarSign className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                    Punctual Bi-Weekly Payouts
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                    <BookOpen className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                    Built-in Digital Mushaf &amp; Qaida
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                    <Users className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                    Pre-Screened, Committed Students
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                    Safeguarding &amp; Sanad Verified
                  </span>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Full-Width Main Workspace */}
        <div className="site-container py-10 md:py-16">
          
          {/* 5-Step Academic Vetting Pipeline Banner (Full-Width) */}
          <div className="mb-10 p-5 sm:p-7 lg:p-8 rounded-[28px] bg-white border border-[#e6dfd1] shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 pb-4 border-b border-[#f3eee4] gap-2">
              <div>
                <h2 className="font-fraunces text-lg sm:text-xl text-[#10201b] font-medium">
                  Rigorous 5-Stage Faculty Selection Framework
                </h2>
                <p className="text-xs text-[#6b7772] mt-0.5">
                  Only educators with proven pedagogical patience and verified recitation are inducted.
                </p>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#f6ecd9] text-xs text-[#a97f3c] font-bold tracking-wide shrink-0">
                Acceptance Rate: &lt; 8% of applicants
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#f0f6f3] text-[#143a2f] border border-[#143a2f]/20">
                <span className="text-[10px] uppercase font-bold text-[#a97f3c] block">Stage 1</span>
                <span className="font-semibold block mt-1 text-sm">Application</span>
                <span className="text-[11px] text-[#6b7772]">Recitation &amp; Profile</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 2</span>
                <span className="font-semibold block mt-1 text-sm">Audio Audit</span>
                <span className="text-[11px] text-[#6b7772]">Tajweed Board Review</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 3</span>
                <span className="font-semibold block mt-1 text-sm">Live Demo</span>
                <span className="text-[11px] text-[#6b7772]">Classroom Pedagogy</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1]">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 4</span>
                <span className="font-semibold block mt-1 text-sm">Identity &amp; Sanad</span>
                <span className="text-[11px] text-[#6b7772]">Credential Audit</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#faf7f1] text-[#3c4a45] border border-[#e6dfd1] col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">Stage 5</span>
                <span className="font-semibold block mt-1 text-sm">Safeguarding</span>
                <span className="text-[11px] text-[#6b7772]">Child Safety Training</span>
              </div>
            </div>
          </div>

          {submitted ? (
            /* Success Confirmation State */
            <div className="bg-white rounded-[28px] border border-[#143a2f] p-8 sm:p-12 lg:p-16 shadow-card text-center space-y-5 max-w-3xl mx-auto">
              <div className="w-16 h-16 rounded-full bg-[#f0f6f3] text-[#1c4c3e] flex items-center justify-center mx-auto border border-[#c49a55] shadow-xs">
                <CheckCircle2 className="w-8 h-8 text-[#143a2f]" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-fraunces font-normal text-[#10201b]">
                Faculty Application Received
              </h2>
              <p className="text-sm sm:text-base text-[#6b7772] max-w-lg mx-auto leading-relaxed">
                JazakAllah Khayran, <strong className="text-[#10201b] font-semibold">{name}</strong>. Our Academic Review Board will audit your recitation recording and credentials. Qualified candidates receive an invitation for Stage 2 within 48 to 72 business hours.
              </p>
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button variant="green" size="default" href="/" className="font-semibold">
                  Return to Academy Homepage
                </Button>
                <Button variant="outline" size="default" href="/faculty">
                  View Current Faculty
                </Button>
              </div>
            </div>
          ) : (
            /* 2-Column Wide Workspace */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
              
              {/* Left Column: Comprehensive Application Form (8 cols) */}
              <div className="lg:col-span-8">
                <form 
                  onSubmit={handleSubmit} 
                  className="bg-white rounded-[28px] border border-[#e6dfd1] p-5 sm:p-8 lg:p-10 shadow-card space-y-8" 
                  noValidate
                >
                  
                  {/* Step 1: Personal & Contact Details */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-[#f3eee4]">
                      <div className="w-7 h-7 rounded-full bg-[#f0f6f3] text-[#143a2f] flex items-center justify-center text-xs font-bold">
                        1
                      </div>
                      <h3 className="font-fraunces text-lg text-[#10201b]">Personal &amp; Contact Details</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="apply-name" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                          Full Legal Name *
                        </label>
                        <input
                          id="apply-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Sheikh Bilal Ahmad"
                          aria-invalid={fieldErrors.name ? true : undefined}
                          aria-describedby={fieldErrors.name ? 'apply-name-error' : undefined}
                          className={`w-full h-[46px] min-h-[46px] max-h-[46px] px-4 rounded-full border ${fieldErrors.name ? 'border-red ring-1 ring-red/30' : 'border-[#e6dfd1]'} bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] transition-all`}
                        />
                        {fieldErrors.name && (
                          <p id="apply-name-error" className="text-xs text-red mt-1 font-medium">
                            {fieldErrors.name}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                          Faculty Designation *
                        </label>
                        <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => setGender('MALE')}
                            className={`min-h-[46px] py-2.5 px-3 rounded-full border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              gender === 'MALE' 
                                ? 'bg-[#143a2f] text-white border-[#143a2f] shadow-xs' 
                                : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white'
                            }`}
                          >
                            <span>Male (Ustadh)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setGender('FEMALE')}
                            className={`min-h-[46px] py-2.5 px-3 rounded-full border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              gender === 'FEMALE' 
                                ? 'bg-[#143a2f] text-white border-[#143a2f] shadow-xs' 
                                : 'bg-[#faf7f1] text-[#3c4a45] border-[#e6dfd1] hover:bg-white'
                            }`}
                          >
                            <span>Female (Ustadha)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="apply-email" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                          Email Address *
                        </label>
                        <input
                          id="apply-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="bilal@example.com"
                          aria-invalid={fieldErrors.email ? true : undefined}
                          aria-describedby={fieldErrors.email ? 'apply-email-error' : undefined}
                          className={`w-full h-[46px] min-h-[46px] max-h-[46px] px-4 rounded-full border ${fieldErrors.email ? 'border-red ring-1 ring-red/30' : 'border-[#e6dfd1]'} bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] transition-all`}
                        />
                        {fieldErrors.email && (
                          <p id="apply-email-error" className="text-xs text-red mt-1 font-medium">
                            {fieldErrors.email}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="apply-phone" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                          WhatsApp Contact Number *
                        </label>
                        <PhoneInput
                          id="apply-phone"
                          required
                          value={phone}
                          onChange={(val) => setPhone(val)}
                          placeholder="300 1234567"
                          defaultCountry="PK"
                          error={fieldErrors.phone}
                          aria-invalid={fieldErrors.phone ? true : undefined}
                          aria-describedby={fieldErrors.phone ? 'apply-phone-error' : undefined}
                        />
                        {fieldErrors.phone && (
                          <p id="apply-phone-error" className="text-xs text-red mt-1 font-medium">
                            {fieldErrors.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Qualifications & Academic Background */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-[#f3eee4]">
                      <div className="w-7 h-7 rounded-full bg-[#f0f6f3] text-[#143a2f] flex items-center justify-center text-xs font-bold">
                        2
                      </div>
                      <h3 className="font-fraunces text-lg text-[#10201b]">Teaching &amp; Quranic Qualifications</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div>
                        <label htmlFor="apply-country" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                          Country of Residence *
                        </label>
                        <CountrySelect
                          id="apply-country"
                          required
                          value={country}
                          onChange={(val) => setCountry(val)}
                          error={fieldErrors.country}
                          aria-invalid={fieldErrors.country ? true : undefined}
                          aria-describedby={fieldErrors.country ? 'apply-country-error' : undefined}
                        />
                        {fieldErrors.country && (
                          <p id="apply-country-error" className="text-xs text-red mt-1 font-medium">
                            {fieldErrors.country}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="apply-exp" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                          Online Teaching Exp *
                        </label>
                        <Select
                          id="apply-exp"
                          value={yearsExp}
                          onChange={(e) => setYearsExp(e.target.value)}
                          appearance="pill"
                          aria-label="Years of teaching experience"
                        >
                          <option value="1-3">1 – 3 Years</option>
                          <option value="3-5">3 – 5 Years</option>
                          <option value="5-8">5 – 8 Years</option>
                          <option value="8+">8+ Years Experience</option>
                        </Select>
                      </div>

                      <div>
                        <label htmlFor="apply-qiraat" className="block text-xs font-semibold text-[#10201b] uppercase tracking-wider mb-2">
                          Primary Qira’ah *
                        </label>
                        <input
                          id="apply-qiraat"
                          type="text"
                          value={qiraat}
                          onChange={(e) => setQiraat(e.target.value)}
                          placeholder="e.g. Hafs ‘an ‘Asim"
                          className="w-full h-[46px] min-h-[46px] max-h-[46px] px-4 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] transition-all"
                        />
                      </div>
                    </div>

                    {/* Hafiz & Sanad Badges */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <label className="flex items-center gap-3 p-4 rounded-2xl border border-[#e6dfd1] bg-[#faf7f1] cursor-pointer hover:bg-white hover:border-[#c49a55]/60 transition-all">
                        <input
                          type="checkbox"
                          checked={isHafiz}
                          onChange={(e) => setIsHafiz(e.target.checked)}
                          className="w-4 h-4 rounded text-[#143a2f] focus:ring-[#c49a55] accent-[#143a2f]"
                        />
                        <div>
                          <span className="block text-xs font-semibold text-[#10201b]">Hafiz of the Holy Quran</span>
                          <span className="block text-[11px] text-[#6b7772]">Full memorisation of the 30 Juz</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-4 rounded-2xl border border-[#e6dfd1] bg-[#faf7f1] cursor-pointer hover:bg-white hover:border-[#c49a55]/60 transition-all">
                        <input
                          type="checkbox"
                          checked={hasSanad}
                          onChange={(e) => setHasSanad(e.target.checked)}
                          className="w-4 h-4 rounded text-[#143a2f] focus:ring-[#c49a55] accent-[#143a2f]"
                        />
                        <div>
                          <span className="block text-xs font-semibold text-[#10201b]">Possess Verified Ijaza / Sanad</span>
                          <span className="block text-[11px] text-[#6b7772]">Connected chain of recitation transmission</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Step 3: Recitation Audit Sample */}
                  <div className="space-y-5">
                    <div className="flex items-center justify-between pb-2 border-b border-[#f3eee4]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#f0f6f3] text-[#143a2f] flex items-center justify-center text-xs font-bold">
                          3
                        </div>
                        <h3 className="font-fraunces text-lg text-[#10201b]">Voice Audition Sample *</h3>
                      </div>
                      <span className="text-[11px] text-[#6b7772]">Surah Al-Fatihah + 10 verses</span>
                    </div>

                    {/* Mode Selector Tabs */}
                    <div className="grid grid-cols-3 gap-2 p-1 rounded-full bg-[#faf7f1] border border-[#e6dfd1] text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setAuditionMode('RECORD')}
                        className={`min-h-[38px] rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          auditionMode === 'RECORD'
                            ? 'bg-[#143a2f] text-white shadow-xs'
                            : 'text-[#3c4a45] hover:text-[#10201b]'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Record Voice</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditionMode('UPLOAD')}
                        className={`min-h-[38px] rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          auditionMode === 'UPLOAD'
                            ? 'bg-[#143a2f] text-white shadow-xs'
                            : 'text-[#3c4a45] hover:text-[#10201b]'
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Upload Audio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditionMode('LINK')}
                        className={`min-h-[38px] rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          auditionMode === 'LINK'
                            ? 'bg-[#143a2f] text-white shadow-xs'
                            : 'text-[#3c4a45] hover:text-[#10201b]'
                        }`}
                      >
                        <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Paste Link</span>
                      </button>
                    </div>

                    {/* Tab 1: Live Voice Recording */}
                    {auditionMode === 'RECORD' && (
                      <div className="p-5 sm:p-6 rounded-2xl border border-[#e6dfd1] bg-[#faf7f1] space-y-4">
                        {recordingError && (
                          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-3.5">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <h5 className="font-semibold text-xs sm:text-sm text-amber-950">
                                  {recordingError.title}
                                </h5>
                                <p className="text-xs text-amber-800 leading-relaxed">
                                  {recordingError.message}
                                </p>
                              </div>
                            </div>

                            {recordingError.isPermissionDenied && (
                              <div className="p-3.5 rounded-xl bg-white/95 border border-amber-200/90 text-xs text-amber-950 space-y-2.5 shadow-xs">
                                <div className="font-semibold flex items-center gap-1.5 text-amber-950 text-xs">
                                  <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
                                  <span>How to allow microphone permission in your browser:</span>
                                </div>
                                <ol className="list-decimal pl-5 space-y-1.5 text-[11.5px] leading-relaxed text-amber-900/95">
                                  <li>Look at the address bar at the top of your browser (next to the site URL: <strong>localhost:3000</strong>).</li>
                                  <li>Click the <strong>Tune / Lock / Permissions</strong> icon (🔒, 🎙️, or ⚙️).</li>
                                  <li>Change <strong>Microphone</strong> from <em>Block</em> to <strong>Allow</strong> (or click <em>Reset permission</em>).</li>
                                  <li>Click the <strong>Request Permission Again</strong> button below to activate your microphone.</li>
                                </ol>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => requestMicrophonePermission(false)}
                                disabled={isRequestingPermission}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#143a2f] text-white text-xs font-semibold hover:bg-[#1a4a3c] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isRequestingPermission ? 'animate-spin' : ''}`} />
                                <span>{isRequestingPermission ? 'Requesting Permission...' : 'Request Permission Again'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => requestMicrophonePermission(true)}
                                disabled={isRequestingPermission}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-[#143a2f]/40 text-[#143a2f] text-xs font-semibold hover:bg-[#f0f6f3] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                              >
                                <Mic className="w-3.5 h-3.5 text-[#143a2f]" />
                                <span>Start Recording Directly</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setAuditionMode('UPLOAD')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-amber-300 text-amber-950 text-xs font-medium hover:bg-amber-100/60 transition-colors cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5 text-amber-700" />
                                <span>Upload Audio File Instead</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setAuditionMode('LINK')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-amber-300 text-amber-950 text-xs font-medium hover:bg-amber-100/60 transition-colors cursor-pointer"
                              >
                                <LinkIcon className="w-3.5 h-3.5 text-amber-700" />
                                <span>Paste Link Instead</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {!audioBlobUrl ? (
                          <div className="text-center py-4 space-y-3.5">
                            {isRecording ? (
                              <div className="space-y-4">
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red/15 text-red text-xs font-bold animate-pulse border border-red/30">
                                  <span className="w-2.5 h-2.5 rounded-full bg-red animate-ping" />
                                  <span>Recording in Progress: {formatTimer(recordingDuration)}</span>
                                </div>
                                <p className="text-xs text-[#3c4a45] max-w-md mx-auto leading-relaxed">
                                  Recite Surah Al-Fatihah clearly with Murattal pacing into your microphone.
                                </p>
                                <div>
                                  <button
                                    type="button"
                                    onClick={stopRecording}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-red text-white text-xs font-semibold hover:bg-red/90 transition-colors shadow-sm cursor-pointer"
                                  >
                                    <Square className="w-3.5 h-3.5 fill-current" />
                                    <span>Stop &amp; Save Recording</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3.5">
                                <div className="w-12 h-12 rounded-full bg-[#f0f6f3] text-[#143a2f] border border-[#143a2f]/20 flex items-center justify-center mx-auto shadow-xs">
                                  <Mic className="w-6 h-6 text-[#143a2f]" />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-sm text-[#10201b]">Direct Microphone Voice Recording</h4>
                                  <p className="text-xs text-[#6b7772] mt-0.5">
                                    Record your recitation sample directly in your browser.
                                  </p>
                                </div>

                                {/* Live Permission Status */}
                                <div className="flex items-center justify-center">
                                  {micPermissionState === 'granted' ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      Microphone Access Allowed
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-medium">
                                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                                      Microphone Permission Required
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={startRecording}
                                    disabled={isRequestingPermission}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#143a2f] text-white text-xs font-semibold hover:bg-[#1a4a3c] transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                                  >
                                    <Mic className="w-3.5 h-3.5" />
                                    <span>Start Voice Recording</span>
                                  </button>

                                  {micPermissionState !== 'granted' && (
                                    <button
                                      type="button"
                                      onClick={() => requestMicrophonePermission(false)}
                                      disabled={isRequestingPermission}
                                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[#e6dfd1] text-[#143a2f] text-xs font-semibold hover:bg-[#f0f6f3] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                                    >
                                      <ShieldCheck className="w-3.5 h-3.5 text-[#c49a55]" />
                                      <span>{isRequestingPermission ? 'Requesting...' : 'Request Permission'}</span>
                                    </button>
                                  )}
                                </div>

                                <p className="text-[11.5px] text-[#6b7772]">
                                  Prefer not to use microphone?{' '}
                                  <button
                                    type="button"
                                    onClick={() => setAuditionMode('UPLOAD')}
                                    className="font-semibold text-[#143a2f] underline decoration-[#c49a55] underline-offset-2 hover:text-[#c49a55] cursor-pointer"
                                  >
                                    Upload an audio file
                                  </button>{' '}
                                  or{' '}
                                  <button
                                    type="button"
                                    onClick={() => setAuditionMode('LINK')}
                                    className="font-semibold text-[#143a2f] underline decoration-[#c49a55] underline-offset-2 hover:text-[#c49a55] cursor-pointer"
                                  >
                                    paste a link
                                  </button>{' '}
                                  instead.
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#143a2f]">
                                <CheckCircle2 className="w-4 h-4 text-[#143a2f]" />
                                Voice Recitation Recorded ({formatTimer(recordingDuration)})
                              </span>
                              <button
                                type="button"
                                onClick={clearRecording}
                                className="inline-flex items-center gap-1 text-xs text-[#6b7772] hover:text-[#10201b] font-medium transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Record Again</span>
                              </button>
                            </div>
                            <audio controls src={audioBlobUrl} className="w-full rounded-xl" preload="metadata" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 2: Upload Audio File */}
                    {auditionMode === 'UPLOAD' && (
                      <div className="p-5 sm:p-6 rounded-2xl border border-[#e6dfd1] bg-[#faf7f1] space-y-4">
                        {!audioBlobUrl ? (
                          <label className="flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed border-[#d5cbbe] rounded-2xl bg-white hover:bg-[#f0f6f3]/40 hover:border-[#143a2f]/40 transition-colors cursor-pointer text-center">
                            <Upload className="w-8 h-8 text-[#143a2f] mb-2" />
                            <span className="text-xs font-semibold text-[#10201b]">Click or drag your audio file here</span>
                            <span className="text-[11px] text-[#6b7772] mt-0.5">Supports MP3, WAV, M4A, or WebM up to 25 MB</span>
                            <input
                              type="file"
                              aria-label="Recitation audio file"
                              accept={UPLOAD_ACCEPT.RECITATION_AUDIO}
                              onChange={handleFileUpload}
                              className="sr-only"
                            />
                          </label>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#143a2f] truncate max-w-xs">
                                <CheckCircle2 className="w-4 h-4 text-[#143a2f] shrink-0" />
                                <span className="truncate">{uploadedFileName || 'Audio File Uploaded'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={clearRecording}
                                className="inline-flex items-center gap-1 text-xs text-[#6b7772] hover:text-[#10201b] font-medium transition-colors cursor-pointer shrink-0"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Choose Different File</span>
                              </button>
                            </div>
                            <audio controls src={audioBlobUrl} className="w-full rounded-xl" preload="metadata" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 3: Paste External Link */}
                    {auditionMode === 'LINK' && (
                      <div className="space-y-2">
                        <div className="relative">
                          <LinkIcon className="w-4 h-4 text-[#6b7772] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="apply-recitation"
                            type="url"
                            value={recitationLink}
                            onChange={(e) => setRecitationLink(e.target.value)}
                            placeholder="https://drive.google.com/... or dropbox.com, youtube.com"
                            className="w-full h-[46px] min-h-[46px] max-h-[46px] pl-11 pr-4 rounded-full border border-[#e6dfd1] bg-[#faf7f1] text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55] text-[#10201b] transition-all"
                          />
                        </div>
                        <p className="text-[11px] text-[#6b7772]">
                          Please ensure permissions are set so anyone with the link can listen.
                        </p>
                      </div>
                    )}

                    {fieldErrors.recitation && (
                      <p className="text-xs text-red font-medium">
                        {fieldErrors.recitation}
                      </p>
                    )}
                  </div>

                  {/* Step 4: Supporting Documents (optional) */}
                  <div className="space-y-5">
                    <div className="flex items-center justify-between pb-2 border-b border-[#f3eee4]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#f0f6f3] text-[#143a2f] flex items-center justify-center text-xs font-bold">
                          4
                        </div>
                        <h3 className="font-fraunces text-lg text-[#10201b]">Supporting Documents</h3>
                      </div>
                      <span className="text-[11px] text-[#6b7772]">Optional · PDF, JPG or PNG up to 10 MB</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {DOCUMENT_SLOTS.map((slot) => {
                        const file = documentFiles[slot.type];
                        const error = fieldErrors[`document_${slot.type}`];
                        const inputId = `apply-document-${slot.type.toLowerCase()}`;
                        return (
                          <div
                            key={slot.type}
                            className={`p-4 rounded-2xl border ${error ? 'border-red ring-1 ring-red/30' : 'border-[#e6dfd1]'} bg-[#faf7f1] space-y-2`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="block text-xs font-semibold text-[#10201b]">{slot.label}</span>
                                <span className="block text-[11px] text-[#6b7772]">{slot.hint}</span>
                              </div>
                              {file && (
                                <button
                                  type="button"
                                  onClick={() => removeDocument(slot.type)}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center gap-1 text-[11px] text-[#6b7772] hover:text-[#10201b] font-medium transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Remove</span>
                                </button>
                              )}
                            </div>
                            {file ? (
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#143a2f] min-w-0">
                                <FileCheck className="w-4 h-4 text-[#143a2f] shrink-0" />
                                <span className="truncate">
                                  {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                                </span>
                              </span>
                            ) : (
                              <label
                                htmlFor={inputId}
                                className="flex items-center justify-center gap-1.5 min-h-[40px] px-3 border-2 border-dashed border-[#d5cbbe] rounded-xl bg-white hover:bg-[#f0f6f3]/40 hover:border-[#143a2f]/40 transition-colors cursor-pointer text-xs font-semibold text-[#143a2f]"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Choose file</span>
                                <input
                                  id={inputId}
                                  type="file"
                                  aria-label={`${slot.label} document`}
                                  aria-invalid={error ? true : undefined}
                                  accept={UPLOAD_ACCEPT.APPLICATION_DOCUMENT}
                                  onChange={(e) => handleDocumentChange(slot.type, e)}
                                  disabled={isSubmitting}
                                  className="sr-only"
                                />
                              </label>
                            )}
                            {error && <span className="sr-only">{error}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4 border-t border-[#f3eee4]">
                    <Button
                      variant="green"
                      size="default"
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full font-semibold min-h-[50px] text-sm sm:text-base justify-center shadow-md cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden />
                          <span>
                            {submitPhase === 'uploading-audio'
                              ? 'Uploading audio…'
                              : submitPhase === 'uploading-documents'
                                ? 'Uploading documents…'
                                : 'Submitting Application…'}
                          </span>
                        </>
                      ) : (
                        <span>Submit Application for Stage 1 Audit</span>
                      )}
                    </Button>
                    <p className="text-[11px] text-center text-[#6b7772] mt-3">
                      Submissions are governed by Hifzoon Faculty Data Protection &amp; Child Safeguarding protocols.
                    </p>
                  </div>
                </form>
              </div>

              {/* Right Column: Faculty Benefits & Standards Guide (4 cols) */}
              <aside className="lg:col-span-4 sticky top-24 space-y-6">
                
                {/* Faculty Benefits Card */}
                <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-7 shadow-card space-y-5">
                  <div className="flex items-center gap-3 pb-3 border-b border-[#f3eee4]">
                    <div className="w-10 h-10 rounded-2xl bg-[#f0f6f3] flex items-center justify-center text-[#143a2f] border border-[#c4d3cd]">
                      <GraduationCap className="w-5 h-5 text-[#143a2f]" />
                    </div>
                    <div>
                      <h4 className="font-fraunces text-lg text-[#10201b]">Why Scholars Join Us</h4>
                      <p className="text-xs text-[#6b7772]">Dignity, structure, and respect</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-xs text-[#3c4a45]">
                    <div className="flex items-start gap-3">
                      <DollarSign className="w-4 h-4 text-[#a97f3c] shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-[#10201b] font-semibold">Punctual Bi-Weekly Payouts</strong>
                        <p className="text-[#6b7772] mt-0.5 leading-relaxed">
                          Compensated every 14 days in US dollars via Wise or international wire without invoicing hassle.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <BookOpen className="w-4 h-4 text-[#a97f3c] shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-[#10201b] font-semibold">Purpose-Built Classroom</strong>
                        <p className="text-[#6b7772] mt-0.5 leading-relaxed">
                          Interactive digital Mushaf with word-level mistake tagging, Qaida charts, and automatic attendance.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Users className="w-4 h-4 text-[#a97f3c] shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-[#10201b] font-semibold">Committed Family Roster</strong>
                        <p className="text-[#6b7772] mt-0.5 leading-relaxed">
                          Zero marketing or lead generation required. Hifzoon matches serious families committed to consistent study.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Award className="w-4 h-4 text-[#a97f3c] shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-[#10201b] font-semibold">Sanad &amp; Ijaza Peer Circles</strong>
                        <p className="text-[#6b7772] mt-0.5 leading-relaxed">
                          Workshops and peer reviews with senior Azhari and Madani scholars to refine recitation chains.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recitation Checklist Card */}
                <div className="bg-[#f0f6f3] rounded-[28px] border border-[#c4d3cd] p-6 space-y-3">
                  <div className="flex items-center gap-2 text-[#143a2f]">
                    <Mic className="w-4 h-4 text-[#143a2f]" />
                    <h4 className="font-semibold text-xs uppercase tracking-wider">Recitation Audit Checklist</h4>
                  </div>
                  <ul className="space-y-2 text-xs text-[#3c4a45]">
                    <li className="flex items-start gap-2">
                      <span className="text-[#143a2f] font-bold">✓</span>
                      <span>Quiet room with clear audio (no heavy reverb).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#143a2f] font-bold">✓</span>
                      <span>Murattal pace with clear Makharij articulation.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#143a2f] font-bold">✓</span>
                      <span>Ensure link permissions allow anyone to listen.</span>
                    </li>
                  </ul>
                </div>

                {/* Safeguarding Commitment */}
                <div className="p-5 rounded-[24px] bg-white border border-[#e6dfd1] shadow-2xs space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-[#10201b] font-semibold">
                    <ShieldCheck className="w-4 h-4 text-[#143a2f]" />
                    <span>Safeguarding Vetting Notice</span>
                  </div>
                  <p className="text-[#6b7772] leading-relaxed text-[11px]">
                    All accepted instructors complete mandatory Child Safeguarding &amp; Online Protection certification prior to entering the classroom.
                  </p>
                  <Link 
                    href="/child-safety" 
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#143a2f] hover:underline pt-1"
                  >
                    Review Child Safeguarding Policy <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

              </aside>

            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
