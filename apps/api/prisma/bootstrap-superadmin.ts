import { createInterface } from 'node:readline/promises';

import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { LOGIN_SECURITY } from '@hifzoon/shared';
import * as argon2 from 'argon2';

/**
 * Bootstraps the *first* SUPER_ADMIN (CMP-BE-05, NFR-SEC-02).
 *
 * Why a script and not an API endpoint:
 *
 *   Registration already refuses any role outside GUARDIAN/STUDENT/CHILD_STUDENT, and
 *   that refusal is load-bearing. An endpoint that promotes a caller to SUPER_ADMIN
 *   would hand every attacker a one-request path to full control of children's data.
 *   The first administrator has to be created by someone who already has database
 *   access — which is exactly the trust boundary this script sits at.
 *
 * Usage:
 *   npm run bootstrap:superadmin -- --email you@example.com
 *   SUPERADMIN_PASSWORD=... npm run bootstrap:superadmin -- --email you@example.com
 *
 * Refuses to run when an active SUPER_ADMIN already exists, unless --force is passed.
 * That guard exists so this script cannot be replayed later to slip in a second
 * administrator; bootstrapping is a first-run action, not an ongoing one.
 */

const prisma = new PrismaClient();

interface Args {
  email?: string;
  name?: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--email') args.email = argv[i + 1];
    else if (argv[i] === '--name') args.name = argv[i + 1];
    else if (argv[i] === '--force') args.force = true;
  }
  return args;
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.SUPERADMIN_PASSWORD;
  if (fromEnv) return fromEnv;

  if (!process.stdin.isTTY) {
    throw new Error(
      'No password supplied. Set SUPERADMIN_PASSWORD, or run this from an interactive terminal. ' +
        'Passing a password as an argument would leave it in your shell history.',
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question('Password for the super admin: ', {
    hideEchoBack: true,
  } as never);
  rl.close();
  return password.trim();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.email ?? process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('A valid --email is required (or set SUPERADMIN_EMAIL).');
  }

  const existing = await prisma.user.findFirst({
    where: { roles: { some: { role: Role.SUPER_ADMIN } }, status: UserStatus.ACTIVE },
    select: { id: true, email: true, name: true },
  });

  if (existing && !args.force) {
    throw new Error(
      `An active super admin already exists (${existing.email}). ` +
        'If you genuinely need another one, re-run with --force and record why.',
    );
  }

  const password = await readPassword();
  if (password.length < LOGIN_SECURITY.PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Password must be at least ${LOGIN_SECURITY.PASSWORD_MIN_LENGTH} characters ` +
        '(the same rule the API enforces).',
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const name = args.name ?? 'Super Admin';

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      // Resetting the password is deliberate: whoever runs this is taking ownership of
      // the account, and a stale password would silently lock them out later.
      passwordHash,
      name,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      name,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      roles: { create: [{ role: Role.SUPER_ADMIN }] },
      notificationPreferences: { create: {} },
    },
    select: { id: true, email: true, name: true },
  });

  // The role row is upserted separately rather than through a nested connect in the
  // same statement, so the operation stays readable and is idempotent either way.
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: Role.SUPER_ADMIN } },
    update: {},
    create: { userId: user.id, role: Role.SUPER_ADMIN },
  });

  // Re-read rather than reporting the pre-grant row, so the summary tells the truth.
  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: true },
    orderBy: { role: 'asc' },
  });

  // Every permission in one go, so the new admin is not silently missing anything.
  await prisma.rolePermission.upsert({
    where: { role_permission: { role: Role.SUPER_ADMIN, permission: '*' } },
    update: {},
    create: { role: Role.SUPER_ADMIN, permission: '*' },
  });

  console.log(
    [
      '',
      '  Super admin ready.',
      `  email:    ${user.email}`,
      `  name:     ${user.name}`,
      `  roles:    ${roles.map((r) => r.role).join(', ')}`,
      '',
      '  The password is not printed or logged. Store it in your password manager now —',
      '  it is hashed and cannot be recovered from the database.',
      '',
    ].join('\n'),
  );
}

main()
  .catch((error: unknown) => {
    console.error(`\n  ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
