import type { RecordingMarkerKind } from '@prisma/client';

import type { PrismaService } from '../../prisma/prisma.service';

/**
 * A chapter mark on the class recording (FR-CLS-12): page turns, highlights and mistakes,
 * at their offset from when recording started, so a family can jump to "the mistake on
 * 2:255" instead of scrubbing. Nothing is written when the class is not being recorded.
 *
 * While a recording is RECORDING its `updatedAt` is the moment it (re)started: nothing
 * else writes the row until it stops.
 */
export async function writeRecordingMarker(
  prisma: PrismaService,
  classId: string,
  marker: { kind: RecordingMarkerKind; surah?: number; ayah?: number; wordIndex?: number },
): Promise<void> {
  // Best effort: a missing marker costs a chapter, a failed page turn would cost the class.
  try {
    await write(prisma, classId, marker);
  } catch {
    // Nothing to do: the class goes on.
  }
}

async function write(
  prisma: PrismaService,
  classId: string,
  marker: { kind: RecordingMarkerKind; surah?: number; ayah?: number; wordIndex?: number },
) {
  const recording = await prisma.recording.findUnique({
    where: { classId },
    select: { id: true, status: true, updatedAt: true },
  });
  if (!recording || recording.status !== 'RECORDING') return;
  await prisma.recordingMarker.create({
    data: {
      recordingId: recording.id,
      kind: marker.kind,
      surah: marker.surah ?? null,
      ayah: marker.ayah ?? null,
      wordIndex: marker.wordIndex ?? null,
      offsetMs: Math.max(0, Date.now() - recording.updatedAt.getTime()),
    },
  });
}
