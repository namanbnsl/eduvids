import { google } from "googleapis";
import readline from "readline";

const oauth2Client = new google.auth.OAuth2(
  "YOUR_CLIENT_ID",
  "YOUR_CLIENT_SECRET",
  "http://localhost:3000/oauth2callback"
);

const scopes = ["https://www.googleapis.com/auth/youtube.upload"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: scopes,
  prompt: "consent",
});

console.log("Visit this URL to authorize:", authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste the code here: ", async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log("Your tokens:", tokens);
  rl.close();
});
