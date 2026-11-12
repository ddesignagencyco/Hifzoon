import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AuditService } from '../audit/audit.service';

/** What may be attached to a lesson, and how big. */
export const MATERIAL_RULES = {
  'application/pdf': { ext: 'pdf', maxBytes: 20 * 1024 * 1024 },
  'image/jpeg': { ext: 'jpg', maxBytes: 10 * 1024 * 1024 },
  'image/png': { ext: 'png', maxBytes: 10 * 1024 * 1024 },
  'audio/mpeg': { ext: 'mp3', maxBytes: 25 * 1024 * 1024 },
  'audio/mp4': { ext: 'm4a', maxBytes: 25 * 1024 * 1024 },
  'audio/wav': { ext: 'wav', maxBytes: 25 * 1024 * 1024 },
} as const satisfies Record<string, { ext: string; maxBytes: number }>;

export interface MaterialFile {
  id: string;
  name: string;
  key: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

const MAX_FILES_PER_LESSON = 20;

/**
 * File uploads for lesson material (FR-CRS-01). The browser uploads straight to storage with
 * a signed PUT, then confirms the key; the file stays private and is read back through a
 * short-lived signed link, the same way hiring documents are.
 */
@Injectable()
export class CourseMaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Step 1: a signed upload for one file. Nothing is recorded yet. */
  async presign(lessonId: string, input: { contentType: string; size: number }) {
    await this.loadLesson(lessonId);
    const contentType = input.contentType.toLowerCase().split(';')[0].trim();
    const rule = (MATERIAL_RULES as Record<string, { ext: string; maxBytes: number }>)[contentType];
    if (!rule) {
      throw AppError.badRequest('That file type is not accepted', {
        allowed: Object.keys(MATERIAL_RULES),
      });
    }
    if (!Number.isInteger(input.size) || input.size < 1 || input.size > rule.maxBytes) {
      throw AppError.badRequest(
        `A ${rule.ext.toUpperCase()} may be at most ${Math.floor(rule.maxBytes / 1024 / 1024)} MB`,
        { maxBytes: rule.maxBytes },
      );
    }
    const key = this.storage.buildKey('course-materials', lessonId, `${randomUUID()}.${rule.ext}`);
    const url = await this.storage.signedUploadUrl(key, contentType, input.size);
    return {
      key,
      url,
      method: 'PUT' as const,
      headers: { 'Content-Type': contentType, 'Content-Length': String(input.size) },
      expiresInSeconds: this.storage.signedUploadTtlSeconds,
    };
  }

  /** Step 2: confirm the upload happened and attach it to the lesson. */
  async attach(
    lessonId: string,
    input: { key: string; name: string; contentType: string; size: number },
    actorId: string,
  ) {
    const lesson = await this.loadLesson(lessonId);
    // The key must be one this lesson's presign could have made, so a caller cannot attach
    // another lesson's file, a hiring document, or an arbitrary object.
    const prefix = `${this.storage.buildKey('course-materials', lessonId)}/`;
    if (!input.key.startsWith(prefix) || !/^[A-Za-z0-9/_.-]{1,512}$/.test(input.key)) {
      throw AppError.badRequest('That is not an upload key for this lesson', { field: 'key' });
    }
    if (!(await this.storage.objectExists(input.key))) {
      throw AppError.badRequest('That file was not uploaded', { field: 'key' });
    }
    const name = input.name
      .trim()
      .replace(/[\\/\r\n]/g, ' ')
      .slice(0, 160);
    if (!name) throw AppError.badRequest('Give the file a name', { field: 'name' });

    const files = filesOf(lesson.files);
    if (files.length >= MAX_FILES_PER_LESSON) {
      throw AppError.conflict(
        'CONFLICT',
        `A lesson can have at most ${MAX_FILES_PER_LESSON} files`,
      );
    }
    if (files.some((f) => f.key === input.key)) {
      throw AppError.conflict('CONFLICT', 'That file is already attached');
    }
    const file: MaterialFile = {
      id: randomUUID(),
      name,
      key: input.key,
      contentType: input.contentType,
      size: input.size,
      uploadedAt: new Date().toISOString(),
    };
    await this.prisma.lessonTemplate.update({
      where: { id: lessonId },
      data: { files: [...files, file] as never },
    });
    await this.audit.record({
      actorId,
      action: 'crs.material.attach',
      targetType: 'lesson_template',
      targetId: lessonId,
      after: { fileId: file.id, name, contentType: file.contentType, size: file.size },
    });
    return file;
  }

  async remove(lessonId: string, fileId: string, actorId: string) {
    const lesson = await this.loadLesson(lessonId);
    const files = filesOf(lesson.files);
    const file = files.find((f) => f.id === fileId);
    if (!file) throw AppError.notFound('File');
    await this.prisma.lessonTemplate.update({
      where: { id: lessonId },
      data: { files: files.filter((f) => f.id !== fileId) as never },
    });
    // The record goes first: a failed delete leaves an orphan object, never a dead link.
    await this.storage.remove(file.key).catch(() => undefined);
    await this.audit.record({
      actorId,
      action: 'crs.material.remove',
      targetType: 'lesson_template',
      targetId: lessonId,
      before: { fileId, name: file.name },
    });
    return { id: fileId, removed: true };
  }

  /** A short-lived link to read one file. */
  async downloadUrl(lessonId: string, fileId: string) {
    const lesson = await this.loadLesson(lessonId);
    const file = filesOf(lesson.files).find((f) => f.id === fileId);
    if (!file) throw AppError.notFound('File');
    return { id: fileId, name: file.name, url: await this.storage.signedDownloadUrl(file.key) };
  }

  /** Files for a lesson with fresh download links, for the teacher's lesson view. */
  async filesWithLinks(files: unknown) {
    return Promise.all(
      filesOf(files).map(async (f) => ({
        id: f.id,
        name: f.name,
        contentType: f.contentType,
        size: f.size,
        url: await this.storage.signedDownloadUrl(f.key),
      })),
    );
  }

  private async loadLesson(id: string) {
    const lesson = await this.prisma.lessonTemplate.findUnique({
      where: { id },
      select: { id: true, files: true },
    });
    if (!lesson) throw AppError.notFound('Lesson');
    return lesson;
  }
}

export function filesOf(value: unknown): MaterialFile[] {
  return Array.isArray(value)
    ? value.filter(
        (f): f is MaterialFile =>
          !!f &&
          typeof f.id === 'string' &&
          typeof f.key === 'string' &&
          typeof f.name === 'string',
      )
    : [];
}
