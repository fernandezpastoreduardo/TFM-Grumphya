export type AdminContactReplyStatus =
  "not_replied" | "sending" | "sent" | "previewed" | "uncertain";

export type AdminContactMessage = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  sender: { username: string; email: string };
  reply: {
    status: AdminContactReplyStatus;
    attemptedAt: string | null;
    retryAllowed: boolean;
  };
};

export type AdminLighthouseRun = {
  commitSha: string;
  measuredAt: string;
  page: "home" | "precios" | "lo-peor-de-lo-peor";
  device: "mobile" | "desktop";
  sampleCount: 3;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  speedIndexMs: number | null;
};
