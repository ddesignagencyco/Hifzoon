# **Hifzoon — Software Requirements Specification**

Oct 11, 2026 · @Zaini

## **1. Introduction**

**Purpose.** This document specifies what Hifzoon must do and how well it must do it, so that designers, developers, testers and the academy's management build and accept the same product. It turns the product vision in Online Quran Academy — Application Overview into numbered, testable requirements.

**Product scope.** Hifzoon is an online Quran academy platform. Vetted human teachers give live one-toone and small-group classes in a purpose-built classroom with a shared Mushaf. Between classes, students practise with an AI recitation coach. A Hifz engine tracks memorisation page by page, and parents see attendance, progress and recordings in their own portal. Hifzoon also runs the academy's business: admissions, scheduling, billing, teacher payroll and quality control.

**Out of scope for version 1:** an open marketplace where any teacher can sign up and sell classes; inperson (physical) classes; and Islamic content other than Quran, Arabic and Islamic Studies courses.

**Audience.** Product owner, UI/UX designers, engineering team, QA testers, the academic head (for curriculum and assessment rules), and any outside legal or privacy reviewer.

**Conventions.**

- Each requirement has an ID: FR (functional), NFR (non-functional), IR (interface), DR (data), CR (compliance), followed by an area code and a number, e.g. FR-CLS-04.

- **Priority:** Must (needed for launch of its phase), Should (important, may slip one phase), Could (nice to have).

- **Phase:** P1 = MVP (months 1–4), P2 = Grow (months 5–9), P3 = Differentiate (months 10–15), as in the overview's roadmap.

- "The system" means Hifzoon as a whole: web app, mobile apps, staff console and backend.

**References.**

- Hifzoon application overview (linked above).

- <u>Quran Foundation API reference and developer terms.</u>

- FTC amended COPPA Rule, fully enforceable from April 22, 2026 (summary).

- UK GDPR and the ICO's Age Appropriate Design Code (Children's Code); EU GDPR.

- WCAG 2.2 Level AA (accessibility).

## **2. Overall description**

**Product perspective.** Hifzoon is a new, self-contained product. It replaces the Zoom-plus-WhatsApp model used by many academies with one platform: every class, correction, practice session, payment and report lives in the same system and the same learning record.

**User classes.**

| User class             | Description                                                                        | Main goals                                                    | Device                                 |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| Child student (4–12)   | Learns Qaida, reading,<br>short surahs, Hifz;<br>often cannot read<br>English well | Join class easily,<br>practise, earn rewards                  | Tablet or parent's<br>phone; kids mode |
| Teen and adult student | Learns Tajweed, Hifz,<br>Arabic, Tafsir; includes<br>reverts                       | Flexible times, visible<br>progress, self-practice            | Phone, laptop                          |
| Parent / guardian      | Pays and monitors one<br>or more children                                          | Know the child is<br>learning; manage<br>schedule and payment | Phone                                  |
| Teacher                | Qualified Quran<br>teacher, mostly based<br>in Pakistan                            | Teach well, get paid on<br>time, less admin                   | Laptop or desktop                      |
| Examiner               | Senior teacher who<br>runs milestone exams                                         | Test students<br>objectively, issue<br>certificates           | Laptop                                 |
| Supervisor             | Academic head or<br>quality reviewer                                               | Keep teaching quality<br>high, handle<br>complaints           | Laptop                                 |
| Admin / operations     | Sales, scheduling,<br>finance and support<br>staff                                 | Convert trials, keep<br>classes filled, collect<br>payment    | Laptop                                 |
| Super admin            | Owner and technical<br>lead                                                        | Configure the platform,<br>roles and prices                   | Laptop                                 |

**Operating environment.**

- Web app: current and previous major versions of Chrome, Edge, Safari and Firefox on desktop and mobile.

- Mobile apps (P2): iOS 16+ and Android 10+.

- Teachers and students may be on unstable or slow connections (as low as about 1 Mbps).

- Users span time zones from UTC−8 (US west coast) to UTC+10 (Australia east coast).

#### **Design and implementation constraints.**

- The Quran text must come only from a verified, licensed source and must never be altered or generated by AI.

- Children's personal data, including voice recordings, must meet COPPA, UK and EU rules (section 8).

- Card payments need a payment company that serves the academy's registered business; Stripe does not serve Pakistan-registered companies, so the operating entity must be confirmed before billing is built.

- Video must work in a browser with no download for students.

**Assumptions and dependencies.**

- A licensed Mushaf text and font set (Madani and IndoPak) is obtained before P1 launch.

- A video provider (such as LiveKit or Agora) and WhatsApp Business API access are available.

- An Arabic speech model suitable for Quran recitation can be licensed or fine-tuned for the AI coach in P3.

- The academy supplies course syllabi, grading rubrics and teacher pay rules.

## **3. System context**

Hifzoon is the single system every user works in; it relies on six outside services for video, Quran content, payments, messaging, push notifications and (from P3) speech recognition.

<!-- Start of picture text -->

Qirva connects three user groups to six outside services<br>Outside services<br>Users Video provider<br>Qirva platform LiveKit or Agora<br>Students and guardians<br>Learn, practise, track webapp anc mobile apps)<br>GHUGEEED Quran content licence<br>Text, fonts, audio<br>Live classroom<br>Learning records Payment provider<br>Stripe, PayPal<br>Teachers and examiners Hifz engine<br>Teach, mark, assess Alrecitation—_ coach Email and WhatsApp<br>Scheduling and matching Reminders, alerts<br>Billing and payroll<br>Notifications App push services<br>Supervisors ‘Apple, Google<br>Run quality andand operations admin Admin,CRM and QA<br>Speech model (P3)<br>Recitation checking<br><!-- End of picture text -->

system context · 3 user groups, 6 outside services

Every arrow carries data both ways. Section 5 lists the interface requirements for each outside service, and section 4 the features inside the Hifzoon box.

## **4. Functional requirements**

### **4.1 Accounts, roles and consent (AUTH)**

| ID         | Requirement                                                                                                                                                                                          | Priority | Phase |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-AUTH-01 | Users can sign up and<br>sign in with email and<br>password, Google or<br>Apple; staff accounts<br>must use two-factor<br>sign-in.                                                                   | Must     | P1    |
| FR-AUTH-02 | The system supports<br>the roles in section 2,<br>and one person can<br>hold more than one<br>role (e.g. a teacher who<br>is also a parent).                                                         | Must     | P1    |
| FR-AUTH-03 | A family account has<br>one or more guardians<br>and one or more<br>students; a guardian<br>can add a child without<br>the child having an<br>email address.                                         | Must     | P1    |
| FR-AUTH-04 | For a student under 13,<br>the system records<br>verifiable parental<br>consent before<br>collecting any personal<br>data, with separate<br>opt-ins for class<br>recording and AI voice<br>practice. | Must     | P1    |
| FR-AUTH-05 | A guardian can view,<br>download and delete<br>their child's data, and<br>withdraw any consent,<br>from the parent portal.                                                                           | Must     | P1    |
| FR-AUTH-06 | A child signs in to kids<br>mode with a 4-digit PIN<br>orpicturepassword                                                                                                                             | Should   | P2    |

| ID         | Requirement                                                                                                 | Priority | Phase |
| ---------- | ----------------------------------------------------------------------------------------------------------- | -------- | ----- |
|            | chosen by the<br>guardian, on a device<br>the guardian has signed<br>in.                                    |          |       |
| FR-AUTH-07 | Sessions expire after 30<br>days of inactivity on<br>personal devices and<br>12 hours on staff<br>accounts. | Must     | P1    |

### **4.2 Public website and admissions (ADM)**

| ID        | Requirement                                                                                                                                                                                                                            | Priority | Phase |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-ADM-01 | The website shows<br>courses, teacher<br>profiles (photo, intro<br>video, recitation<br>sample, qualifications,<br>gender, languages),<br>pricing and FAQs;<br>pages are rendered on<br>the server so search<br>engines can read them. | Must     | P1    |
| FR-ADM-02 | Prices display in the<br>visitor's currency (USD,<br>GBP, CAD, AUD, AED,<br>PKR), chosen by<br>location with a manual<br>switch.                                                                                                       | Must     | P1    |
| FR-ADM-03 | A visitor can book a<br>free trial class by<br>choosing course,<br>student age, preferred<br>teacher gender and an<br>open slot shown in<br>their own time zone,<br>without entering a<br>card.                                        | Must     | P1    |
| FR-ADM-04 | The booking is<br>confirmed on screen                                                                                                                                                                                                  | Must     | P1    |

| ID        | Requirement                                                                                                                                                                            | Priority | Phase |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | and by email and<br>WhatsApp within 1<br>minute, with a join link<br>and a calendar file.                                                                                              |          |       |
| FR-ADM-05 | After the trial the<br>teacher records the<br>placement level and<br>recommended plan;<br>the family receives it<br>and a one-click link to<br>subscribe.                              | Must     | P1    |
| FR-ADM-06 | A family can request a<br>different teacher at any<br>time; the request goes<br>to admin with the<br>reason.                                                                           | Must     | P1    |
| FR-ADM-07 | An AI chat assistant on<br>the website and<br>WhatsApp answers<br>FAQs from approved<br>content, books trials,<br>and hands over to a<br>staff member on<br>request or when<br>unsure. | Should   | P2    |
| FR-ADM-08 | The site publishes a<br>blog, free printables<br>and country/city<br>landing pages managed<br>from the staff console.                                                                  | Should   | P1    |
| FR-ADM-09 | Teachers can apply<br>through a public form<br>(see FR-TCH-01).                                                                                                                        | Must     | P1    |

### **4.3 Scheduling and matching (SCH)**

| ID        | Requirement              | Priority | Phase |
| --------- | ------------------------ | -------- | ----- |
| FR-SCH-01 | Teachers set weekly      | Must     | P1    |
|           | availability; the system |          |       |

| ID        | Requirement                                                                                                                                                                                                    | Priority | Phase |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | stores all times in UTC<br>and shows each user<br>their local time.                                                                                                                                            |          |       |
| FR-SCH-02 | Recurring classes keep<br>the same local time for<br>the family when US,<br>UK, EU or Australian<br>clocks change, and the<br>system warns the<br>teacher of any resulting<br>clash at least 14 days<br>ahead. | Must     | P1    |
| FR-SCH-03 | Admin can match a<br>student to a teacher<br>using filters: course,<br>level, gender, language,<br>age group and<br>availability; the system<br>suggests the best 3<br>matches.                                | Must     | P1    |
| FR-SCH-04 | A family can reschedule<br>or cancel a class up to a<br>configurable notice<br>period (default 4<br>hours) and receives a<br>make-up credit; later<br>cancellations are<br>charged.                            | Must     | P1    |
| FR-SCH-05 | If a teacher marks<br>themselves absent, the<br>system offers the class<br>to qualified substitute<br>teachers in order and<br>notifies the family of<br>the change.                                           | Should   | P2    |
| FR-SCH-06 | Admin can set academy<br>holidays and a special<br>Ramadan timetable<br>that shifts recurring<br>classes for a date                                                                                            | Should   | P2    |

| ID        | Requirement                                                         | Priority | Phase |
| --------- | ------------------------------------------------------------------- | -------- | ----- |
|           | range.                                                              |          |       |
| FR-SCH-07 | The system prevents<br>double-booking of a<br>teacher or a student. | Must     | P1    |

### **4.4 Live classroom (CLS)**

| ID        | Requirement                                                                                                                                                               | Priority | Phase                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------- |
| FR-CLS-01 | Students join from a<br>link or the app with<br>one tap, in the<br>browser, with no<br>download; the room<br>opens 10 minutes<br>before the class.                        | Must     | P1                           |
| FR-CLS-02 | The room provides<br>two-way video and<br>audio, mute controls<br>and a device check<br>before joining.                                                                   | Must     | P1                           |
| FR-CLS-03 | Teacher and student<br>see the same Mushaf<br>page; when the teacher<br>turns the page or<br>highlights a word, the<br>student's screen<br>updates (see NFR-<br>PERF-02). | Must     | P1                           |
| FR-CLS-04 | The Mushaf supports<br>Madani 15-line and<br>IndoPak 13- and 16-line<br>layouts; the teacher's<br>choice applies to both<br>screens.                                      | Must     | P1 (Madani), P2<br>(IndoPak) |
| FR-CLS-05 | A Tajweed colour layer<br>can be switched on or<br>off by the teacher.                                                                                                    | Should   | P1                           |
| FR-CLS-06 | A digital Noorani Qaida<br>board with apointer is                                                                                                                         | Must     | P1                           |

| ID        | Requirement                                                                                                                         | Priority | Phase |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | available for beginner<br>lessons.                                                                                                  |          |       |
| FR-CLS-07 | The teacher has a pen<br>and highlighter over<br>the page; marks are<br>visible to the student<br>and cleared on page<br>change.    | Should   | P1    |
| FR-CLS-08 | Either side can play a<br>reference recitation of<br>any ayah from at least<br>3 qaris, with loop and<br>0.75× speed.               | Should   | P2    |
| FR-CLS-09 | Students can tap a<br>word to see its<br>meaning and<br>translation (in the<br>student's language).                                 | Could    | P2    |
| FR-CLS-10 | Group circles support<br>up to 8 students, a<br>recitation queue<br>managed by the<br>teacher, and hand-<br>raise.                  | Must     | P2    |
| FR-CLS-11 | If a connection is weak,<br>the room drops video<br>automatically and<br>keeps audio and<br>Mushaf sync working.                    | Must     | P1    |
| FR-CLS-12 | With consent (FR-<br>AUTH-04), the class is<br>recorded; the<br>recording is marked by<br>ayah so viewers can<br>jump to any point. | Must     | P2    |
| FR-CLS-13 | A guardian can join any<br>of their child's classes<br>in view-onlymode;the                                                         | Must     | P2    |

| ID        | Requirement                                                                                                                            | Priority | Phase |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | teacher sees that the<br>guardian is present.                                                                                          |          |       |
| FR-CLS-14 | Attendance (join time,<br>leave time, minutes<br>present) is recorded<br>automatically for each<br>participant.                        | Must     | P1    |
| FR-CLS-15 | Women-only circles<br>hide male staff from<br>the room except<br>supervisors whose role<br>allows it, as configured<br>by the academy. | Should   | P2    |

### **4.5 Lesson records and mistake logging (REC)**

| ID        | Requirement                                                                                                                                                                                                                 | Priority | Phase |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-REC-01 | During class the<br>teacher can tap a word<br>to mark a mistake and<br>choose a type: letter<br>(makhraj), vowel<br>(harakah), Tajweed<br>rule, skipped word,<br>added word, or stop<br>(waqf).                             | Must     | P1    |
| FR-REC-02 | Each mistake is stored<br>with student, lesson,<br>surah, ayah, word<br>position, type and<br>time.                                                                                                                         | Must     | P1    |
| FR-REC-03 | Before closing the class<br>the teacher completes<br>a lesson card: portions<br>covered (sabaq, sabqi,<br>manzil as surah and<br>ayah ranges), a grade<br>per portion (Excellent,<br>Good, Needs work,<br>Repeat),homework, | Must     | P1    |

| ID        | Requirement                                                                                                                                                                                   | Priority | Phase |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | and a note to parents.                                                                                                                                                                        |          |       |
| FR-REC-04 | The lesson card is pre-<br>filled from the class<br>(pages shown, mistakes<br>marked, attendance) so<br>the teacher only<br>confirms and adds<br>notes; it can be done in<br>under 2 minutes. | Must     | P1    |
| FR-REC-05 | The system drafts a<br>plain-language lesson<br>summary for parents<br>from the lesson card;<br>the teacher must<br>approve or edit it<br>before it is sent.                                  | Should   | P2    |
| FR-REC-06 | The lesson card is<br>shared with the parent<br>and student within 15<br>minutes of class end.                                                                                                | Must     | P1    |
| FR-REC-07 | A teacher can clip up to<br>60 seconds of a<br>recording and attach it<br>as practice material.                                                                                               | Could    | P2    |
| FR-REC-08 | Lesson records cannot<br>be edited after 48<br>hours except by a<br>supervisor, and every<br>edit is logged.                                                                                  | Must     | P1    |

### **4.6 Hifz engine (HFZ)**

| ID        | Requirement                                                                                                                                    | Priority | Phase |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-HFZ-01 | For each Hifz student<br>the system keeps a<br>state for every one of<br>the 604 Mushaf pages:<br>not started, in<br>progress, fragile, solid. | Must     | P2    |

| ID        | Requirement                                                                                                                                                         | Priority | Phase |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-HFZ-02 | Page state updates<br>automatically from<br>lesson grades and<br>mistake counts (class<br>and AI practice), using<br>rules the academic<br>head can configure.      | Must     | P2    |
| FR-HFZ-03 | Each day the system<br>proposes sabaq, sabqi<br>and manzil portions for<br>the student; the<br>teacher can accept or<br>change them.                                | Must     | P2    |
| FR-HFZ-04 | Manzil scheduling uses<br>spaced repetition:<br>pages with more<br>mistakes return<br>sooner, solid pages less<br>often.                                            | Should   | P2    |
| FR-HFZ-05 | Student, parent and<br>teacher see a heat map<br>of the Mushaf coloured<br>by page state.                                                                           | Should   | P2    |
| FR-HFZ-06 | A student or guardian<br>can set a goal (e.g.<br>finish Juz 30 by a date);<br>the system shows the<br>lines per day needed<br>and alerts when behind<br>for 7 days. | Should   | P2    |
| FR-HFZ-07 | The system alerts the<br>teacher when sabaq<br>grades are good but<br>manzil grades fall for 2<br>weeks in a row.                                                   | Should   | P2    |
| FR-HFZ-08 | Hifz students who have<br>finished can switch to a<br>Muraja'ah(revision-                                                                                           | Could    | P3    |

| ID  | Requirement | Priority | Phase |
| --- | ----------- | -------- | ----- |
|     | only) plan. |          |       |

### **4.7 AI recitation coach (AIC)**

| ID        | Requirement                                                                                                                                                               | Priority | Phase |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-AIC-01 | A teacher can assign<br>practice (surah and<br>ayah range, mode,<br>target minutes) that<br>appears on the<br>student's home screen.                                      | Must     | P3    |
| FR-AIC-02 | In reading mode the<br>student recites with<br>the text visible; the<br>coach follows word by<br>word and flags skipped,<br>added and wrong<br>words and wrong<br>vowels. | Must     | P3    |
| FR-AIC-03 | In memorisation mode<br>the text is hidden; the<br>student can reveal one<br>word at a time, and<br>reveals are counted.                                                  | Must     | P3    |
| FR-AIC-04 | For each flagged word<br>the student can hear<br>the correct recitation<br>and try again.                                                                                 | Must     | P3    |
| FR-AIC-05 | Tajweed-rule feedback<br>(e.g. madd length,<br>ghunnah, qalqalah) is<br>shown as a beta<br>suggestion with a<br>confidence level, never<br>as a grade.                    | Should   | P3    |
| FR-AIC-06 | Results (minutes,<br>words recited, mistakes<br>by type and location)<br>feed the learning                                                                                | Must     | P3    |

| ID        | Requirement                                                                                                              | Priority | Phase |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | -------- | ----- |
|           | record and the<br>teacher's pre-class<br>brief.                                                                          |          |       |
| FR-AIC-07 | The teacher can<br>confirm or dismiss any<br>AI-flagged mistake;<br>dismissed flags are<br>kept to improve the<br>model. | Should   | P3    |
| FR-AIC-08 | Voice search: the<br>student recites a<br>phrase and the system<br>finds the surah and<br>ayah.                          | Could    | P3    |
| FR-AIC-09 | The coach is disabled<br>for a child until the<br>guardian gives AI voice<br>consent (FR-AUTH-04).                       | Must     | P3    |

### **4.8 Courses and assessments (CRS)**

| ID        | Requirement                                                                                                                                                                                                                                       | Priority | Phase |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-CRS-01 | Admin can define<br>courses (Noorani<br>Qaida, Nazra, Tajweed<br>1–3, Hifz, Muraja'ah,<br>Ijazah, Quranic Arabic,<br>Translation and Tafsir,<br>Islamic Studies, New<br>Muslims, seasonal<br>intensives) as levels<br>made of ordered<br>lessons. | Must     | P1    |
| FR-CRS-02 | Each lesson holds<br>objectives, teacher<br>notes and attached<br>material; the next<br>lesson is shown to<br>whoever teaches the<br>student,includinga                                                                                           | Must     | P1    |

| ID        | Requirement                                                                                                                                                                              | Priority | Phase |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | substitute.                                                                                                                                                                              |          |       |
| FR-CRS-03 | Each level ends with an<br>assessment using a<br>rubric; passing moves<br>the student to the next<br>level.                                                                              | Must     | P2    |
| FR-CRS-04 | Milestone exams (e.g.<br>each juz completed)<br>are assigned to an<br>examiner who is not<br>the student's own<br>teacher.                                                               | Must     | P2    |
| FR-CRS-05 | Passing an assessment<br>or milestone generates<br>a certificate with<br>student and teacher<br>names, date, serial<br>number and a QR code<br>that opens a public<br>verification page. | Must     | P2    |
| FR-CRS-06 | The Ijazah track<br>records the full<br>recitation in sessions<br>and the sanad issued<br>by the sheikh.                                                                                 | Could    | P3    |

### **4.9 Parent portal (PAR)**

| ID        | Requirement                                                                                                                | Priority | Phase |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-PAR-01 | A family dashboard<br>shows every child with<br>next class, attendance<br>this month and<br>practice minutes this<br>week. | Must     | P1    |
| FR-PAR-02 | The guardian can open<br>each lesson card, and<br>(P2) its recording,<br>jumpingto anymarked                               | Must     | P1    |

| ID        | Requirement                                                                                                                                                                                                      | Priority | Phase |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | mistake.                                                                                                                                                                                                         |          |       |
| FR-PAR-03 | Charts show mistakes<br>per lesson and practice<br>minutes per week over<br>the last 3 months.                                                                                                                   | Should   | P2    |
| FR-PAR-04 | A monthly report card<br>combines figures<br>calculated from lesson<br>records with the<br>teacher's written<br>comments and 5 skill<br>ratings (fluency,<br>Tajweed,<br>memorisation, focus,<br>home practice). | Must     | P2    |
| FR-PAR-05 | The guardian can<br>reschedule, pause (up<br>to 30 days) or cancel a<br>plan, and request a<br>teacher change.                                                                                                   | Must     | P1    |
| FR-PAR-06 | The guardian can pay<br>invoices, update the<br>payment method and<br>download receipts and<br>certificates.                                                                                                     | Must     | P1    |
| FR-PAR-07 | The guardian can<br>message the teacher<br>inside Hifzoon;<br>messages are logged<br>and visible to<br>supervisors.                                                                                              | Must     | P1    |

### **4.10 Teacher portal (TCH)**

| ID        | Requirement                                                                             | Priority | Phase |
| --------- | --------------------------------------------------------------------------------------- | -------- | ----- |
| FR-TCH-01 | Applicants submit<br>details, qualification<br>documents and a<br>recitation recording; | Must     | P1    |

| ID        | Requirement                                                                                                                                            | Priority | Phase |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----- |
|           | admin tracks each<br>through recitation<br>review, demo class, ID<br>and reference checks,<br>and training, to<br>approved or rejected.                |          |       |
| FR-TCH-02 | A teacher cannot be<br>matched to students<br>until all hiring steps<br>and safeguarding<br>training are marked<br>complete.                           | Must     | P1    |
| FR-TCH-03 | The teacher sees a<br>daily timetable in local<br>time with one-tap join.                                                                              | Must     | P1    |
| FR-TCH-04 | Before each class the<br>teacher sees a pre-class<br>brief: last lesson card,<br>open homework,<br>recurring mistakes and<br>(P3) AI practice results. | Must     | P1    |
| FR-TCH-05 | The teacher can edit<br>their public profile,<br>subject to admin<br>approval of changes.                                                              | Should   | P1    |
| FR-TCH-06 | An earnings screen lists<br>classes taught,<br>deductions and<br>bonuses per pay<br>period, and payout<br>status.                                      | Must     | P1    |
| FR-TCH-07 | The teacher can mark<br>planned absence; the<br>system triggers<br>substitution (FR-SCH-<br>05).                                                       | Must     | P2    |
| FR-TCH-08 | Training courses and<br>quizzes(teaching                                                                                                               | Should   | P2    |

| ID  | Requirement                  | Priority | Phase |
| --- | ---------------------------- | -------- | ----- |
|     | methods, safeguarding)       |          |       |
|     | are assigned and<br>tracked. |          |       |

### **4.11 Supervisor and quality (QA)**

| ID       | Requirement                                                                                                                                                                                    | Priority | Phase |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-QA-01 | Each month the system<br>selects a random<br>sample of recorded<br>classes per teacher<br>(default 2) for review.                                                                              | Should   | P2    |
| FR-QA-02 | Supervisors score a<br>class against a<br>configurable rubric and<br>leave feedback the<br>teacher can see and<br>reply to.                                                                    | Must     | P2    |
| FR-QA-03 | A teacher scorecard<br>shows attendance,<br>punctuality, lesson-<br>card completion,<br>student retention,<br>parent ratings and<br>student progress.                                          | Must     | P2    |
| FR-QA-04 | Parents can rate each<br>class (1–5 stars,<br>optional comment)<br>after the lesson card<br>arrives.                                                                                           | Should   | P1    |
| FR-QA-05 | Complaints and<br>safeguarding reports<br>open a case with<br>status, owner, notes<br>and deadlines;<br>safeguarding cases are<br>visible only to the<br>safeguarding lead and<br>super admin. | Must     | P1    |

### **4.12 Admin and CRM (OPS)**

| ID        | Requirement                                                                                                                                              | Priority | Phase |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-OPS-01 | Every enquiry and trial<br>booking creates a lead<br>with source, status<br>(new, trial booked, trial<br>done, won, lost) and<br>owner.                  | Must     | P1    |
| FR-OPS-02 | The system creates<br>follow-up tasks for no-<br>shows and for trials not<br>converted within 3<br>days.                                                 | Should   | P1    |
| FR-OPS-03 | Admin can view and<br>manage all students,<br>families, teachers,<br>classes and<br>subscriptions, with<br>search and filters.                           | Must     | P1    |
| FR-OPS-04 | Dashboards show<br>active students, trials,<br>conversion rate, churn,<br>revenue, teacher<br>utilisation and class<br>completion, by week<br>and month. | Must     | P2    |
| FR-OPS-05 | Super admin can<br>configure prices, plans,<br>discounts, cancellation<br>rules, roles and<br>permissions without<br>code changes.                       | Must     | P1    |
| FR-OPS-06 | All admin actions on<br>personal or financial<br>data are written to an<br>audit log.                                                                    | Must     | P1    |

### **4.13 Billing and payroll (BIL)**

| ID  | Requirement | Priority | Phase |
| --- | ----------- | -------- | ----- |

| ID        | Requirement                                                                                                                                                    | Priority | Phase |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-BIL-01 | Families subscribe to<br>monthly plans (classes<br>per week, class length,<br>one-to-one or circle)<br>and pay by card, Apple<br>Pay, Google Pay or<br>PayPal. | Must     | P1    |
| FR-BIL-02 | Prepaid 3- and 6-<br>month plans and<br>sibling discounts apply<br>automatically.                                                                              | Should   | P1    |
| FR-BIL-03 | Failed payments are<br>retried 3 times over 7<br>days with reminders;<br>classes pause after the<br>final failure.                                             | Must     | P1    |
| FR-BIL-04 | Invoices and receipts<br>are issued<br>automatically with the<br>academy's details and<br>the currency paid.                                                   | Must     | P1    |
| FR-BIL-05 | Admin can issue full or<br>partial refunds and<br>class credits, with a<br>reason recorded.                                                                    | Must     | P1    |
| FR-BIL-06 | Teacher pay is<br>calculated per pay<br>period from classes<br>taught, using<br>configurable rates,<br>deductions (late or<br>missed classes) and<br>bonuses.  | Must     | P1    |
| FR-BIL-07 | Payroll is exported for<br>international payout<br>and marked paid;<br>teachers see the status.                                                                | Must     | P1    |
| FR-BIL-08 | Donors can fund                                                                                                                                                | Could    | P3    |

| ID  | Requirement                                                                                                  | Priority | Phase |
| --- | ------------------------------------------------------------------------------------------------------------ | -------- | ----- |
|     | sponsored seats; admin<br>assigns sponsored<br>students and donors<br>receive anonymous<br>progress updates. |          |       |

### **4.14 Notifications and messaging (NTF)**

| ID        | Requirement                                                                                                                                                                        | Priority | Phase                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------- |
| FR-NTF-01 | Reminders go out 24<br>hours and 15 minutes<br>before each class, by<br>the channels each user<br>chooses (email,<br>WhatsApp, push).                                              | Must     | P1 (email), P2<br>(WhatsApp, push) |
| FR-NTF-02 | Families are notified of<br>new lesson cards,<br>report cards, missed<br>classes, teacher<br>changes and payment<br>events.                                                        | Must     | P1                                 |
| FR-NTF-03 | All messages between<br>staff and families<br>happen inside Hifzoon<br>or through the<br>academy's official<br>WhatsApp number;<br>personal contact<br>details are never<br>shown. | Must     | P1                                 |
| FR-NTF-04 | Users can set quiet<br>hours and language for<br>notifications.                                                                                                                    | Should   | P2                                 |

### **4.15 Engagement (ENG)**

| ID        | Requirement                                                | Priority | Phase |
| --------- | ---------------------------------------------------------- | -------- | ----- |
| FR-ENG-01 | Kids mode shows a<br>simplified home<br>screen:join class, | Should   | P3    |

| ID        | Requirement                                                                                                                                                                     | Priority | Phase |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|           | today's practice, a<br>journey map that fills<br>as lessons are<br>completed, and earned<br>badges.                                                                             |          |       |
| FR-ENG-02 | Practice streaks and<br>badges are based on<br>effort (practice days,<br>lessons completed),<br>not on comparison<br>with other children;<br>any leaderboard is<br>family-only. | Should   | P3    |
| FR-ENG-03 | Teachers can award<br>stickers during class<br>that appear on the<br>student's profile.                                                                                         | Could    | P2    |
| FR-ENG-04 | Adults can set personal<br>goals, keep reflection<br>notes per ayah and<br>review vocabulary<br>flashcards from surahs<br>studied.                                              | Could    | P3    |
| FR-ENG-05 | Daily ayah, prayer<br>times, and a Ramadan<br>khatm planner are<br>available on the home<br>screen.                                                                             | Could    | P3    |
| FR-ENG-06 | Referral codes give the<br>referring and new<br>family a free week<br>each.                                                                                                     | Should   | P2    |

## **5. External interface requirements**

#### **User interfaces**

| ID       | Requirement       | Priority | Phase |
| -------- | ----------------- | -------- | ----- |
| IR-UI-01 | One design system | Must     | P1    |

| ID       | Requirement                                                                                                        | Priority | Phase |
| -------- | ------------------------------------------------------------------------------------------------------------------ | -------- | ----- |
|          | across web, mobile and<br>staff console, with light<br>and dark themes.                                            |          |       |
| IR-UI-02 | Every screen works at<br>phone width (360 px)<br>with no sideways<br>scrolling.                                    | Must     | P1    |
| IR-UI-03 | The interface supports<br>right-to-left layout for<br>Arabic and Urdu.                                             | Must     | P2    |
| IR-UI-04 | Kids mode uses large<br>touch targets (at least<br>48 px), icons with<br>spoken labels, and no<br>free-text input. | Should   | P3    |
| IR-UI-05 | Quran text is shown<br>only in approved<br>Mushaf fonts, never in<br>a system font or as<br>editable text.         | Must     | P1    |

#### **Hardware interfaces**

- IR-HW-01 (Must, P1): The system uses the device camera, microphone and speakers, and asks for permission with a plain explanation before first use.

- IR-HW-02 (Should, P1): The classroom supports a stylus or touchscreen for the teacher's pen.

#### **Software interfaces**

| ID       | External system                                                                               | Purpose                                  | Phase |
| -------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- | ----- |
| IR-SW-01 | Video provider (LiveKit<br>or Agora)                                                          | Live audio and video,<br>recording       | P1    |
| IR-SW-02 | Licensed Quran text,<br>fonts and audio (Quran<br>Foundation or King<br>Fahd Complex licence) | Mushaf, translations,<br>reference audio | P1    |
| IR-SW-03 | Payment provider<br>(Stripe and/or PayPal)                                                    | Subscriptions, refunds,<br>receipts      | P1    |
| IR-SW-04 | Email service                                                                                 | Transactional email                      | P1    |

| ID       | External system                                           | Purpose                              | Phase |
| -------- | --------------------------------------------------------- | ------------------------------------ | ----- |
| IR-SW-05 | WhatsApp Business API                                     | Reminders, alerts, chat<br>assistant | P2    |
| IR-SW-06 | Apple and Google push<br>services                         | App notifications                    | P2    |
| IR-SW-07 | Speech recognition<br>model (licensed or self-<br>hosted) | AI recitation coach                  | P3    |
| IR-SW-08 | Google and Apple sign-<br>in                              | Account sign-in                      | P1    |
| IR-SW-09 | Calendar files (iCal)                                     | Add classes to personal<br>calendars | P1    |

#### **Communication interfaces**

- IR-COM-01 (Must, P1): All traffic uses HTTPS (TLS 1.2 or later); live media uses encrypted WebRTC.

- IR-COM-02 (Must, P1): Mushaf page and highlight sync uses a persistent real-time connection (WebSocket or the video provider's data channel).

## **6. Non-functional requirements**

The figures below are starting targets for launch; the team should confirm them against real usage after the first 3 months.

| ID          | Category    | Requirement                                                                                                                  | Priority |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| NFR-PERF-01 | Performance | Website pages load in<br>under 2.5 seconds<br>(Largest Contentful<br>Paint) on a mid-range<br>phone over 4G.                 | Must     |
| NFR-PERF-02 | Performance | A page turn or word<br>highlight by the<br>teacher appears on the<br>student's screen within<br>500 ms for 95% of<br>events. | Must     |
| NFR-PERF-03 | Performance | Audio round-trip delay<br>in class stays under 400<br>ms for 95% of classes<br>between Pakistan and                          | Must     |

| ID          | Category     | Requirement                                                                                                                                                        | Priority |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
|             |              | North America, the UK<br>or Australia.                                                                                                                             |          |
| NFR-PERF-04 | Performance  | AI coach feedback for a<br>recited ayah appears<br>within 3 seconds of the<br>student stopping.                                                                    | Should   |
| NFR-CAP-01  | Capacity     | The P1 system supports<br>200 simultaneous<br>classes and 5,000<br>active students without<br>slowing; the design<br>scales to 10 times that<br>by adding servers. | Must     |
| NFR-AVL-01  | Availability | Classroom and sign-in<br>are available 99.9% of<br>each month, excluding<br>announced<br>maintenance.                                                              | Must     |
| NFR-AVL-02  | Availability | Maintenance happens<br>only in the lowest-use<br>window across time<br>zones and is<br>announced 48 hours<br>ahead.                                                | Must     |
| NFR-REL-01  | Reliability  | If a participant drops,<br>they can rejoin the<br>same class in under 10<br>seconds with the same<br>Mushaf page.                                                  | Must     |
| NFR-SEC-01  | Security     | Passwords are hashed<br>with a modern<br>algorithm (bcrypt or<br>Argon2); data is<br>encrypted at rest and<br>in transit.                                          | Must     |
| NFR-SEC-02  | Security     | Access follows least<br>privilege by role; a<br>teacher sees onlytheir                                                                                             | Must     |

| ID          | Category        | Requirement                                                                                                                                         | Priority |
| ----------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
|             |                 | own students.                                                                                                                                       |          |
| NFR-SEC-03  | Security        | An independent<br>penetration test is<br>passed before P1<br>launch and each year<br>after.                                                         | Must     |
| NFR-SEC-04  | Security        | Sign-in is rate-limited<br>and locks after 10<br>failed attempts, with<br>email recovery.                                                           | Must     |
| NFR-PRV-01  | Privacy         | Personal data is<br>collected only for a<br>stated purpose and<br>deleted when no<br>longer needed (section<br>7).                                  | Must     |
| NFR-USE-01  | Usability       | A first-time parent can<br>book a trial in under 2<br>minutes without help<br>in usability testing.                                                 | Must     |
| NFR-USE-02  | Usability       | A child aged 6 can join<br>a class from kids mode<br>without adult help<br>after one guided try.                                                    | Should   |
| NFR-ACC-01  | Accessibility   | Web and app screens<br>meet WCAG 2.2 Level<br>AA.                                                                                                   | Should   |
| NFR-L10N-01 | Localisation    | Interface available in<br>English at P1; Urdu and<br>Arabic at P2; French at<br>P3. All dates, times and<br>currencies follow the<br>user's locale. | Must     |
| NFR-MNT-01  | Maintainability | Automated tests cover<br>at least 70% of backend<br>code; every release<br>passes tests in a<br>stagingenvironment                                  | Should   |

| ID          | Category        | Requirement                                                                                           | Priority |
| ----------- | --------------- | ----------------------------------------------------------------------------------------------------- | -------- |
|             |                 | first.                                                                                                |          |
| NFR-MNT-02  | Maintainability | Errors and<br>performance are<br>monitored with alerts<br>to the on-call<br>developer.                | Must     |
| NFR-PORT-01 | Portability     | The backend runs in<br>containers and can<br>move between cloud<br>providers without code<br>changes. | Could    |

## **7. Data requirements**

**Core entities.** The learning record links every class, mistake and practice session to a student and to exact positions in the Mushaf.

| Entity                  | Key fields                                                        | Linked to                       |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------- |
| User                    | Name, email, phone, roles,<br>language, time zone                 | Family, Teacher profile         |
| Family                  | Guardians, students, billing<br>details, consents                 | Users, Subscriptions            |
| Student                 | Name, birth year, level per<br>course, kids-mode settings         | Family, Enrolments              |
| Teacher profile         | Qualifications, hiring status,<br>availability, pay rate, ratings | User, Classes                   |
| Course / Level / Lesson | Title, order, objectives,<br>materials, rubric                    | Enrolments                      |
| Enrolment               | Student, course, current level,<br>teacher, plan                  | Student, Course, Subscription   |
| Class session           | Time, teacher, students, room,<br>attendance, recording           | Enrolment, Lesson card          |
| Lesson card             | Portions (surah:ayah ranges),<br>grades, homework, notes          | Class session                   |
| Mistake                 | Student, surah, ayah, word<br>index,type,source(class or AI),     | Lesson card or Practice session |

| Entity                              | Key fields                                                     | Linked to         |
| ----------------------------------- | -------------------------------------------------------------- | ----------------- |
|                                     | confirmed                                                      |                   |
| Page state                          | Student, page number (1–604),<br>state, last revised, next due | Student           |
| Practice session                    | Assignment, mode, minutes,<br>results, audio reference         | Student, Mistakes |
| Assessment / Certificate            | Rubric scores, examiner, result,<br>serial number              | Enrolment         |
| Subscription / Invoice /<br>Payment | Plan, price, currency, status                                  | Family            |
| Payroll entry                       | Teacher, period, classes,<br>deductions, bonuses, status       | Teacher profile   |
| Case                                | Type (complaint, safeguarding),<br>status, owner, notes        | Users             |
| Audit log                           | Actor, action, target, time                                    | All               |

**Retention.** Starting rules for legal review:

| Data                                                                   | Kept for                                                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Class recordings                                                       | 90 days, then deleted automatically (supervisor-<br>flagged recordings kept until the case closes) |
| AI practice audio                                                      | 30 days, then deleted; derived results (mistakes,<br>minutes) kept with the learning record        |
| Learning record (lesson cards, mistakes, page<br>states, certificates) | While the account is active, plus 2 years, unless<br>the guardian asks for deletion                |
| Financial records                                                      | As required by tax law in the operating country<br>(commonly 6–7 years)                            |
| Leads that never enrolled                                              | 12 months                                                                                          |
| Audit logs                                                             | 3 years                                                                                            |

**Backup and recovery.**

- DR-01 (Must): Databases are backed up continuously with point-in-time recovery for 14 days.

- DR-02 (Must): After a major failure, service is restored within 4 hours with no more than 15 minutes of data lost.

- DR-03 (Must): Backups are encrypted and stored in a separate region; a restore is tested every quarter.

## **8. Safety, privacy and compliance requirements**

Most Hifzoon students are children, so these requirements gate every release: a phase does not launch until its compliance items pass.

| ID    | Requirement                                                                                                                                                                                                                                | Priority | Phase |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----- |
| CR-01 | Meet the amended US<br>COPPA Rule<br>(enforceable since April<br>22, 2026): direct notice<br>to parents, verifiable<br>parental consent, and<br>separate consent for<br>any use not essential to<br>the service.                           | Must     | P1    |
| CR-02 | Treat voice and face<br>data (recordings, AI<br>practice audio) as<br>biometric personal<br>information, which the<br>amended COPPA Rule<br>now covers; collect it<br>only with consent and<br>follow the retention<br>table in section 7. | Must     | P1    |
| CR-03 | Keep a written<br>information security<br>programme and a<br>written data retention<br>policy, as the amended<br>COPPA Rule requires.                                                                                                      | Must     | P1    |
| CR-04 | Meet UK GDPR and the<br>Children's Code for UK<br>users: high-privacy<br>defaults, no nudging<br>children to share data,<br>a data protection<br>impact assessment.                                                                        | Must     | P1    |
| CR-05 | Meet EU GDPR for EU<br>users, including data<br>export and deletion on<br>request within 30 days.                                                                                                                                          | Must     | P1    |

| ID    | Requirement                                                                                                                                                                                                      | Priority | Phase |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| CR-06 | Children's data is never<br>used for advertising or<br>sold, and is never used<br>to train the AI model<br>without separate<br>guardian consent.                                                                 | Must     | P1    |
| CR-07 | No direct contact<br>between staff and<br>children outside<br>Hifzoon; the platform<br>hides personal phone<br>numbers and emails.                                                                               | Must     | P1    |
| CR-08 | A report button in<br>every class, chat and<br>profile sends a case to<br>the named<br>safeguarding lead, who<br>is alerted within 15<br>minutes.                                                                | Must     | P1    |
| CR-09 | Every teacher passes<br>identity, reference and<br>(where available)<br>criminal background<br>checks and<br>safeguarding training<br>before teaching.                                                           | Must     | P1    |
| CR-10 | Guardians are linked to<br>a child only after<br>verification; no one can<br>view a child who is not<br>theirs.                                                                                                  | Must     | P1    |
| CR-11 | Quran text, fonts and<br>audio are used under<br>licence: the text is<br>never altered, and<br>caching follows the<br>provider's terms (the<br>Quran Foundation<br>terms limit caching to<br>one week and need a | Must     | P1    |

| ID    | Requirement                                                                                                                   | Priority | Phase |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
|       | separate commercial<br>licence).                                                                                              |          |       |
| CR-12 | Terms of service,<br>privacy policy, child<br>safety policy and<br>refund policy are<br>published and<br>accepted at sign-up. | Must     | P1    |
| CR-13 | Before launch, a<br>privacy lawyer reviews<br>the consent flows,<br>policies and retention<br>rules.                          | Must     | P1    |

## **9. Release plan and acceptance criteria**

Hifzoon ships in three phases; the phase column in section 4 assigns every requirement to one of them, and each phase opens only when the previous gate is met.

<!-- Start of picture text -->

Qirva ships in three phases; each opens only when its gate passes<br>Scope by phase; month counts are estimates for a small team<br>P1MvP P2 Grow P3 Differentiate<br>Months 1to 4 Months 5 to9 Months10 to 15<br>Accounts, consent, website Mobile apps, IndoPak Mushaf Alrecitation coach<br>Trial booking, scheduling Hifz engine, assessments Tajweed feedback (beta)<br>Classroom: Mushaf, marking Recordings, parent sit-in Kids mode, badges, goals<br>Lesson cards, parent portal Circles, substitutes, QA Ijazah track, sponsorship<br>Billing, payroll, hiring WhatsApp, Urdu and Arabic French, Muraja‘ah plan<br>@ Cate 50 paying families, Gate: 300 active students, Gate: Al checks match<br>classes run fully in-app teachers log every class teacherona te s t set<br><!-- End of picture text -->

release plan · 3 phases, 3 gates

Gates: 50 paying families with every class run in Hifzoon before P2; 300 active students with teachers completing a lesson card for every class before P3; AI checks agreeing with teachers on a test set of recitations before the AI coach opens to all students.

#### **A requirement is accepted when:**

- it has at least one written test case linked to its ID;

- the test passes in the staging environment;

- the product owner signs it off after a demo.

#### **A phase is ready to release when:**

1. Every Must requirement in that phase is accepted.

2. Every compliance item (section 8) for that phase passes, including the privacy lawyer's review.

3. A load test meets the section 6 targets (for P1: 200 simultaneous classes).

4. An independent security test finds no open critical or high issues.

5. Usability tests with at least 5 parents, 5 children and 3 teachers meet NFR-USE-01 and NFR-USE02.

6. A pilot with about 10 families and 3 teachers runs for 2 weeks with no class lost to a platform fault.

**Traceability.** Every requirement ID is carried into the design files, the task tracker and the test cases, so any change can be traced back to this document.

## **10. Glossary and open questions**

| Term           | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Sabaq          | The new portion being memorised today                                                             |
| Sabqi          | Recent revision: the portion currently being<br>consolidated                                      |
| Manzil         | Long-term revision of everything memorised<br>earlier                                             |
| Hifz / Hafiz   | Memorising the whole Quran / a person who has<br>done so                                          |
| Muraja'ah      | Ongoing revision after Hifz is complete                                                           |
| Nazra          | Reading the Quran from the text, without<br>memorising                                            |
| Noorani Qaida  | Beginner's primer for Arabic letters and reading<br>rules                                         |
| Tajweed        | Rules for correct pronunciation of the Quran                                                      |
| Makhraj        | The point in the mouth or throat where a letter is<br>pronounced                                  |
| Harakah        | A short vowel mark (fatha, kasra, damma)                                                          |
| Waqf           | Stopping or pausing correctly while reciting                                                      |
| Ijazah / Sanad | Certificate to recite and teach / the chain of<br>teachers back to the Prophet صلى الله عليه وسلم |
| Mushaf         | A printed or digital copy of the Quran in a fixed                                                 |

| Term             | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
|                  | page layout                                                        |
| Madani / IndoPak | The two main Mushaf scripts and layouts used by<br>Hifzoon's users |
| Circle           | A small live group class (up to 8 students)                        |
| Lesson card      | The record a teacher completes at the end of<br>each class         |

**Open questions to settle before P1 build**

- ☐ In which country will Hifzoon's operating company be registered, and which payment provider will it use?

- ☐ Which Quran text and font licence will be used (Quran Foundation commercial licence or King Fahd Complex)?

- ☐ Which video provider: LiveKit (self-hosted, lower cost at scale) or Agora (managed, faster start)?

- ☐ Final prices and teacher pay rates per plan and currency.

- ☐ Will circles be single-gender by default for children over a set age, and from what age?

- ☐ Who is the named safeguarding lead, and what is the out-of-hours escalation route?

- ☐ Has "Hifzoon" been cleared for trademark in the US, UK and Pakistan, and are the domain and app-store names secured?
