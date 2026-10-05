import { Schema, model, models, type Model } from "mongoose";

const authUserSchema = new Schema(
  {
    uuid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], required: true, default: [] },
  },
  { collection: "auth_users", timestamps: false },
);

export interface AuthUserDoc {
  uuid: string;
  email: string;
  passwordHash: string;
  roles: string[];
}

export const AuthUserModel = (models["AuthUser"] ??
  model<AuthUserDoc>("AuthUser", authUserSchema)) as Model<AuthUserDoc>;
