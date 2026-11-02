/**
 * The training an applicant completes at the TRAINING hiring step (CR-09): the teacher
 * terms and code of conduct, safeguarding, online boundaries, reporting, the platform's
 * own flows, and the child-protection standards families in the US and UK expect.
 *
 * DRAFT CONTENT. This text is a working draft written to make the flow real end to end.
 * Before launch it must be replaced or signed off by the academy's safeguarding lead (or an
 * accredited provider); bump COURSE_VERSION when it changes, so every completion records
 * exactly which version the teacher completed.
 */

export const COURSE_CODE = 'APPLICANT_SAFEGUARDING_CORE';
export const COURSE_VERSION = '2026.11-draft.1';
export const TERMS_VERSION = 'teacher-terms-2026.11-draft.1';

/** How long an emailed training link stays valid. */
export const TRAINING_LINK_DAYS = 14;

export interface CourseModule {
  id: string;
  title: string;
  /** Paragraphs and bullet lists, rendered in order. */
  sections: Array<{ heading?: string; paragraphs?: string[]; bullets?: string[] }>;
  /** What the applicant ticks to confirm they read and understood the module. */
  acknowledgement: string;
}

export const COURSE_MODULES: CourseModule[] = [
  {
    id: 'terms',
    title: 'Teacher terms and code of conduct',
    sections: [
      {
        paragraphs: [
          'Hifzoon teachers teach children and adults one-to-one, live, from their homes. Families trust us with their children and their data. These terms set out what we expect of every teacher, every class.',
        ],
      },
      {
        heading: 'Every class',
        bullets: [
          'Join the classroom on time, from a quiet, appropriate room, dressed modestly, with your camera on.',
          'Teach only inside the Hifzoon classroom. Never move a class to WhatsApp, Zoom, a phone call or any other app.',
          'Record every lesson card honestly: what was covered, mistakes, attendance. Records are part of the child’s file and are audited.',
          'If you cannot make a class, tell the academy through the platform as early as you can; never arrange a swap privately.',
        ],
      },
      {
        heading: 'Conduct',
        bullets: [
          'Speak to every student with patience and respect. No shouting, humiliation, threats or physical punishment of any kind, ever.',
          'Do not ask a student for personal details, photos, social-media accounts or contact numbers.',
          'Do not accept gifts or payments from families directly. All payments go through Hifzoon.',
          'Keep what you learn about a family confidential. Do not discuss students outside the academy.',
        ],
      },
      {
        heading: 'Breaches',
        paragraphs: [
          'Breaking these terms can mean removal from matching, suspension, or ending your work with Hifzoon. A safeguarding breach is always referred to the safeguarding lead and, where the law requires, to the authorities.',
        ],
      },
    ],
    acknowledgement:
      'I have read the teacher terms and code of conduct and I will follow them in every class.',
  },
  {
    id: 'recognise',
    title: 'Safeguarding: recognising abuse and grooming',
    sections: [
      {
        paragraphs: [
          'Safeguarding means protecting children from harm and acting when you are worried. You do not have to be certain something is wrong to raise a concern; you have to be alert.',
        ],
      },
      {
        heading: 'Signs that may point to harm',
        bullets: [
          'Changes in behaviour: becoming withdrawn, fearful, anxious, or unusually aggressive.',
          'Unexplained injuries, or explanations that do not fit the injury.',
          'A child who seems hungry, very tired, or neglected over many classes.',
          'A child who talks about being hurt, threatened, or kept secret from others.',
        ],
      },
      {
        heading: 'Grooming',
        paragraphs: [
          'Grooming is when someone builds trust with a child to exploit them. Online it often starts with flattery, gifts, special attention, moving the conversation somewhere private, and asking the child to keep it secret. As a teacher you must never behave in any way that looks like this, and you must report it if you see signs that someone else is doing it.',
        ],
      },
    ],
    acknowledgement:
      'I understand the signs of abuse and grooming and that a worry is enough to report.',
  },
  {
    id: 'boundaries',
    title: 'Online boundaries',
    sections: [
      {
        bullets: [
          'All contact with a student or family happens on Hifzoon: the classroom and platform messages. No private numbers, no social media, no email outside the platform.',
          'Never be alone on camera with a child in a way the family cannot see: guardians may watch any class and the platform allows it.',
          'Do not record, screenshot or photograph a student. Class recordings, where the family has consented, are made by the platform only.',
          'If a student contacts you privately (for example on WhatsApp), do not reply there. Tell the academy, and continue only on Hifzoon.',
          'Keep your own background, camera framing and language appropriate for children.',
        ],
      },
    ],
    acknowledgement:
      'I will keep all contact on Hifzoon and never record or contact a student privately.',
  },
  {
    id: 'report',
    title: 'When a child tells you something: disclosure and reporting',
    sections: [
      {
        heading: 'If a child discloses harm',
        bullets: [
          'Stay calm, listen, and let them speak in their own words. Do not ask leading questions.',
          'Never promise to keep it a secret. Say that you will need to tell someone whose job is to help.',
          'Reassure them they did the right thing by telling you.',
          'Write down what was said, in their words, as soon as the class ends.',
        ],
      },
      {
        heading: 'How to report on Hifzoon',
        paragraphs: [
          'Use “Report a concern” in your teacher portal straight away, the same day. It goes to the academy’s safeguarding lead, who is alerted within 15 minutes. Do not investigate yourself, and do not contact the family about it.',
          'If a child is in immediate danger, contact the local emergency services first (for example 911 in the US, 999 in the UK), then report on Hifzoon.',
        ],
      },
    ],
    acknowledgement:
      'I know how to respond to a disclosure and I will report every concern on Hifzoon the same day.',
  },
  {
    id: 'platform',
    title: 'Using the Hifzoon platform',
    sections: [
      {
        heading: 'Your teacher portal',
        bullets: [
          'Today: your classes for the day and the week, each with a pre-class brief about the student.',
          'Availability: set your teaching hours for each month and mark days off. Families can only book you inside these hours.',
          'Timetable: every booked class, in your own time zone.',
          'Students and messages: student context and the only approved way to message a family.',
        ],
      },
      {
        heading: 'In the classroom',
        bullets: [
          'Open the classroom from the class card; it opens 10 minutes before the start.',
          'The Mushaf is shared and synchronised: you turn pages and highlight for the student.',
          'Log mistakes on the exact word as they happen, so the student’s Hifz record is accurate.',
          'Finish with the lesson card: portions covered, grade, homework. Families see it.',
        ],
      },
    ],
    acknowledgement: 'I understand how to use my portal, the classroom and lesson cards.',
  },
  {
    id: 'standards',
    title: 'Child-protection and privacy standards (US and UK)',
    sections: [
      {
        paragraphs: [
          'Hifzoon serves families in several countries. Two standards shape how we work. This is awareness training, not legal advice; the academy’s safeguarding lead is your point of contact for any question.',
        ],
      },
      {
        heading: 'Children’s data',
        bullets: [
          'In the US, COPPA requires verifiable parental consent before collecting personal data from children under 13. In the UK, the Children’s Code sets similar expectations.',
          'Hifzoon collects only what is needed and records the family’s consent choices. Do not collect or keep any student data outside the platform.',
        ],
      },
      {
        heading: 'Reporting duties',
        bullets: [
          'Many US states treat teachers as mandated reporters of suspected child abuse; UK guidance expects everyone working with children to share concerns promptly.',
          'On Hifzoon, the duty is simple: report every concern through the platform the same day, and in an emergency call local emergency services first.',
        ],
      },
    ],
    acknowledgement: 'I understand Hifzoon’s duties on children’s data and on reporting concerns.',
  },
];
