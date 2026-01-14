import { Client } from "@upstash/workflow";

export const workflowClient = new Client({
  token: process.env.QSTASH_TOKEN!,
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
