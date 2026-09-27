import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env.local or .env.`,
    );
  }
  return value;
}

export const PORT = process.env.PORT || 3000;
export const TOKEN_SECRET_KEY = required("TOKEN_SECRET_KEY");
export const REFRESH_TOKEN_SECRET_KEY = required("REFRESH_TOKEN_SECRET_KEY");
export const DATABASE_URL = required("DATABASE_URL");

// Optional until their features land (validated lazily at point of use)
export const RESEND_KEY = process.env.RESEND_KEY;

// Google enviroments
export const CLIENT_GOOGLE_ID = process.env.CLIENT_GOOGLE_ID;
export const CLIENT_GOOGLE_SECRET = process.env.CLIENT_GOOGLE_SECRET;
