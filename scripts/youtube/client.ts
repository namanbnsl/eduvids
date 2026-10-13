import "dotenv/config";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

/** The same OAuth credentials the app uploads with (see README). */
export function youtubeClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } =
    process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    console.error(
      "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN in .env",
    );
    process.exit(1);
  }
  const auth = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return google.youtube({ version: "v3", auth });
}

export function isQuotaError(error: unknown) {
  const reason = (error as { errors?: { reason?: string }[] })?.errors?.[0]
    ?.reason;
  return reason === "quotaExceeded" || reason === "dailyLimitExceeded";
}

export function flag(name: string): string | true | undefined {
  const arg = process.argv.find(
    (a) => a === `--${name}` || a.startsWith(`--${name}=`),
  );
  if (!arg) return undefined;
  return arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : true;
}
