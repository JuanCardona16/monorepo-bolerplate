import { defineConfig } from '@prisma/config';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The gateway loads `.env.local` before `.env`; do the same here so the CLI
// sees the same `DATABASE_URL` the app does. `dotenv.config()` alone only
// reads `.env`, which leaves `datasource.url` undefined for the migrate
// commands and makes them fail with "The datasource.url property is required".
//
// The CLI is usually run from `packages/infrastructure`, so the workspace-root
// files are not on the cwd-relative search path. Resolve them from this file
// instead: config/ -> postgresSql/ -> persistence/ -> src/ -> infrastructure/
// -> packages/ -> repo root.
const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '../../../../../..');

dotenv.config({ path: ['.env.local', '.env'] });
dotenv.config({ path: [path.join(workspaceRoot, '.env.local'), path.join(workspaceRoot, '.env')] });

export default defineConfig({
  schema: "../prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  }
})