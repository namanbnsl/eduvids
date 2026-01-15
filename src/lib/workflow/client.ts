import { Client } from "@upstash/workflow";
import { Client as QStashClient } from "@upstash/qstash";

const getBypassHeaders = (): Record<string, string> => {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    return {
      "x-vercel-protection-bypass": bypassSecret,
    };
  }
  return {};
};

export const workflowClient = new Client({
  headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? {
        "x-vercel-protection-bypass":
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      }
    : undefined,
  token: process.env.QSTASH_TOKEN!,
});

export const qstashClientWithBypass = new QStashClient({
  token: process.env.QSTASH_TOKEN!,
  headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? {
        "x-vercel-protection-bypass":
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      }
    : undefined,
});

export const getBaseUrl = () => {
  if (process.env.UPSTASH_WORKFLOW_URL) {
    return process.env.UPSTASH_WORKFLOW_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
};

export const getTriggerHeaders = (): Record<string, string> => {
  return getBypassHeaders();
};
