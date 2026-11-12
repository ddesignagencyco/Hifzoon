import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DuasService } from './duas.service';

/**
 * Teaching content that is the same for everyone (the Duas board). Signed-in users only:
 * the global JWT guard applies, as there is no `@Public()` here.
 *
 * Registered before AdmissionsModule so `/content/duas` wins over the CMS `/content/:slug`.
 */
@ApiTags('content')
@ApiBearerAuth()
@Controller('content')
export class ContentController {
  constructor(private readonly duas: DuasService) {}

  @Get('duas')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({
    summary: 'Hisn al-Muslim duas by chapter, for the classroom Duas board',
    description:
      'Arabic, transliteration, English meaning and the book reference, imported from hisnmuslim.com.',
  })
  listDuas() {
    return this.duas.list();
  }
}
