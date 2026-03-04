import { Client } from "@upstash/workflow";
import { Client as QStashClient } from "@upstash/qstash";

const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const BYPASS_HEADERS = BYPASS_SECRET
  ? { "x-vercel-protection-bypass": BYPASS_SECRET }
  : undefined;

export const workflowClient = new Client({
  headers: BYPASS_HEADERS,
  token: process.env.QSTASH_TOKEN!,
});

export const qstashClientWithBypass = new QStashClient({
  token: process.env.QSTASH_TOKEN!,
  headers: BYPASS_HEADERS,
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
  return BYPASS_HEADERS ?? {};
};
