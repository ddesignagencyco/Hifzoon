import { ErrorCode } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import type { QuranContentProvider } from '../../integrations/providers';
import { MushafService } from './mushaf.service';

function serviceWith(provider: Partial<QuranContentProvider>) {
  return new MushafService({} as never, {} as never, provider as QuranContentProvider);
}

describe('MushafService.ayahAudio', () => {
  it('returns the licensed provider URL for the ayah', async () => {
    const recitationAudioUrl = jest.fn(
      async (s: number, a: number) => `https://audio.test/${s}/${a}.mp3`,
    );
    const svc = serviceWith({ isLicensed: () => true, recitationAudioUrl });
    await expect(svc.ayahAudio(67, 2)).resolves.toEqual({
      surah: 67,
      ayah: 2,
      url: 'https://audio.test/67/2.mp3',
    });
    expect(recitationAudioUrl).toHaveBeenCalledWith(67, 2);
  });

  it('answers 501 when the provider has no recitation audio', async () => {
    const svc = serviceWith({ isLicensed: () => true });
    const err = await svc.ayahAudio(1, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(ErrorCode.NOT_IMPLEMENTED);
  });

  it('answers 501 when the deployment is not licensed', async () => {
    const recitationAudioUrl = jest.fn();
    const svc = serviceWith({ isLicensed: () => false, recitationAudioUrl });
    const err = await svc.ayahAudio(1, 1).catch((e: unknown) => e);
    expect((err as AppError).code).toBe(ErrorCode.NOT_IMPLEMENTED);
    expect(recitationAudioUrl).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range surah', async () => {
    const svc = serviceWith({ isLicensed: () => true, recitationAudioUrl: jest.fn() });
    await expect(svc.ayahAudio(115, 1)).rejects.toBeInstanceOf(AppError);
  });
});
