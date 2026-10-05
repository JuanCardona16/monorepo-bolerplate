import mongoose from "mongoose";

export function resolveMongoUri(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env["MONGODB_URI"]?.trim();

  if (!raw) {
    throw new Error(
      "MONGODB_URI is not set. Set it in apps/api-gateway/.env.local (never commit it).",
    );
  }

  return raw;
}

export async function connectDatabase(uri?: string): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri ?? resolveMongoUri());
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
