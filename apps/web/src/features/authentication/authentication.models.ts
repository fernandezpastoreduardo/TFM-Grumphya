export type LoginRole = "user" | "admin";

export type LoginResponse = {
  accessToken: string;
  account: { user: { role: LoginRole } };
};
