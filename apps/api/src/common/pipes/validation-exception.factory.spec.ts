import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsIn, IsString, ValidateNested } from 'class-validator';
import { validateSync } from 'class-validator';

import { collectFieldErrors, validationExceptionFactory } from './validation-exception.factory';

enum RoomType {
  ONE_TO_ONE = 'ONE_TO_ONE',
  CIRCLE = 'CIRCLE',
}

class Child {
  @IsString() name!: string;
}

class Body {
  @IsEnum(RoomType) roomType!: RoomType;
  @IsIn(['TRIAL', 'REGULAR']) type!: string;
  @IsString() policyVersion!: string;
  @ValidateNested()
  @Type(() => Child)
  child!: Child;
}

describe('collectFieldErrors (Q25)', () => {
  const errors = validateSync(
    plainToInstance(Body, { roomType: 'NOPE', type: 'X', child: { name: 5 } }),
  );

  it('names the property, not the value list that follows "must be one of"', () => {
    const fields = collectFieldErrors(errors).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['roomType', 'type']));
    expect(fields.some((f) => f.endsWith(','))).toBe(false);
  });

  it('keeps messages that contain no colon (e.g. a missing string)', () => {
    const missing = collectFieldErrors(errors).find((e) => e.field === 'policyVersion');
    expect(missing?.messages[0]).toMatch(/policyVersion must be a string/);
  });

  it('reports nested properties as parent.child', () => {
    expect(collectFieldErrors(errors).map((e) => e.field)).toContain('child.name');
  });

  it('produces a 400 carrying details for the filter', () => {
    const exception = validationExceptionFactory(errors);
    expect(exception.getStatus()).toBe(400);
    const body = exception.getResponse() as { details: unknown[]; message: string[] };
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.message.length).toBeGreaterThan(0);
  });
});
