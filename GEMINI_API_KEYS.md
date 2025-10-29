# Gemini API Key Rotation System

## Overview
The application now supports automatic API key rotation for Google Gemini to handle rate limiting and overload situations.

## Setup

### 1. Configure Multiple API Keys
In your `.env` file, add up to 5 Gemini API keys:

```env
GOOGLE_GENERATIVE_AI_API_KEY_1=your_first_api_key
GOOGLE_GENERATIVE_AI_API_KEY_2=your_second_api_key
GOOGLE_GENERATIVE_AI_API_KEY_3=your_third_api_key
GOOGLE_GENERATIVE_AI_API_KEY_4=your_fourth_api_key
GOOGLE_GENERATIVE_AI_API_KEY_5=your_fifth_api_key
```

**Note:** You can configure anywhere from 1 to 5 keys. The system will work with any number of keys you provide.

## How It Works

### Automatic Failover
When a rate limit or overload error is detected, the system automatically:
1. **Blocks the rate-limited key** for 60 seconds
2. **Switches to the next available key** 
3. **Retries the request** with the new key
4. **Unblocks keys** after the timeout expires

### Error Detection
The system detects the following rate limit indicators:
- HTTP 429 status codes
- "rate limit exceeded" messages
- "quota exceeded" messages
- "resource exhausted" messages
- "too many requests" messages
- "overloaded" messages

### Key Rotation Behavior
- **Round-robin rotation**: Keys are used in sequence
- **Blocked key skipping**: Rate-limited keys are automatically skipped
- **Auto-recovery**: Blocked keys are unblocked after 60 seconds
- **Fallback**: If all keys are blocked, the system clears the blocklist and retries

## Usage

### Method 1: Automatic (Default)
The existing code automatically benefits from key rotation:

```typescript
import { createGoogleProvider } from "@/lib/google-provider";

const google = createGoogleProvider();
const model = google("gemini-2.5-flash");

// If this call hits a rate limit, the next call will use a different key
const result = await generateText({ model, prompt: "..." });
```

### Method 2: With Explicit Retry Wrapper (Recommended)
For critical operations, use the `withKeyRotation` wrapper:

```typescript
import { withKeyRotation } from "@/lib/google-provider";
import { generateText } from "ai";

const result = await withKeyRotation(async (provider) => {
  const model = provider("gemini-2.5-flash");
  return await generateText({ model, prompt: "..." });
});
```

This wrapper automatically:
- Retries with different keys on rate limit errors
- Throws immediately for non-rate-limit errors
- Tries up to `googleApiKeys.length` times by default

## Debugging

### Enable Debug Logging
Set the `DEBUG_API_KEYS` environment variable to see which keys are being used:

```env
DEBUG_API_KEYS=true
```

This will log:
- Which API key is being used for each request
- When keys are blocked due to rate limiting
- When keys are unblocked

### Check Key Pool Status
You can check the status of your key pool programmatically:

```typescript
import { getKeyPoolInfo } from "@/lib/google-provider";

const info = getKeyPoolInfo();
console.log(info);
// Output:
// {
//   totalKeys: 5,
//   currentIndex: 2,
//   hasMultipleKeys: true,
//   blockedKeys: ['AIzaSyB...'],
//   availableKeys: 4
// }
```

## Configuration

### Adjust Block Duration
To change how long keys are blocked (default: 60 seconds), edit `google-provider.ts`:

```typescript
const BLOCKLIST_DURATION_MS = 120000; // Block for 120 seconds
```

### Adjust Retry Count
When using `withKeyRotation`, you can specify max retries:

```typescript
const result = await withKeyRotation(
  async (provider) => {
    // ... your code
  },
  3 // Try up to 3 different keys
);
```

## Best Practices

1. **Use at least 2-3 API keys** for production to ensure reliability
2. **Monitor your quota usage** across all keys using Google Cloud Console
3. **Enable debug logging** during development to understand key rotation behavior
4. **Set appropriate rate limits** for your application to avoid hitting limits frequently
5. **Use the retry wrapper** for critical operations that must succeed

## Troubleshooting

### "All API keys are currently blocked"
This warning appears when all your keys have hit rate limits. The system will:
- Clear the blocklist
- Retry with the next key
- Log this event for monitoring

**Solution**: Add more API keys or reduce your request rate.

### Keys not rotating
Check that:
- You have multiple keys configured in `.env`
- Keys are properly formatted (no extra spaces or quotes)
- Environment variables are loaded correctly

### Still getting rate limit errors
If you're still hitting rate limits even with rotation:
- Add more API keys
- Implement request queuing/throttling
- Increase the block duration to give keys more time to recover
- Check your quota limits in Google Cloud Console
