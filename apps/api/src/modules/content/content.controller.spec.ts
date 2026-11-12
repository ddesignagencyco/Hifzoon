import { Controller, Get, INestApplication, Module, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { IS_PUBLIC_KEY } from '../../common/decorators';
import { ContentController } from './content.controller';
import { ContentModule } from './content.module';
import { DuasService } from './duas.service';
import hisnAlMuslim from '../../content/duas/hisn-al-muslim.json';

describe('DuasService', () => {
  it('serves the imported Hisn al-Muslim: 132 chapters, 267 entries, in book order', () => {
    const { source, categories } = new DuasService().list();
    expect(source.name).toMatch(/Hisn al-Muslim/);
    expect(source.url).toContain('hisnmuslim.com');
    expect(categories).toHaveLength(132);
    expect(categories.map((c) => c.id)).toEqual(Array.from({ length: 132 }, (_, i) => i + 1));
    const duas = categories.flatMap((c) => c.duas);
    expect(duas).toHaveLength(267);
    expect(duas.map((d) => d.id)).toEqual(Array.from({ length: 267 }, (_, i) => i + 1));
    for (const d of duas) {
      expect(d.arabic).toMatch(/[؀-ۿ]/);
      expect(d.reference).toMatch(new RegExp(`^Hisn al-Muslim ${d.id}\\b`));
      expect(typeof d.transliteration).toBe('string');
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.repeat).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps the text as published, without the wrapping brackets', () => {
    const first = new DuasService().list().categories[0];
    expect(first.title).toBe('Supplications for when you wake up');
    expect(first.titleAr).toBe('أذكار الاستيقاظ من النوم');
    expect(first.duas[0].arabic.startsWith('الْحَمْدُ')).toBe(true);
    expect(first.duas[0].arabic).not.toMatch(/^\(|\)$/);
    expect(first.duas[0].translation.en).toMatch(/^All praise is for Allah who gave us life/);
    expect(first.duas[0].transliteration).toMatch(/^Alhamdu lillahil-lathee/);
  });

  it('numbers entries only when a chapter has several, and sorts chapters by number', () => {
    const built = DuasService.build({
      source: hisnAlMuslim.source,
      categories: [
        {
          id: 2,
          title: { en: 'Two', ar: 'ب' },
          duas: [
            {
              id: 3,
              arabic: 'ج',
              transliteration: '',
              translation: { en: 'c' },
              repeat: 1,
              reference: 'Hisn al-Muslim 3',
            },
          ],
        },
        {
          id: 1,
          title: { en: 'One', ar: 'أ' },
          duas: [
            {
              id: 1,
              arabic: 'أ',
              transliteration: 'a',
              translation: { en: 'a' },
              repeat: 1,
              reference: 'Hisn al-Muslim 1',
            },
            {
              id: 2,
              arabic: 'ب',
              transliteration: 'b',
              translation: { en: 'b' },
              repeat: 3,
              reference: 'Hisn al-Muslim 2',
            },
          ],
        },
      ],
    });
    expect(built.categories.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(built.categories[0].duas.map((d) => d.title)).toEqual(['One (1)', 'One (2)']);
    expect(built.categories[1].duas[0].title).toBe('Two');
  });

  it('builds the collection once and returns the same object afterwards', () => {
    const service = new DuasService();
    expect(service.list()).toBe(service.list());
  });
});

/** Stands in for AdmissionsController's CMS route, registered after ContentModule as in AppModule. */
@Controller()
class CmsLikeController {
  @Get('content/:slug')
  page(@Param('slug') slug: string) {
    return { cms: slug };
  }
}
@Module({ controllers: [CmsLikeController] })
class CmsLikeModule {}

describe('GET /content/duas', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ContentModule, CmsLikeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('returns the categories, ahead of the CMS /content/:slug route', async () => {
    const res = await request(app.getHttpServer()).get('/content/duas').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=86400');
    expect(res.body.categories).toHaveLength(132);
    expect(res.body.categories[0]).toMatchObject({
      id: 1,
      title: expect.any(String),
      titleAr: expect.any(String),
    });
    expect(res.body.categories[0].duas[0]).toEqual(
      expect.objectContaining({
        id: 1,
        title: expect.any(String),
        arabic: expect.any(String),
        transliteration: expect.any(String),
        translation: { en: expect.any(String) },
        reference: 'Hisn al-Muslim 1',
      }),
    );
    await request(app.getHttpServer()).get('/content/about').expect(200, { cms: 'about' });
  });

  it('is not marked public, so the global JWT guard applies', () => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, ContentController.prototype.listDuas);
    expect(isPublic).toBeFalsy();
  });
});
