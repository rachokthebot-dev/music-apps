import { prisma } from "./prisma";

export const SETTING_KEYS = {
  toneCloudEmail: "tonecloud.email",
  toneCloudPassword: "tonecloud.password",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export interface ToneCloudCreds {
  email: string;
  password: string;
}

/** Null when either half is missing — callers should prompt rather than half-try a login. */
export async function getToneCloudCreds(): Promise<ToneCloudCreds | null> {
  const [email, password] = await Promise.all([
    getSetting(SETTING_KEYS.toneCloudEmail),
    getSetting(SETTING_KEYS.toneCloudPassword),
  ]);
  if (!email || !password) return null;
  return { email, password };
}
