export type ApiError = {
  code?: string | null;
  message?: string | null;
  field?: string | null;
};

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string | null;
  errors?: ApiError[] | null;
  meta?: Record<string, unknown> | null;
};

export type AuthTokens = {
  token: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  expiresAt?: string | null;
};

export type AuthUser = {
  id?: string;
  fullName?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type HubConnectionToken = {
  accessToken: string;
};
