import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ENVELOPE_SCHEMA } from './common/swagger-envelope';
import { buildOpenApiConfig, normalisePaths } from './openapi-config';

/**
 * Emits the OpenAPI document to `.openapi/openapi.json` (PLAT-BE-03).
 *
 * The spec is the FE/BE contract (TRD section 6): the frontend generates its typed
 * client from this artifact, and CI diffs it against the committed copy so a breaking
 * change cannot land silently. Nothing listens on a port here — the app is created
 * in-process only to collect the document.
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

  const document = normalisePaths(SwaggerModule.createDocument(app, buildOpenApiConfig()));

  ENVELOPE_SCHEMA.inject(document);
  sortPathsForStableDiffs(document);

  const outDir = join(process.cwd(), '..', '..', '.openapi');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'openapi.json');
  writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths ?? {}).length;

  console.log(`OpenAPI written to ${outFile} (${pathCount} paths)`);

  await app.close();
}

/**
 * Sorts paths and keys so two runs of the generator produce a byte-identical file.
 * Without this, a CI diff on the spec is noise from object ordering.
 */
function sortPathsForStableDiffs(document: OpenAPIObject): void {
  if (document.paths) {
    const sorted: NonNullable<OpenAPIObject['paths']> = {};
    for (const key of Object.keys(document.paths).sort()) {
      sorted[key] = document.paths[key];
    }
    document.paths = sorted;
  }

  if (document.components?.schemas) {
    const schemas: NonNullable<NonNullable<OpenAPIObject['components']>['schemas']> = {};
    for (const key of Object.keys(document.components.schemas).sort()) {
      schemas[key] = document.components.schemas[key];
    }
    document.components.schemas = schemas;
  }
}

void generate().catch((error) => {
  console.error('OpenAPI generation failed', error);
  process.exit(1);
});
