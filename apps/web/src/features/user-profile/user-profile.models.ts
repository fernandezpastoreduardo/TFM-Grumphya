export type PlanCode = "ILUMINADO" | "FALTON";
export type PlanStatus = "active" | "inactive";
export type AccountPlan = {
  plan: PlanCode;
  status: PlanStatus;
  startsAt: string | null;
  expiresAt: string | null;
  attemptsRemaining: { ideas: number; roasts: number };
};
export type AccountProfile = {
  user: {
    role: "user" | "admin";
    email: string;
    username: string;
    emailVerified: boolean;
    createdAt: string;
    publicRankingsOptIn: boolean;
    avatarUrl?: string | null;
  };
  plans: AccountPlan[];
};
export type GoodIdea = { id: string; title: string; createdAt: string };

export type PlanContent = {
  name: string;
  id: string;
  description: string;
  attempts: (plan: AccountPlan) => string;
};
