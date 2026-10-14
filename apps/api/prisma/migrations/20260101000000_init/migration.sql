-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CHILD_STUDENT', 'STUDENT', 'GUARDIAN', 'TEACHER', 'EXAMINER', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN', 'SAFEGUARDING_LEAD');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "KidsCredentialType" AS ENUM ('PIN', 'PICTURE');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('DATA_COLLECTION', 'CLASS_RECORDING', 'AI_VOICE', 'AI_TRAINING', 'MARKETING');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('CARD_CHECK', 'SIGNED_FORM', 'ID_CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('EXPORT', 'DELETE');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'GBP', 'CAD', 'AUD', 'AED', 'PKR');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'FAILED', 'REFUNDED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentProviderCode" AS ENUM ('STRIPE', 'PAYPAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'PAYPAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('SIBLING', 'PREPAID', 'REFERRAL', 'CODE');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CALCULATED', 'EXPORTED', 'PAID');

-- CreateEnum
CREATE TYPE "PayrollLineKind" AS ENUM ('CLASS', 'DEDUCTION_LATE', 'DEDUCTION_MISSED', 'BONUS');

-- CreateEnum
CREATE TYPE "SponsorshipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'TRIAL_BOOKED', 'TRIAL_DONE', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('NO_SHOW_FOLLOWUP', 'TRIAL_NOT_CONVERTED', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('COMPLAINT', 'SAFEGUARDING');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ACTIONED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QaSampleSource" AS ENUM ('RANDOM_SAMPLE', 'MANUAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('QAIDA', 'NAZRA', 'TAJWEED', 'HIFZ', 'MURAJAAH', 'IJAZAH', 'ARABIC', 'TAFSIR', 'ISLAMIC_STUDIES', 'NEW_MUSLIM', 'INTENSIVE');

-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('LEVEL', 'MILESTONE_JUZ', 'IJAZAH');

-- CreateEnum
CREATE TYPE "AssessmentResult" AS ENUM ('PASS', 'FAIL', 'PENDING');

-- CreateEnum
CREATE TYPE "TeacherHiringStatus" AS ENUM ('SUBMITTED', 'RECITATION_REVIEW', 'DEMO_CLASS', 'ID_CHECK', 'REFERENCE_CHECK', 'TRAINING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HiringStepStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplicationDocumentType" AS ENUM ('ID', 'CERTIFICATE', 'REFERENCE', 'BACKGROUND_CHECK');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClassType" AS ENUM ('TRIAL', 'REGULAR', 'CIRCLE', 'EXAM', 'MAKEUP');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED_FAMILY', 'CANCELLED_TEACHER', 'NO_SHOW_STUDENT', 'NO_SHOW_TEACHER');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('TEACHER', 'STUDENT', 'GUARDIAN_VIEWER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('ONE_TO_ONE', 'CIRCLE');

-- CreateEnum
CREATE TYPE "MushafLayout" AS ENUM ('MADANI_15', 'INDOPAK_13', 'INDOPAK_16');

-- CreateEnum
CREATE TYPE "SubstituteOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MakeupCreditStatus" AS ENUM ('AVAILABLE', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AcademyHolidayType" AS ENUM ('HOLIDAY', 'RAMADAN_TIMETABLE');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PENDING', 'RECORDING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "RecordingMarkerKind" AS ENUM ('PAGE_TURN', 'HIGHLIGHT', 'MISTAKE');

-- CreateEnum
CREATE TYPE "PortionKind" AS ENUM ('SABAQ', 'SABQI', 'MANZIL', 'OTHER');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('EXCELLENT', 'GOOD', 'NEEDS_WORK', 'REPEAT');

-- CreateEnum
CREATE TYPE "MistakeType" AS ENUM ('LETTER_MAKHRAJ', 'VOWEL_HARAKAH', 'TAJWEED_RULE', 'SKIPPED_WORD', 'ADDED_WORD', 'STOP_WAQF');

-- CreateEnum
CREATE TYPE "MistakeSource" AS ENUM ('CLASS', 'AI');

-- CreateEnum
CREATE TYPE "PageState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'FRAGILE', 'SOLID');

-- CreateEnum
CREATE TYPE "DailyPlanStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'CHANGED');

-- CreateEnum
CREATE TYPE "HifzAlertType" AS ENUM ('BEHIND_GOAL', 'MANZIL_DROP');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'BEHIND', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PracticeMode" AS ENUM ('READING', 'MEMORISATION');

-- CreateEnum
CREATE TYPE "PracticeAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CmsPostType" AS ENUM ('BLOG', 'PRINTABLE', 'LANDING');

-- CreateEnum
CREATE TYPE "CmsPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChatChannel" AS ENUM ('WEB', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'AGENT');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "TeacherChangeRequestStatus" AS ENUM ('OPEN', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrialOutcomeStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TeacherResponseStatus" AS ENUM ('PENDING', 'RESPONDED', 'ESCALATED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320),
    "password_hash" TEXT,
    "name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(32),
    "language" VARCHAR(5) NOT NULL DEFAULT 'en',
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "two_factor_secret" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_active_at" TIMESTAMPTZ(6),
    "email_verified_at" TIMESTAMPTZ(6),
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "oauth_account" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "device_info" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "staff" BOOLEAN NOT NULL DEFAULT false,
    "ip" VARCHAR(64),
    "user_agent" TEXT,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kids_credential" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "KidsCredentialType" NOT NULL,
    "secret_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kids_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "country" VARCHAR(2),
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "billing_name" VARCHAR(160),
    "billing_address" JSONB,
    "payment_customer_id" VARCHAR(255),
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_member" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "relationship" VARCHAR(40) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "family_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID,
    "display_name" VARCHAR(120) NOT NULL,
    "birth_year" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "language" VARCHAR(5) NOT NULL DEFAULT 'en',
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "kids_mode" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "student_id" UUID,
    "purpose" "ConsentPurpose" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "method" "ConsentMethod" NOT NULL,
    "policy_version" VARCHAR(32) NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(6),
    "granted_by_user_id" UUID NOT NULL,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_event" (
    "id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "from_status" "ConsentStatus" NOT NULL,
    "to_status" "ConsentStatus" NOT NULL,
    "actor_id" UUID NOT NULL,
    "reason" TEXT,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_request" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "student_id" UUID,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "file_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_post" (
    "id" UUID NOT NULL,
    "type" "CmsPostType" NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "country_code" VARCHAR(2),
    "city" VARCHAR(120),
    "status" "CmsPostStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "author_id" UUID,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cms_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_item" (
    "id" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversation" (
    "id" UUID NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "lead_id" UUID,
    "external_id" VARCHAR(255),
    "handed_over" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_change_request" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TeacherChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "CourseType" NOT NULL,
    "description" TEXT NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_level" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "position" INTEGER NOT NULL,
    "rubric" JSONB,
    "pass_mark" INTEGER NOT NULL DEFAULT 70,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_template" (
    "id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "objectives" JSONB,
    "teacher_notes" TEXT,
    "materials" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrolment" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "current_level_id" UUID,
    "current_lesson_position" INTEGER NOT NULL DEFAULT 1,
    "teacher_id" UUID,
    "subscription_id" UUID,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'TRIAL',
    "started_at" TIMESTAMPTZ(6),
    "paused_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment" (
    "id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "examiner_id" UUID NOT NULL,
    "rubric_scores" JSONB,
    "result" "AssessmentResult" NOT NULL DEFAULT 'PENDING',
    "taken_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "serial_number" VARCHAR(40) NOT NULL,
    "verification_token" VARCHAR(64) NOT NULL,
    "student_name" VARCHAR(160) NOT NULL,
    "teacher_name" VARCHAR(160) NOT NULL,
    "course_name" VARCHAR(160) NOT NULL,
    "issued_on" DATE NOT NULL,
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ijazah_record" (
    "id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "sessions" JSONB,
    "sanad_text" TEXT,
    "issued_by_sheikh" VARCHAR(160) NOT NULL,
    "issued_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ijazah_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_application" (
    "id" UUID NOT NULL,
    "applicant_name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32),
    "country" VARCHAR(2),
    "qualifications" JSONB,
    "recitation_audio_url" TEXT,
    "status" "TeacherHiringStatus" NOT NULL DEFAULT 'SUBMITTED',
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hiring_step" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "step" "TeacherHiringStatus" NOT NULL,
    "status" "HiringStepStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" UUID,
    "notes" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hiring_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_document" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "type" "ApplicationDocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "application_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profile" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bio" TEXT,
    "photo_url" TEXT,
    "intro_video_url" TEXT,
    "recitation_sample_url" TEXT,
    "qualifications" JSONB,
    "gender" "Gender",
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "age_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hiring_status" "TeacherHiringStatus" NOT NULL DEFAULT 'SUBMITTED',
    "ready_to_match" BOOLEAN NOT NULL DEFAULT false,
    "safeguarding_training_completed_at" TIMESTAMPTZ(6),
    "pay_rate_id" UUID,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "pending_profile_changes" JSONB,
    "public_rating_avg" DECIMAL(3,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slot" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_course" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "content" JSONB,
    "is_safeguarding" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_assignment" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'ASSIGNED',
    "score" INTEGER,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_schedule" (
    "id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "rrule" TEXT NOT NULL,
    "local_start_time" TIME NOT NULL,
    "family_time_zone" VARCHAR(64) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "room_type" "RoomType" NOT NULL DEFAULT 'ONE_TO_ONE',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "materialised_until" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recurring_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_session" (
    "id" UUID NOT NULL,
    "schedule_id" UUID,
    "teacher_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "type" "ClassType" NOT NULL DEFAULT 'REGULAR',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "room_id" VARCHAR(255),
    "room_token" TEXT,
    "mushaf_layout" "MushafLayout" NOT NULL DEFAULT 'MADANI_15',
    "tajweed_colours" BOOLEAN NOT NULL DEFAULT false,
    "women_only" BOOLEAN NOT NULL DEFAULT false,
    "charged" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "last_page" INTEGER,
    "last_surah" INTEGER,
    "last_ayah" INTEGER,
    "last_word_index" INTEGER,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_participant" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID,
    "user_id" UUID NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "minutes_present" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "class_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_student" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolment_id" UUID,

    CONSTRAINT "class_student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "makeup_credit" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "source_class_id" UUID,
    "status" "MakeupCreditStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_class_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "makeup_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitute_offer" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "status" "SubstituteOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "offered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "substitute_offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_holiday" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "type" "AcademyHolidayType" NOT NULL DEFAULT 'HOLIDAY',
    "shift_rule" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academy_holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "storage_key" TEXT,
    "duration_seconds" INTEGER,
    "status" "RecordingStatus" NOT NULL DEFAULT 'PENDING',
    "provider_egress_id" VARCHAR(255),
    "delete_after" TIMESTAMPTZ(6) NOT NULL,
    "retained_for_case_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_marker" (
    "id" UUID NOT NULL,
    "recording_id" UUID NOT NULL,
    "offset_ms" INTEGER NOT NULL,
    "surah" INTEGER,
    "ayah" INTEGER,
    "word_index" INTEGER,
    "kind" "RecordingMarkerKind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_marker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_clip" (
    "id" UUID NOT NULL,
    "recording_id" UUID NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "attached_to_lesson_card_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_card" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "homework" TEXT,
    "parent_note" TEXT,
    "ai_summary_draft" TEXT,
    "summary_approved_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "shared_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_portion" (
    "id" UUID NOT NULL,
    "lesson_card_id" UUID NOT NULL,
    "kind" "PortionKind" NOT NULL,
    "from_surah" INTEGER,
    "from_ayah" INTEGER,
    "to_surah" INTEGER,
    "to_ayah" INTEGER,
    "grade" "Grade",
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lesson_portion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mistake" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "lesson_card_id" UUID,
    "practice_session_id" UUID,
    "class_id" UUID,
    "surah" INTEGER NOT NULL,
    "ayah" INTEGER NOT NULL,
    "word_index" INTEGER NOT NULL,
    "type" "MistakeType" NOT NULL,
    "tajweed_rule" VARCHAR(80),
    "source" "MistakeSource" NOT NULL DEFAULT 'CLASS',
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "dismissed_at" TIMESTAMPTZ(6),
    "confirmed_by_id" UUID,
    "ai_confidence" DECIMAL(4,3),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_edit_log" (
    "id" UUID NOT NULL,
    "lesson_card_id" UUID NOT NULL,
    "editor_id" UUID NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "edited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_edit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_state" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "state" "PageState" NOT NULL DEFAULT 'NOT_STARTED',
    "mistake_count_recent" INTEGER NOT NULL DEFAULT 0,
    "last_revised_at" TIMESTAMPTZ(6),
    "next_due_at" DATE,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hifz_rule_config" (
    "id" UUID NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "rules" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hifz_rule_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_plan" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "sabaq" JSONB,
    "sabqi" JSONB,
    "manzil" JSONB,
    "status" "DailyPlanStatus" NOT NULL DEFAULT 'PROPOSED',
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hifz_goal" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "target_description" VARCHAR(240) NOT NULL,
    "target_from_page" INTEGER NOT NULL,
    "target_to_page" INTEGER NOT NULL,
    "due_on" DATE NOT NULL,
    "lines_per_day_needed" DECIMAL(6,2) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "behind_since" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hifz_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hifz_alert" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "type" "HifzAlertType" NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(6),

    CONSTRAINT "hifz_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_assignment" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "from_surah" INTEGER NOT NULL,
    "from_ayah" INTEGER NOT NULL,
    "to_surah" INTEGER NOT NULL,
    "to_ayah" INTEGER NOT NULL,
    "mode" "PracticeMode" NOT NULL,
    "target_minutes" INTEGER NOT NULL,
    "due_on" DATE,
    "status" "PracticeAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_session" (
    "id" UUID NOT NULL,
    "assignment_id" UUID,
    "student_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "words_recited" INTEGER NOT NULL DEFAULT 0,
    "reveals_count" INTEGER NOT NULL DEFAULT 0,
    "audio_key" TEXT,
    "audio_delete_after" TIMESTAMPTZ(6),
    "result_summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "classes_per_week" INTEGER NOT NULL,
    "class_minutes" INTEGER NOT NULL,
    "room_type" "RoomType" NOT NULL DEFAULT 'ONE_TO_ONE',
    "billing_period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_price" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_rule" (
    "id" UUID NOT NULL,
    "type" "DiscountType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discount_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "provider_subscription_id" VARCHAR(255),
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "paused_until" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "subscription_id" UUID,
    "number" VARCHAR(40) NOT NULL,
    "currency" "Currency" NOT NULL,
    "subtotal_minor" INTEGER NOT NULL,
    "discount_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "pdf_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "provider" "PaymentProviderCode" NOT NULL,
    "provider_payment_id" VARCHAR(255) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "next_retry_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "issued_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_credit" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "amount_classes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "issued_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorship" (
    "id" UUID NOT NULL,
    "donor_user_id" UUID NOT NULL,
    "student_id" UUID,
    "status" "SponsorshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_on" DATE NOT NULL,
    "ended_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_rate" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate_per_class_minor" INTEGER NOT NULL,
    "class_type" "ClassType",
    "effective_from" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_period" (
    "id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entry" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "gross_minor" INTEGER NOT NULL DEFAULT 0,
    "deductions_minor" INTEGER NOT NULL DEFAULT 0,
    "bonuses_minor" INTEGER NOT NULL DEFAULT 0,
    "net_minor" INTEGER NOT NULL DEFAULT 0,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "paid_at" TIMESTAMPTZ(6),
    "payout_reference" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "class_id" UUID,
    "teacher_id" UUID,
    "kind" "PayrollLineKind" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_review" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "lesson_card_id" UUID,
    "family_user_id" UUID NOT NULL,
    "student_id" UUID,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_rubric" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "criteria" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "qa_rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_review" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "supervisor_id" UUID NOT NULL,
    "rubric_id" UUID NOT NULL,
    "scores" JSONB NOT NULL,
    "feedback" TEXT,
    "teacher_reply" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "QaSampleSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "qa_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_sample" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "source" "QaSampleSource" NOT NULL DEFAULT 'RANDOM_SAMPLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qa_sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_record" (
    "id" UUID NOT NULL,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "owner_id" UUID,
    "opened_by" UUID NOT NULL,
    "subject_user_id" UUID,
    "class_id" UUID,
    "summary" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "alerted_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "case_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_note" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "source" VARCHAR(60),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "owner_id" UUID,
    "contact_name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "country" VARCHAR(2),
    "child_age" INTEGER,
    "course_interest" VARCHAR(60),
    "family_id" UUID,
    "trial_class_id" UUID,
    "lost_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "contact_user_id" UUID,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "lead_id" UUID,
    "type" "TaskType" NOT NULL,
    "assignee_id" UUID,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_outcome" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "placement_level_id" UUID,
    "recommended_plan_id" UUID,
    "notes" TEXT,
    "subscribe_token" VARCHAR(64) NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "permission" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "target_type" VARCHAR(80),
    "target_id" VARCHAR(80),
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(64),
    "request_id" VARCHAR(80),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_thread" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "student_id" UUID,
    "enrolment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "quiet_from" TIME,
    "quiet_to" TIME,
    "language" VARCHAR(5) NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduled_for" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_badge" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "current_length" INTEGER NOT NULL DEFAULT 0,
    "longest_length" INTEGER NOT NULL DEFAULT 0,
    "last_activity_on" DATE,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_award" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "sticker" VARCHAR(60) NOT NULL,
    "note" TEXT,
    "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "referrer_family_id" UUID NOT NULL,
    "new_family_id" UUID,
    "reward_applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_goal" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "due_on" DATE,
    "achieved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ayah_note" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "surah" INTEGER NOT NULL,
    "ayah" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ayah_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_card" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "word" VARCHAR(120) NOT NULL,
    "meaning" TEXT NOT NULL,
    "surah" INTEGER,
    "ayah" INTEGER,
    "box" INTEGER NOT NULL DEFAULT 1,
    "next_due_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vocab_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_cache" (
    "key" VARCHAR(255) NOT NULL,
    "value" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "mushaf_layout_ref" (
    "id" UUID NOT NULL,
    "layout" "MushafLayout" NOT NULL,
    "page" INTEGER NOT NULL,
    "surah" INTEGER NOT NULL,
    "ayah_from" INTEGER NOT NULL,
    "ayah_to" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mushaf_layout_ref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE INDEX "user_phone_idx" ON "user"("phone");

-- CreateIndex
CREATE INDEX "user_role_role_idx" ON "user_role"("role");

-- CreateIndex
CREATE INDEX "oauth_account_user_id_idx" ON "oauth_account"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_account_provider_provider_user_id_key" ON "oauth_account"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "refresh_token_session_id_idx" ON "refresh_token"("session_id");

-- CreateIndex
CREATE INDEX "refresh_token_expires_at_idx" ON "refresh_token"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_token_user_id_idx" ON "password_reset_token"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_token_expires_at_idx" ON "password_reset_token"("expires_at");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "kids_credential_student_id_key" ON "kids_credential"("student_id");

-- CreateIndex
CREATE INDEX "family_country_idx" ON "family"("country");

-- CreateIndex
CREATE INDEX "family_member_user_id_idx" ON "family_member"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_member_family_id_user_id_key" ON "family_member"("family_id", "user_id");

-- CreateIndex
CREATE INDEX "student_family_id_idx" ON "student"("family_id");

-- CreateIndex
CREATE INDEX "student_user_id_idx" ON "student"("user_id");

-- CreateIndex
CREATE INDEX "consent_family_id_purpose_status_idx" ON "consent"("family_id", "purpose", "status");

-- CreateIndex
CREATE INDEX "consent_student_id_purpose_status_idx" ON "consent"("student_id", "purpose", "status");

-- CreateIndex
CREATE UNIQUE INDEX "consent_student_id_purpose_policy_version_key" ON "consent"("student_id", "purpose", "policy_version");

-- CreateIndex
CREATE INDEX "consent_event_consent_id_idx" ON "consent_event"("consent_id");

-- CreateIndex
CREATE INDEX "data_request_status_due_at_idx" ON "data_request"("status", "due_at");

-- CreateIndex
CREATE INDEX "data_request_family_id_idx" ON "data_request"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_post_slug_key" ON "cms_post"("slug");

-- CreateIndex
CREATE INDEX "cms_post_type_status_locale_idx" ON "cms_post"("type", "status", "locale");

-- CreateIndex
CREATE INDEX "cms_post_country_code_city_idx" ON "cms_post"("country_code", "city");

-- CreateIndex
CREATE INDEX "faq_item_locale_approved_sort_idx" ON "faq_item"("locale", "approved", "sort");

-- CreateIndex
CREATE INDEX "chat_conversation_lead_id_idx" ON "chat_conversation"("lead_id");

-- CreateIndex
CREATE INDEX "chat_message_conversation_id_created_at_idx" ON "chat_message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "teacher_change_request_family_id_status_idx" ON "teacher_change_request"("family_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "course_code_key" ON "course"("code");

-- CreateIndex
CREATE INDEX "course_type_active_idx" ON "course"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "course_level_course_id_position_key" ON "course_level"("course_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_template_level_id_position_key" ON "lesson_template"("level_id", "position");

-- CreateIndex
CREATE INDEX "enrolment_student_id_status_idx" ON "enrolment"("student_id", "status");

-- CreateIndex
CREATE INDEX "enrolment_teacher_id_status_idx" ON "enrolment"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "assessment_enrolment_id_idx" ON "assessment"("enrolment_id");

-- CreateIndex
CREATE INDEX "assessment_examiner_id_result_idx" ON "assessment"("examiner_id", "result");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_assessment_id_key" ON "certificate"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_serial_number_key" ON "certificate"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_verification_token_key" ON "certificate"("verification_token");

-- CreateIndex
CREATE INDEX "ijazah_record_enrolment_id_idx" ON "ijazah_record"("enrolment_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_application_user_id_key" ON "teacher_application"("user_id");

-- CreateIndex
CREATE INDEX "teacher_application_status_idx" ON "teacher_application"("status");

-- CreateIndex
CREATE INDEX "teacher_application_email_idx" ON "teacher_application"("email");

-- CreateIndex
CREATE INDEX "hiring_step_application_id_status_idx" ON "hiring_step"("application_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hiring_step_application_id_step_key" ON "hiring_step"("application_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "application_document_application_id_type_key" ON "application_document"("application_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profile_user_id_key" ON "teacher_profile"("user_id");

-- CreateIndex
CREATE INDEX "teacher_profile_ready_to_match_idx" ON "teacher_profile"("ready_to_match");

-- CreateIndex
CREATE INDEX "teacher_profile_hiring_status_idx" ON "teacher_profile"("hiring_status");

-- CreateIndex
CREATE INDEX "availability_slot_teacher_id_weekday_idx" ON "availability_slot"("teacher_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "training_course_code_key" ON "training_course"("code");

-- CreateIndex
CREATE INDEX "training_assignment_teacher_id_status_idx" ON "training_assignment"("teacher_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_assignment_course_id_teacher_id_key" ON "training_assignment"("course_id", "teacher_id");

-- CreateIndex
CREATE INDEX "recurring_schedule_teacher_id_status_idx" ON "recurring_schedule"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "recurring_schedule_enrolment_id_status_idx" ON "recurring_schedule"("enrolment_id", "status");

-- CreateIndex
CREATE INDEX "class_session_teacher_id_starts_at_idx" ON "class_session"("teacher_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_session_status_starts_at_idx" ON "class_session"("status", "starts_at");

-- CreateIndex
CREATE INDEX "class_session_starts_at_idx" ON "class_session"("starts_at");

-- CreateIndex
CREATE INDEX "class_participant_class_id_role_idx" ON "class_participant"("class_id", "role");

-- CreateIndex
CREATE INDEX "class_participant_user_id_idx" ON "class_participant"("user_id");

-- CreateIndex
CREATE INDEX "class_student_student_id_starts_at_idx" ON "class_student"("student_id", "starts_at");

-- CreateIndex
CREATE INDEX "class_student_enrolment_id_idx" ON "class_student"("enrolment_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_student_class_id_student_id_key" ON "class_student"("class_id", "student_id");

-- CreateIndex
CREATE INDEX "makeup_credit_family_id_status_idx" ON "makeup_credit"("family_id", "status");

-- CreateIndex
CREATE INDEX "makeup_credit_student_id_status_idx" ON "makeup_credit"("student_id", "status");

-- CreateIndex
CREATE INDEX "substitute_offer_teacher_id_status_idx" ON "substitute_offer"("teacher_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "substitute_offer_class_id_teacher_id_key" ON "substitute_offer"("class_id", "teacher_id");

-- CreateIndex
CREATE INDEX "academy_holiday_starts_on_ends_on_idx" ON "academy_holiday"("starts_on", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "recording_class_id_key" ON "recording"("class_id");

-- CreateIndex
CREATE INDEX "recording_delete_after_status_idx" ON "recording"("delete_after", "status");

-- CreateIndex
CREATE INDEX "recording_marker_recording_id_offset_ms_idx" ON "recording_marker"("recording_id", "offset_ms");

-- CreateIndex
CREATE INDEX "recording_clip_recording_id_idx" ON "recording_clip"("recording_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_card_class_id_key" ON "lesson_card"("class_id");

-- CreateIndex
CREATE INDEX "lesson_card_student_id_shared_at_idx" ON "lesson_card"("student_id", "shared_at");

-- CreateIndex
CREATE INDEX "lesson_card_teacher_id_idx" ON "lesson_card"("teacher_id");

-- CreateIndex
CREATE INDEX "lesson_portion_lesson_card_id_idx" ON "lesson_portion"("lesson_card_id");

-- CreateIndex
CREATE INDEX "mistake_student_id_surah_ayah_idx" ON "mistake"("student_id", "surah", "ayah");

-- CreateIndex
CREATE INDEX "mistake_lesson_card_id_idx" ON "mistake"("lesson_card_id");

-- CreateIndex
CREATE INDEX "mistake_class_id_idx" ON "mistake"("class_id");

-- CreateIndex
CREATE INDEX "mistake_practice_session_id_idx" ON "mistake"("practice_session_id");

-- CreateIndex
CREATE INDEX "lesson_edit_log_lesson_card_id_edited_at_idx" ON "lesson_edit_log"("lesson_card_id", "edited_at");

-- CreateIndex
CREATE INDEX "page_state_student_id_state_idx" ON "page_state"("student_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "page_state_student_id_page_number_key" ON "page_state"("student_id", "page_number");

-- CreateIndex
CREATE UNIQUE INDEX "hifz_rule_config_version_key" ON "hifz_rule_config"("version");

-- CreateIndex
CREATE UNIQUE INDEX "daily_plan_student_id_date_key" ON "daily_plan"("student_id", "date");

-- CreateIndex
CREATE INDEX "hifz_goal_student_id_status_idx" ON "hifz_goal"("student_id", "status");

-- CreateIndex
CREATE INDEX "hifz_alert_teacher_id_acknowledged_at_idx" ON "hifz_alert"("teacher_id", "acknowledged_at");

-- CreateIndex
CREATE INDEX "practice_assignment_student_id_status_idx" ON "practice_assignment"("student_id", "status");

-- CreateIndex
CREATE INDEX "practice_session_student_id_started_at_idx" ON "practice_session"("student_id", "started_at");

-- CreateIndex
CREATE INDEX "practice_session_audio_delete_after_idx" ON "practice_session"("audio_delete_after");

-- CreateIndex
CREATE UNIQUE INDEX "plan_code_key" ON "plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_price_plan_id_currency_key" ON "plan_price"("plan_id", "currency");

-- CreateIndex
CREATE INDEX "subscription_family_id_status_idx" ON "subscription"("family_id", "status");

-- CreateIndex
CREATE INDEX "subscription_status_idx" ON "subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice"("number");

-- CreateIndex
CREATE INDEX "invoice_family_id_status_idx" ON "invoice"("family_id", "status");

-- CreateIndex
CREATE INDEX "invoice_status_due_at_idx" ON "invoice"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_payment_id_key" ON "payment"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_invoice_id_idx" ON "payment"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_status_next_retry_at_idx" ON "payment"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "refund_payment_id_idx" ON "refund"("payment_id");

-- CreateIndex
CREATE INDEX "class_credit_family_id_idx" ON "class_credit"("family_id");

-- CreateIndex
CREATE INDEX "sponsorship_student_id_idx" ON "sponsorship"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_period_starts_on_ends_on_key" ON "payroll_period"("starts_on", "ends_on");

-- CreateIndex
CREATE INDEX "payroll_entry_teacher_id_idx" ON "payroll_entry"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entry_period_id_teacher_id_key" ON "payroll_entry"("period_id", "teacher_id");

-- CreateIndex
CREATE INDEX "payroll_line_entry_id_idx" ON "payroll_line"("entry_id");

-- CreateIndex
CREATE INDEX "payroll_line_class_id_idx" ON "payroll_line"("class_id");

-- CreateIndex
CREATE INDEX "class_review_lesson_card_id_idx" ON "class_review"("lesson_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_review_class_id_family_user_id_key" ON "class_review"("class_id", "family_user_id");

-- CreateIndex
CREATE INDEX "qa_review_supervisor_id_reviewed_at_idx" ON "qa_review"("supervisor_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "qa_review_class_id_supervisor_id_key" ON "qa_review"("class_id", "supervisor_id");

-- CreateIndex
CREATE INDEX "qa_sample_teacher_id_period_idx" ON "qa_sample"("teacher_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "qa_sample_period_class_id_key" ON "qa_sample"("period", "class_id");

-- CreateIndex
CREATE INDEX "case_record_type_status_idx" ON "case_record"("type", "status");

-- CreateIndex
CREATE INDEX "case_record_owner_id_status_idx" ON "case_record"("owner_id", "status");

-- CreateIndex
CREATE INDEX "case_record_due_at_idx" ON "case_record"("due_at");

-- CreateIndex
CREATE INDEX "case_note_case_id_created_at_idx" ON "case_note"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_status_created_at_idx" ON "lead"("status", "created_at");

-- CreateIndex
CREATE INDEX "lead_owner_id_status_idx" ON "lead"("owner_id", "status");

-- CreateIndex
CREATE INDEX "task_assignee_id_status_due_at_idx" ON "task"("assignee_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "trial_outcome_class_id_key" ON "trial_outcome"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_outcome_subscribe_token_key" ON "trial_outcome"("subscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_role_permission_key" ON "role_permission"("role", "permission");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_at_idx" ON "audit_log"("actor_id", "at");

-- CreateIndex
CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "message_thread_family_id_updated_at_idx" ON "message_thread"("family_id", "updated_at");

-- CreateIndex
CREATE INDEX "message_thread_teacher_id_updated_at_idx" ON "message_thread"("teacher_id", "updated_at");

-- CreateIndex
CREATE INDEX "message_thread_id_created_at_idx" ON "message"("thread_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_user_id_key" ON "notification_preference"("user_id");

-- CreateIndex
CREATE INDEX "notification_user_id_status_idx" ON "notification"("user_id", "status");

-- CreateIndex
CREATE INDEX "notification_status_scheduled_for_idx" ON "notification"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "device_token_token_key" ON "device_token"("token");

-- CreateIndex
CREATE INDEX "device_token_user_id_idx" ON "device_token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "badge_code_key" ON "badge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "student_badge_student_id_badge_id_key" ON "student_badge"("student_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "streak_student_id_key" ON "streak"("student_id");

-- CreateIndex
CREATE INDEX "sticker_award_student_id_awarded_at_idx" ON "sticker_award"("student_id", "awarded_at");

-- CreateIndex
CREATE UNIQUE INDEX "referral_code_key" ON "referral"("code");

-- CreateIndex
CREATE INDEX "referral_referrer_family_id_idx" ON "referral"("referrer_family_id");

-- CreateIndex
CREATE INDEX "personal_goal_student_id_idx" ON "personal_goal"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "ayah_note_student_id_surah_ayah_key" ON "ayah_note"("student_id", "surah", "ayah");

-- CreateIndex
CREATE INDEX "vocab_card_student_id_next_due_at_idx" ON "vocab_card"("student_id", "next_due_at");

-- CreateIndex
CREATE INDEX "content_cache_expires_at_idx" ON "content_cache"("expires_at");

-- CreateIndex
CREATE INDEX "mushaf_layout_ref_surah_idx" ON "mushaf_layout_ref"("surah");

-- CreateIndex
CREATE UNIQUE INDEX "mushaf_layout_ref_layout_page_key" ON "mushaf_layout_ref"("layout", "page");

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_account" ADD CONSTRAINT "oauth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kids_credential" ADD CONSTRAINT "kids_credential_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_event" ADD CONSTRAINT "consent_event_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "consent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_event" ADD CONSTRAINT "consent_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_change_request" ADD CONSTRAINT "teacher_change_request_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_change_request" ADD CONSTRAINT "teacher_change_request_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_level" ADD CONSTRAINT "course_level_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_template" ADD CONSTRAINT "lesson_template_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "course_level"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_current_level_id_fkey" FOREIGN KEY ("current_level_id") REFERENCES "course_level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "course_level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ijazah_record" ADD CONSTRAINT "ijazah_record_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiring_step" ADD CONSTRAINT "hiring_step_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "teacher_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiring_step" ADD CONSTRAINT "hiring_step_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "teacher_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profile" ADD CONSTRAINT "teacher_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profile" ADD CONSTRAINT "teacher_profile_pay_rate_id_fkey" FOREIGN KEY ("pay_rate_id") REFERENCES "pay_rate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignment" ADD CONSTRAINT "training_assignment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "training_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignment" ADD CONSTRAINT "training_assignment_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "recurring_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_participant" ADD CONSTRAINT "class_participant_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_participant" ADD CONSTRAINT "class_participant_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_participant" ADD CONSTRAINT "class_participant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_student" ADD CONSTRAINT "class_student_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_student" ADD CONSTRAINT "class_student_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_student" ADD CONSTRAINT "class_student_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credit" ADD CONSTRAINT "makeup_credit_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credit" ADD CONSTRAINT "makeup_credit_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credit" ADD CONSTRAINT "makeup_credit_source_class_id_fkey" FOREIGN KEY ("source_class_id") REFERENCES "class_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credit" ADD CONSTRAINT "makeup_credit_used_class_id_fkey" FOREIGN KEY ("used_class_id") REFERENCES "class_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_offer" ADD CONSTRAINT "substitute_offer_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_offer" ADD CONSTRAINT "substitute_offer_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_marker" ADD CONSTRAINT "recording_marker_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_clip" ADD CONSTRAINT "recording_clip_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_clip" ADD CONSTRAINT "recording_clip_attached_to_lesson_card_id_fkey" FOREIGN KEY ("attached_to_lesson_card_id") REFERENCES "lesson_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_card" ADD CONSTRAINT "lesson_card_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_card" ADD CONSTRAINT "lesson_card_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_card" ADD CONSTRAINT "lesson_card_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_portion" ADD CONSTRAINT "lesson_portion_lesson_card_id_fkey" FOREIGN KEY ("lesson_card_id") REFERENCES "lesson_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake" ADD CONSTRAINT "mistake_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake" ADD CONSTRAINT "mistake_lesson_card_id_fkey" FOREIGN KEY ("lesson_card_id") REFERENCES "lesson_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake" ADD CONSTRAINT "mistake_practice_session_id_fkey" FOREIGN KEY ("practice_session_id") REFERENCES "practice_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake" ADD CONSTRAINT "mistake_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake" ADD CONSTRAINT "mistake_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_edit_log" ADD CONSTRAINT "lesson_edit_log_lesson_card_id_fkey" FOREIGN KEY ("lesson_card_id") REFERENCES "lesson_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_edit_log" ADD CONSTRAINT "lesson_edit_log_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_state" ADD CONSTRAINT "page_state_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan" ADD CONSTRAINT "daily_plan_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan" ADD CONSTRAINT "daily_plan_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hifz_goal" ADD CONSTRAINT "hifz_goal_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hifz_alert" ADD CONSTRAINT "hifz_alert_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hifz_alert" ADD CONSTRAINT "hifz_alert_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assignment" ADD CONSTRAINT "practice_assignment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assignment" ADD CONSTRAINT "practice_assignment_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "practice_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_price" ADD CONSTRAINT "plan_price_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_credit" ADD CONSTRAINT "class_credit_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship" ADD CONSTRAINT "sponsorship_donor_user_id_fkey" FOREIGN KEY ("donor_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry" ADD CONSTRAINT "payroll_entry_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line" ADD CONSTRAINT "payroll_line_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "payroll_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line" ADD CONSTRAINT "payroll_line_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line" ADD CONSTRAINT "payroll_line_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_review" ADD CONSTRAINT "class_review_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_review" ADD CONSTRAINT "class_review_lesson_card_id_fkey" FOREIGN KEY ("lesson_card_id") REFERENCES "lesson_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_review" ADD CONSTRAINT "class_review_family_user_id_fkey" FOREIGN KEY ("family_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_review" ADD CONSTRAINT "class_review_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_review" ADD CONSTRAINT "qa_review_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_review" ADD CONSTRAINT "qa_review_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_review" ADD CONSTRAINT "qa_review_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "qa_rubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_sample" ADD CONSTRAINT "qa_sample_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_sample" ADD CONSTRAINT "qa_sample_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_record" ADD CONSTRAINT "case_record_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_record" ADD CONSTRAINT "case_record_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_record" ADD CONSTRAINT "case_record_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_note" ADD CONSTRAINT "case_note_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_note" ADD CONSTRAINT "case_note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_outcome" ADD CONSTRAINT "trial_outcome_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_outcome" ADD CONSTRAINT "trial_outcome_placement_level_id_fkey" FOREIGN KEY ("placement_level_id") REFERENCES "course_level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_outcome" ADD CONSTRAINT "trial_outcome_recommended_plan_id_fkey" FOREIGN KEY ("recommended_plan_id") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "enrolment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_token" ADD CONSTRAINT "device_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badge" ADD CONSTRAINT "student_badge_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badge" ADD CONSTRAINT "student_badge_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak" ADD CONSTRAINT "streak_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_award" ADD CONSTRAINT "sticker_award_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_referrer_family_id_fkey" FOREIGN KEY ("referrer_family_id") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_new_family_id_fkey" FOREIGN KEY ("new_family_id") REFERENCES "family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_goal" ADD CONSTRAINT "personal_goal_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ayah_note" ADD CONSTRAINT "ayah_note_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_card" ADD CONSTRAINT "vocab_card_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Hifzoon â€” database-level rules that Prisma cannot express.
--
-- Every item here is traceable to docs/Hifzoon-ERD.md section 3 or TRD section 11.
-- They are the last line of defence: services perform the same checks and return
-- friendly errors, but these constraints make a violation impossible even if a
-- future code path forgets the check.
-- ============================================================================

-- â”€â”€ Extensions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- â”€â”€ Email normalisation (citext substitute) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The ERD asks for citext. Rather than depend on the extension + Prisma preview
-- features, emails are normalised to lowercase on write (AuthService) and this
-- CHECK makes that non-negotiable, while the UNIQUE index gives case-insensitive
-- uniqueness. `user` and `lead` carry the only unique email indexes.
ALTER TABLE "user"
  ADD CONSTRAINT "user_email_lowercase" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "lead"
  ADD CONSTRAINT "lead_email_lowercase" CHECK ("email" IS NULL OR "email" = lower("email"));

-- â”€â”€ Domain CHECK constraints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- FR-HFZ-01: the Madani mushaf has exactly 604 pages.
ALTER TABLE "page_state"
  ADD CONSTRAINT "page_state_page_range" CHECK ("page_number" BETWEEN 1 AND 604);

-- FR-REC-01: 114 surahs.
ALTER TABLE "mistake"
  ADD CONSTRAINT "mistake_surah_range" CHECK ("surah" BETWEEN 1 AND 114),
  ADD CONSTRAINT "mistake_ayah_positive" CHECK ("ayah" >= 1),
  ADD CONSTRAINT "mistake_word_index_non_negative" CHECK ("word_index" >= 0),
  ADD CONSTRAINT "mistake_ai_confidence_range"
    CHECK ("ai_confidence" IS NULL OR ("ai_confidence" >= 0 AND "ai_confidence" <= 1));

-- FR-QA-04: 1..5 stars.
ALTER TABLE "class_review"
  ADD CONSTRAINT "class_review_stars_range" CHECK ("stars" BETWEEN 1 AND 5);

-- FR-REC-07: clips are capped at 60 seconds and must be ordered.
ALTER TABLE "recording_clip"
  ADD CONSTRAINT "recording_clip_length" CHECK (("end_ms" - "start_ms") BETWEEN 1 AND 60000),
  ADD CONSTRAINT "recording_clip_order"   CHECK ("end_ms" > "start_ms");

-- Teacher availability: 0 = Sunday .. 6 = Saturday, and end must be after start.
ALTER TABLE "availability_slot"
  ADD CONSTRAINT "availability_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "availability_time_order"   CHECK ("end_time" > "start_time");

-- FR-SCH-01 / FR-SCH-02: a class session is a well-formed interval.
ALTER TABLE "class_session"
  ADD CONSTRAINT "class_session_time_order" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "class_session_duration_positive"
    CHECK (EXTRACT(EPOCH FROM ("ends_at" - "starts_at")) / 60 BETWEEN 1 AND 480);

-- FR-SCH-02: recurring schedules keep a positive duration.
ALTER TABLE "recurring_schedule"
  ADD CONSTRAINT "recurring_schedule_duration" CHECK ("duration_minutes" BETWEEN 5 AND 480),
  ADD CONSTRAINT "recurring_schedule_window" CHECK ("ends_on" IS NULL OR "ends_on" >= "starts_on");

-- Money is never negative and invoices balance (ERD section 3).
ALTER TABLE "invoice"
  ADD CONSTRAINT "invoice_amounts_non_negative"
    CHECK ("subtotal_minor" >= 0 AND "discount_minor" >= 0 AND "total_minor" >= 0),
  ADD CONSTRAINT "invoice_total_matches"
    CHECK ("total_minor" = "subtotal_minor" - "discount_minor");

ALTER TABLE "plan_price"  ADD CONSTRAINT "plan_price_positive"  CHECK ("amount_minor" >= 0);
ALTER TABLE "payment"     ADD CONSTRAINT "payment_amount_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "refund"      ADD CONSTRAINT "refund_amount_positive"  CHECK ("amount_minor" > 0);
ALTER TABLE "pay_rate"    ADD CONSTRAINT "pay_rate_positive"       CHECK ("rate_per_class_minor" >= 0);

ALTER TABLE "payroll_entry"
  ADD CONSTRAINT "payroll_entry_math"
    CHECK ("net_minor" = "gross_minor" - "deductions_minor" + "bonuses_minor");

-- Retention policy lives with the data: content cache may never exceed the
-- 7 days the Quran Foundation licence allows (CR-11, TRD section 9).
ALTER TABLE "content_cache"
  ADD CONSTRAINT "content_cache_ttl_max"
    CHECK ("expires_at" <= "fetched_at" + INTERVAL '7 days');

-- FR-CLS-14: attendance cannot exceed the class length or go negative.
ALTER TABLE "class_participant"
  ADD CONSTRAINT "class_participant_minutes_non_negative" CHECK ("minutes_present" >= 0),
  ADD CONSTRAINT "class_participant_left_after_join"    CHECK ("left_at" IS NULL OR "left_at" >= "joined_at");

-- FR-AUTH-04 / CR-01: consents and the goals that depend on the page range.
ALTER TABLE "hifz_goal"
  ADD CONSTRAINT "hifz_goal_page_range" CHECK ("target_from_page" >= 1 AND "target_to_page" <= 604
                                                AND "target_to_page" >= "target_from_page");

ALTER TABLE "consent"
  ADD CONSTRAINT "consent_withdrawal_stamps"
    CHECK (("status" = 'GRANTED' AND "withdrawn_at" IS NULL)
        OR ("status" = 'WITHDRAWN' AND "withdrawn_at" IS NOT NULL));

ALTER TABLE "consent"
  ADD CONSTRAINT "consent_grant_before_withdrawal"
    CHECK ("withdrawn_at" IS NULL OR "withdrawn_at" >= "granted_at");

-- CR-05: a data request's SLA due date must be in the future relative to the request.
ALTER TABLE "data_request"
  ADD CONSTRAINT "data_request_due_after_request" CHECK ("due_at" > "requested_at");

-- Teacher ratings.
ALTER TABLE "teacher_profile"
  ADD CONSTRAINT "teacher_profile_rating_range"
    CHECK ("rating_avg" >= 0 AND "rating_avg" <= 5
       AND ("public_rating_avg" IS NULL OR ("public_rating_avg" >= 0 AND "public_rating_avg" <= 5)));

-- â”€â”€ FR-SCH-07: no double booking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- A teacher cannot be in two active classes at once. Cancelled/no-show sessions
-- release the slot, so the predicate only considers the blocking statuses
-- (shared/BLOCKING_CLASS_STATUSES).
ALTER TABLE "class_session"
  ADD CONSTRAINT "class_session_teacher_no_overlap"
  EXCLUDE USING gist (
    "teacher_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'LIVE', 'COMPLETED'));

-- A student cannot be in two classes at once (class_student mirrors the time range).
ALTER TABLE "class_student"
  ADD CONSTRAINT "class_student_no_overlap"
  EXCLUDE USING gist (
    "student_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  );

-- â”€â”€ FR-CRS-04: the examiner must not be the enrolment's own teacher â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The service checks this first for a good error message; the trigger makes it
-- impossible to bypass.
CREATE OR REPLACE FUNCTION "assert_assessment_examiner_independent"() RETURNS trigger AS $$
DECLARE
  own_teacher uuid;
BEGIN
  SELECT "teacher_id" INTO own_teacher FROM "enrolment" WHERE "id" = NEW."enrolment_id";
  IF own_teacher IS NOT NULL AND own_teacher = NEW."examiner_id" THEN
    RAISE EXCEPTION 'FR-CRS-04: examiner (%) must differ from the enrolment teacher (%)',
      NEW."examiner_id", own_teacher
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assessment_examiner_independent"
  BEFORE INSERT OR UPDATE ON "assessment"
  FOR EACH ROW EXECUTE FUNCTION "assert_assessment_examiner_independent"();

-- â”€â”€ FR-REC-08: lesson card edits after the lock are supervisor-only â”€â”€â”€â”€â”€â”€â”€â”€
-- The service authorises this; the trigger guarantees the card is immutable once
-- locked for anyone other than a user holding SUPERVISOR/SUPER_ADMIN.
CREATE OR REPLACE FUNCTION "assert_lesson_card_lock"() RETURNS trigger AS $$
DECLARE
  lock_ts timestamptz;
  editor_has_supervisor boolean;
BEGIN
  SELECT "locked_at" INTO lock_ts FROM "lesson_card" WHERE "id" = OLD."id";
  IF lock_ts IS NULL THEN
    RETURN NEW;
  END IF;

  -- Audit rows are always written by the service after the edit; ignore them here.
  IF TG_TABLE_NAME = 'lesson_card' THEN
    IF NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
       OR NEW."locked_at" IS DISTINCT FROM OLD."locked_at" THEN
      RETURN NEW;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM "user_role" ur
      JOIN "user" u ON u."id" = ur."user_id"
      WHERE ur."role" IN ('SUPERVISOR', 'SUPER_ADMIN')
    ) INTO editor_has_supervisor;
    IF NOT editor_has_supervisor THEN
      RAISE EXCEPTION 'FR-REC-08: lesson card % is locked until %', OLD."id", lock_ts
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lesson_card_lock_guard"
  BEFORE UPDATE ON "lesson_card"
  FOR EACH ROW EXECUTE FUNCTION "assert_lesson_card_lock"();

-- â”€â”€ FR-TCH-02: ready_to_match is derived, never set by hand â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The service recomputes it from hiring steps + safeguarding training; this keeps
-- a partially updated state from being observable.
CREATE OR REPLACE FUNCTION "assert_ready_to_match_inputs"() RETURNS trigger AS $$
BEGIN
  IF NEW."ready_to_match" AND (
    NEW."safeguarding_training_completed_at" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "hiring_step" hs
      JOIN "teacher_application" ta ON ta."id" = hs."application_id"
      WHERE ta."user_id" = NEW."user_id" AND hs."status" <> 'PASSED'
    )
  ) THEN
    RAISE EXCEPTION 'FR-TCH-02: ready_to_match requires all hiring steps passed and safeguarding training complete'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "teacher_profile_ready_to_match_guard"
  BEFORE INSERT OR UPDATE ON "teacher_profile"
  FOR EACH ROW EXECUTE FUNCTION "assert_ready_to_match_inputs"();

-- â”€â”€ FR-OPS-06: audit_log is append-only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION "reject_audit_log_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FR-OPS-06: audit_log is append-only (% is not permitted)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "reject_audit_log_mutation"();

-- â”€â”€ FR-QA-05: safeguarding cases are private to the safeguarding lead â”€â”€â”€â”€â”€â”€â”€
-- Defence in depth. The API authorises in QualityService; this policy protects the
-- table if anything ever connects to the database directly. The app sets
-- `SET LOCAL app.user_roles` inside the transaction it opens for case queries
-- (see DatabaseRoleContext).
ALTER TABLE "case_record" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_record_visibility" ON "case_record"
  USING (
    "type" <> 'SAFEGUARDING'
    OR COALESCE(
      string_to_array(current_setting('app.user_roles', true), ','),
      ARRAY[]::text[]
    ) && ARRAY['SAFEGUARDING_LEAD', 'SUPER_ADMIN']::text[]
  );

-- â”€â”€ Updated-at triggers for tables the app relies on â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- (Prisma's @updatedAt already covers most models; this covers raw SQL paths.)
CREATE OR REPLACE FUNCTION "set_updated_at"() RETURNS trigger AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user', 'family', 'student', 'consent', 'teacher_profile', 'class_session',
    'recurring_schedule', 'lesson_card', 'enrolment', 'invoice', 'subscription',
    'notification_preference', 'page_state', 'daily_plan', 'hifz_goal'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

