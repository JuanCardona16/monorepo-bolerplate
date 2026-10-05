import { Schema, model, models, type Model } from "mongoose";

const passwordResetTokenSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userUuid: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, required: false, default: null },
  },
  { collection: "password_reset_tokens", timestamps: false },
);

export interface PasswordResetTokenDoc {
  id: string;
  userUuid: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export const PasswordResetTokenModel = (models["PasswordResetToken"] ??
  model<PasswordResetTokenDoc>("PasswordResetToken", passwordResetTokenSchema)) as Model<PasswordResetTokenDoc>;
