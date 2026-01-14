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
  token: process.env.QSTASH_TOKEN!,
});

export const qstashClientWithBypass = new QStashClient({
  token: process.env.QSTASH_TOKEN!,
  ...(() => {
    const headers = getBypassHeaders();
    return Object.keys(headers).length > 0 ? { headers } : {};
  })(),
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
