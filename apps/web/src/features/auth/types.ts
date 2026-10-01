export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface SessionPayload {
  accessToken: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface Profile {
  uuid: string;
  email: string;
  roles: string[];
}
