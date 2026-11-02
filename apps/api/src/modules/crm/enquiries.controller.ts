import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';

import { Public } from '../../common/decorators';
import { ZodBody } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CrmService } from './crm.service';

const enquiryBody = z
  .object({
    contactName: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(5).max(32).optional(),
    country: z.string().length(2).optional(),
    city: z.string().trim().max(120).optional(),
    courseInterest: z.string().max(60).optional(),
    timeZone: z.string().max(64).optional(),
    childAge: z.number().int().min(3).max(18).optional(),
    message: z.string().trim().max(1000).optional(),
    /** Left empty by people; filled by form-filling bots. */
    website: z.string().max(0).optional(),
  })
  .strict();

/**
 * A family's own enquiry from the public site — today, from trial booking when no open time
 * suits them. It becomes a NEW lead in the CRM with a follow-up task, so nobody who reached
 * out is lost because the calendar happened to be full.
 */
@ApiTags('enquiries')
@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly crm: CrmService) {}

  @Public()
  @ZodBody(enquiryBody)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ask the academy to get in touch (creates or updates a CRM lead)' })
  async create(@Body(new ZodValidationPipe(enquiryBody)) body: z.infer<typeof enquiryBody>) {
    await this.crm.createEnquiry(body);
    // The same answer whether a lead was created or an open one updated: no lookup oracle.
    return { received: true };
  }
}
