import { Schema, model, models, type Model } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userUuid: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    roles: { type: [String], required: true, default: [] },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, required: false, default: null },
    rememberMe: { type: Boolean, required: true },
  },
  { collection: "refresh_tokens", timestamps: false },
);

export interface RefreshTokenDoc {
  id: string;
  userUuid: string;
  tokenHash: string;
  roles: string[];
  expiresAt: Date;
  revokedAt: Date | null;
  rememberMe: boolean;
}

export const RefreshTokenModel = (models["RefreshToken"] ??
  model<RefreshTokenDoc>("RefreshToken", refreshTokenSchema)) as Model<RefreshTokenDoc>;
