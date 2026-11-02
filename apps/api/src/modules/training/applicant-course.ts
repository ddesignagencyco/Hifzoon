/**
 * The training an applicant completes at the TRAINING hiring step (CR-09): the teacher
 * terms and code of conduct, safeguarding, online boundaries, reporting, the platform's
 * own flows, and the child-protection standards families in the US and UK expect.
 *
 * DRAFT CONTENT. This text and the question bank are a working draft written to make the
 * flow real end to end. Before launch they must be replaced or signed off by the academy's
 * safeguarding lead (or an accredited provider); bump COURSE_VERSION when they change, so
 * every completion records exactly which version the teacher passed.
 *
 * No imports on purpose: the answer key lives only here, on the server, and is never sent
 * to a browser. Grading happens in ApplicantTrainingService.
 */

export const COURSE_CODE = 'APPLICANT_SAFEGUARDING_CORE';
export const COURSE_VERSION = '2026.11-draft.1';
export const TERMS_VERSION = 'teacher-terms-2026.11-draft.1';

/** Questions drawn per attempt, the pass mark, and the attempt rules. */
export const QUIZ_RULES = {
  QUESTIONS_PER_ATTEMPT: 10,
  PASS_PERCENT: 80,
  MAX_ATTEMPTS: 3,
  /** Wait after a failed attempt before the next one. */
  COOLDOWN_HOURS: 24,
  /** An attempt left open longer than this is graded as it stands. */
  ATTEMPT_MINUTES: 45,
  /** How long an emailed link stays valid. */
  LINK_DAYS: 14,
} as const;

export interface CourseModule {
  id: string;
  title: string;
  /** Paragraphs and bullet lists, rendered in order. */
  sections: Array<{ heading?: string; paragraphs?: string[]; bullets?: string[] }>;
  /** What the applicant ticks to confirm they read and understood the module. */
  acknowledgement: string;
}

export interface QuizQuestion {
  id: string;
  moduleId: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  /** Server only. */
  correct: string;
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

export const QUESTION_BANK: QuizQuestion[] = [
  {
    id: 'q1',
    moduleId: 'boundaries',
    correct: 'b',
    prompt: 'A student sends you a message on WhatsApp asking about homework. What do you do?',
    options: [
      { id: 'a', text: 'Reply briefly on WhatsApp, since it is only about homework.' },
      { id: 'b', text: 'Do not reply there; tell the academy and answer only through Hifzoon.' },
      { id: 'c', text: 'Save the number so you can remind them about classes.' },
      { id: 'd', text: 'Ask the parent to add you to the family group.' },
    ],
  },
  {
    id: 'q2',
    moduleId: 'report',
    correct: 'c',
    prompt:
      'During class a child says an adult at home hurts them and asks you to keep it a secret. What do you say?',
    options: [
      { id: 'a', text: '“I promise I won’t tell anyone.”' },
      { id: 'b', text: '“Are you sure? Maybe you misunderstood.”' },
      {
        id: 'c',
        text: '“Thank you for telling me. I can’t keep this secret, but I will tell someone whose job is to help.”',
      },
      { id: 'd', text: '“Let’s talk about it with your parents after class.”' },
    ],
  },
  {
    id: 'q3',
    moduleId: 'report',
    correct: 'a',
    prompt: 'After a disclosure, when and how should you report it?',
    options: [
      { id: 'a', text: 'The same day, through “Report a concern” on Hifzoon.' },
      { id: 'b', text: 'At the end of the month, in your teaching notes.' },
      { id: 'c', text: 'By calling the family to ask what happened first.' },
      { id: 'd', text: 'Only if the child mentions it again.' },
    ],
  },
  {
    id: 'q4',
    moduleId: 'report',
    correct: 'd',
    prompt: 'You believe a child is in immediate danger during a class. What comes first?',
    options: [
      { id: 'a', text: 'Finish the lesson card.' },
      { id: 'b', text: 'Send the family a message.' },
      { id: 'c', text: 'Wait for the safeguarding lead to call you.' },
      { id: 'd', text: 'Contact local emergency services, then report on Hifzoon.' },
    ],
  },
  {
    id: 'q5',
    moduleId: 'boundaries',
    correct: 'b',
    prompt: 'A parent asks you to record today’s class on your phone so the child can rewatch it.',
    options: [
      { id: 'a', text: 'Record it, since the parent asked.' },
      { id: 'b', text: 'Decline; recordings are made only by the platform, with consent on file.' },
      { id: 'c', text: 'Take screenshots instead of a video.' },
      { id: 'd', text: 'Record it and delete it after a week.' },
    ],
  },
  {
    id: 'q6',
    moduleId: 'recognise',
    correct: 'c',
    prompt:
      'Over several weeks a usually cheerful student becomes withdrawn and fearful. What should you do?',
    options: [
      { id: 'a', text: 'Nothing; children have bad weeks.' },
      { id: 'b', text: 'Ask the student detailed questions until they explain.' },
      { id: 'c', text: 'Note what you have seen and raise a concern on Hifzoon.' },
      { id: 'd', text: 'Mention it to another teacher in a group chat.' },
    ],
  },
  {
    id: 'q7',
    moduleId: 'recognise',
    correct: 'a',
    prompt: 'Which of these is a common sign of grooming?',
    options: [
      {
        id: 'a',
        text: 'An adult giving a child special attention and asking them to keep it secret.',
      },
      { id: 'b', text: 'A parent sitting in on a class.' },
      { id: 'c', text: 'A teacher setting regular homework.' },
      { id: 'd', text: 'A child asking to repeat a page.' },
    ],
  },
  {
    id: 'q8',
    moduleId: 'terms',
    correct: 'd',
    prompt: 'A family offers to pay you directly for extra classes at a lower price.',
    options: [
      { id: 'a', text: 'Accept, as long as the classes happen on Hifzoon.' },
      { id: 'b', text: 'Accept, but only for one month.' },
      { id: 'c', text: 'Accept a gift instead of money.' },
      { id: 'd', text: 'Decline; all payments go through Hifzoon. Tell the academy.' },
    ],
  },
  {
    id: 'q9',
    moduleId: 'terms',
    correct: 'b',
    prompt: 'You cannot make tomorrow’s class. What do you do?',
    options: [
      { id: 'a', text: 'Ask a friend who teaches Quran to cover it.' },
      { id: 'b', text: 'Tell the academy through the platform as early as you can.' },
      { id: 'c', text: 'Message the family privately to move it.' },
      { id: 'd', text: 'Skip it and make it up later without telling anyone.' },
    ],
  },
  {
    id: 'q10',
    moduleId: 'terms',
    correct: 'c',
    prompt:
      'A student keeps getting the same ayah wrong and you are frustrated. Which response is acceptable?',
    options: [
      { id: 'a', text: 'Raise your voice so they take it seriously.' },
      { id: 'b', text: 'Tell them they are not clever enough for Hifz.' },
      { id: 'c', text: 'Stay patient, break the ayah down, and log the mistake on the word.' },
      { id: 'd', text: 'End the class early as a punishment.' },
    ],
  },
  {
    id: 'q11',
    moduleId: 'platform',
    correct: 'a',
    prompt: 'Where do families see what was covered in a class?',
    options: [
      { id: 'a', text: 'On the lesson card you complete after the class.' },
      { id: 'b', text: 'In a WhatsApp message from the teacher.' },
      { id: 'c', text: 'Only if they ask the academy.' },
      { id: 'd', text: 'In your personal notebook.' },
    ],
  },
  {
    id: 'q12',
    moduleId: 'platform',
    correct: 'd',
    prompt: 'Families can only book you…',
    options: [
      { id: 'a', text: 'at any time of day.' },
      { id: 'b', text: 'after messaging you privately.' },
      { id: 'c', text: 'on weekends.' },
      { id: 'd', text: 'inside the hours you set on your Availability page.' },
    ],
  },
  {
    id: 'q13',
    moduleId: 'platform',
    correct: 'b',
    prompt: 'A student mispronounces a letter. What is the right way to record it?',
    options: [
      { id: 'a', text: 'Remember it and mention it next month.' },
      { id: 'b', text: 'Log the mistake on the exact word in the classroom as it happens.' },
      { id: 'c', text: 'Write it in the family chat.' },
      { id: 'd', text: 'Do not record it to avoid upsetting the student.' },
    ],
  },
  {
    id: 'q14',
    moduleId: 'standards',
    correct: 'c',
    prompt:
      'Under COPPA in the US, what is needed before collecting personal data from a child under 13?',
    options: [
      { id: 'a', text: 'Nothing, if the data is for teaching.' },
      { id: 'b', text: 'The child’s own agreement.' },
      { id: 'c', text: 'Verifiable consent from a parent.' },
      { id: 'd', text: 'The teacher’s permission.' },
    ],
  },
  {
    id: 'q15',
    moduleId: 'standards',
    correct: 'a',
    prompt:
      'You want to keep a list of your students’ names and ages on your own laptop to plan lessons.',
    options: [
      { id: 'a', text: 'Do not; keep student data only on the platform.' },
      { id: 'b', text: 'Fine, if the file has a password.' },
      { id: 'c', text: 'Fine, if you delete it every year.' },
      { id: 'd', text: 'Fine, if the parents do not mind.' },
    ],
  },
  {
    id: 'q16',
    moduleId: 'boundaries',
    correct: 'd',
    prompt: 'A 12-year-old student asks to follow you on Instagram.',
    options: [
      { id: 'a', text: 'Accept; it builds a good relationship.' },
      { id: 'b', text: 'Accept, but keep your account private.' },
      { id: 'c', text: 'Ask the parent first, then accept.' },
      { id: 'd', text: 'Kindly decline: all contact stays on Hifzoon.' },
    ],
  },
];
