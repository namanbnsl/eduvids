/**
 * Google API Key Health Manager
 * 
 * Tracks the health status of multiple Google API keys and intelligently
 * selects the best available key based on:
 * - Rate limits and cooldowns
 * - Quota status
 * - Error history
 * - Block status
 */

export enum KeyStatus {
  HEALTHY = 'healthy',
  RATE_LIMITED = 'rate_limited',
  QUOTA_EXCEEDED = 'quota_exceeded',
  BLOCKED = 'blocked',
  ERROR = 'error',
}

export interface KeyHealth {
  key: string;
  status: KeyStatus;
  errorCount: number;
  successCount: number;
  lastError?: string;
  lastErrorTime?: Date;
  cooldownUntil?: Date;
  quotaResetTime?: Date;
  consecutiveErrors: number;
}

export interface KeySelectionResult {
  key: string;
  index: number;
  health: KeyHealth;
}

interface ErrorClassification {
  status: KeyStatus;
  cooldownMs?: number;
  message: string;
}

export class GoogleKeyHealthManager {
  private keyHealthMap: Map<string, KeyHealth> = new Map();
  private keys: string[] = [];
  private lastUsedIndex = -1;
  
  // Configuration
  private readonly RATE_LIMIT_COOLDOWN_MS = 60_000; // 1 minute
  private readonly QUOTA_RESET_DELAY_MS = 3600_000; // 1 hour
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  private readonly ERROR_COOLDOWN_MS = 30_000; // 30 seconds
  private readonly AUTO_HEAL_AFTER_MS = 900_000; // 15 minutes

  constructor(apiKeys: string[]) {
    if (!apiKeys.length) {
      throw new Error('At least one API key must be provided');
    }

    this.keys = [...apiKeys];
    
    // Initialize health tracking for each key
    this.keys.forEach(key => {
      this.keyHealthMap.set(key, {
        key,
        status: KeyStatus.HEALTHY,
        errorCount: 0,
        successCount: 0,
        consecutiveErrors: 0,
      });
    });
  }

  /**
   * Select the best available API key
   */
  selectKey(): KeySelectionResult {
    const now = new Date();
    const availableKeys: Array<{ key: string; index: number; health: KeyHealth }> = [];

    // First pass: find all healthy or recovered keys
    this.keys.forEach((key, index) => {
      const health = this.keyHealthMap.get(key)!;
      
      // Auto-heal keys that have been in error state for a while
      if (
        health.status !== KeyStatus.HEALTHY &&
        health.lastErrorTime &&
        now.getTime() - health.lastErrorTime.getTime() > this.AUTO_HEAL_AFTER_MS
      ) {
        health.status = KeyStatus.HEALTHY;
        health.consecutiveErrors = 0;
        health.cooldownUntil = undefined;
        health.quotaResetTime = undefined;
      }

      // Check if key is available
      if (health.status === KeyStatus.HEALTHY) {
        availableKeys.push({ key, index, health });
      } else if (health.status === KeyStatus.RATE_LIMITED && health.cooldownUntil) {
        if (now >= health.cooldownUntil) {
          health.status = KeyStatus.HEALTHY;
          health.cooldownUntil = undefined;
          availableKeys.push({ key, index, health });
        }
      } else if (health.status === KeyStatus.ERROR && health.cooldownUntil) {
        if (now >= health.cooldownUntil) {
          health.status = KeyStatus.HEALTHY;
          health.consecutiveErrors = 0;
          health.cooldownUntil = undefined;
          availableKeys.push({ key, index, health });
        }
      }
    });

    // If no keys are available, find the one closest to recovery
    if (availableKeys.length === 0) {
      console.warn('[KeyManager] No healthy keys available, finding best fallback');
      const fallback = this.findBestFallbackKey(now);
      if (fallback) {
        // Force use this key and reset its cooldown
        fallback.health.cooldownUntil = undefined;
        fallback.health.status = KeyStatus.HEALTHY;
        return fallback;
      }
      // Last resort: use first key
      const firstKey = this.keys[0];
      const firstHealth = this.keyHealthMap.get(firstKey)!;
      return { key: firstKey, index: 0, health: firstHealth };
    }

    // Round-robin among available keys, starting after last used index
    const startSearchIndex = (this.lastUsedIndex + 1) % this.keys.length;
    let selectedKey = availableKeys[0];
    
    // Try to find a key after lastUsedIndex to maintain rotation
    for (const candidate of availableKeys) {
      if (candidate.index >= startSearchIndex) {
        selectedKey = candidate;
        break;
      }
    }

    this.lastUsedIndex = selectedKey.index;
    return selectedKey;
  }

  /**
   * Find the best fallback key when all keys are unhealthy
   */
  private findBestFallbackKey(now: Date): KeySelectionResult | null {
    let bestKey: KeySelectionResult | null = null;
    let shortestWait = Infinity;

    this.keys.forEach((key, index) => {
      const health = this.keyHealthMap.get(key)!;
      
      // Skip permanently blocked or quota exceeded keys
      if (health.status === KeyStatus.BLOCKED || health.status === KeyStatus.QUOTA_EXCEEDED) {
        if (health.quotaResetTime && now >= health.quotaResetTime) {
          // Quota might have reset, try this key
          bestKey = { key, index, health };
          return;
        }
        return;
      }

      // Calculate wait time
      const waitMs = health.cooldownUntil 
        ? health.cooldownUntil.getTime() - now.getTime()
        : 0;

      if (waitMs < shortestWait) {
        shortestWait = waitMs;
        bestKey = { key, index, health };
      }
    });

    return bestKey;
  }

  /**
   * Report a successful API call
   */
  reportSuccess(key: string): void {
    const health = this.keyHealthMap.get(key);
    if (!health) return;

    health.successCount++;
    health.consecutiveErrors = 0;
    
    // If key was in error state and succeeded, mark as healthy
    if (health.status === KeyStatus.ERROR || health.status === KeyStatus.RATE_LIMITED) {
      health.status = KeyStatus.HEALTHY;
      health.cooldownUntil = undefined;
    }
  }

  /**
   * Report an API error and update key health
   */
  reportError(key: string, error: unknown): void {
    const health = this.keyHealthMap.get(key);
    if (!health) return;

    const classification = this.classifyError(error);
    const now = new Date();

    health.errorCount++;
    health.consecutiveErrors++;
    health.lastError = classification.message;
    health.lastErrorTime = now;
    health.status = classification.status;

    // Set cooldown based on error type
    if (classification.cooldownMs) {
      health.cooldownUntil = new Date(now.getTime() + classification.cooldownMs);
    }

    // Set quota reset time for quota errors
    if (classification.status === KeyStatus.QUOTA_EXCEEDED) {
      health.quotaResetTime = new Date(now.getTime() + this.QUOTA_RESET_DELAY_MS);
    }

    // Block key if too many consecutive errors
    if (health.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
      health.status = KeyStatus.BLOCKED;
      console.error(
        `[KeyManager] Key ${this.maskKey(key)} blocked after ${health.consecutiveErrors} consecutive errors`
      );
    }

    this.logKeyHealth(key, classification);
  }

  /**
   * Classify error to determine key health status
   */
  private classifyError(error: unknown): ErrorClassification {
    const errorStr = String(error).toLowerCase();
    const errorMessage = error instanceof Error ? error.message : errorStr;

    // Rate limit errors
    if (
      errorStr.includes('rate limit') ||
      errorStr.includes('429') ||
      errorStr.includes('quota exceeded per minute') ||
      errorStr.includes('too many requests')
    ) {
      return {
        status: KeyStatus.RATE_LIMITED,
        cooldownMs: this.RATE_LIMIT_COOLDOWN_MS,
        message: errorMessage,
      };
    }

    // Quota exceeded errors
    if (
      errorStr.includes('quota exceeded') ||
      errorStr.includes('billing not enabled') ||
      errorStr.includes('quota has been exhausted') ||
      errorStr.includes('insufficient quota')
    ) {
      return {
        status: KeyStatus.QUOTA_EXCEEDED,
        cooldownMs: this.QUOTA_RESET_DELAY_MS,
        message: errorMessage,
      };
    }

    // Authentication/Authorization errors (blocked keys)
    if (
      errorStr.includes('401') ||
      errorStr.includes('403') ||
      errorStr.includes('unauthorized') ||
      errorStr.includes('api key not valid') ||
      errorStr.includes('api key invalid')
    ) {
      return {
        status: KeyStatus.BLOCKED,
        message: errorMessage,
      };
    }

    // Generic errors
    return {
      status: KeyStatus.ERROR,
      cooldownMs: this.ERROR_COOLDOWN_MS,
      message: errorMessage,
    };
  }

  /**
   * Manually mark a key as blocked
   */
  markKeyBlocked(key: string): void {
    const health = this.keyHealthMap.get(key);
    if (health) {
      health.status = KeyStatus.BLOCKED;
      health.lastErrorTime = new Date();
      console.warn(`[KeyManager] Key ${this.maskKey(key)} manually marked as blocked`);
    }
  }

  /**
   * Manually mark a key as healthy
   */
  markKeyHealthy(key: string): void {
    const health = this.keyHealthMap.get(key);
    if (health) {
      health.status = KeyStatus.HEALTHY;
      health.consecutiveErrors = 0;
      health.cooldownUntil = undefined;
      health.quotaResetTime = undefined;
      console.log(`[KeyManager] Key ${this.maskKey(key)} manually marked as healthy`);
    }
  }

  /**
   * Reset all keys to healthy state
   */
  resetAllKeys(): void {
    this.keyHealthMap.forEach((health) => {
      health.status = KeyStatus.HEALTHY;
      health.consecutiveErrors = 0;
      health.cooldownUntil = undefined;
      health.quotaResetTime = undefined;
    });
    console.log('[KeyManager] All keys reset to healthy state');
  }

  /**
   * Get health status of all keys
   */
  getHealthStatus(): Map<string, KeyHealth> {
    return new Map(this.keyHealthMap);
  }

  /**
   * Get summary statistics
   */
  getStats() {
    const stats = {
      total: this.keys.length,
      healthy: 0,
      rateLimited: 0,
      quotaExceeded: 0,
      blocked: 0,
      error: 0,
      totalSuccesses: 0,
      totalErrors: 0,
    };

    this.keyHealthMap.forEach((health) => {
      stats.totalSuccesses += health.successCount;
      stats.totalErrors += health.errorCount;

      switch (health.status) {
        case KeyStatus.HEALTHY:
          stats.healthy++;
          break;
        case KeyStatus.RATE_LIMITED:
          stats.rateLimited++;
          break;
        case KeyStatus.QUOTA_EXCEEDED:
          stats.quotaExceeded++;
          break;
        case KeyStatus.BLOCKED:
          stats.blocked++;
          break;
        case KeyStatus.ERROR:
          stats.error++;
          break;
      }
    });

    return stats;
  }

  /**
   * Mask API key for logging
   */
  private maskKey(key: string): string {
    if (key.length <= 8) return '***';
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  }

  /**
   * Log key health information
   */
  private logKeyHealth(key: string, classification: ErrorClassification): void {
    const health = this.keyHealthMap.get(key)!;
    const maskedKey = this.maskKey(key);
    
    console.warn(
      `[KeyManager] Key ${maskedKey} - Status: ${health.status} | ` +
      `Consecutive Errors: ${health.consecutiveErrors}/${this.MAX_CONSECUTIVE_ERRORS} | ` +
      `Error: ${classification.message.slice(0, 100)}`
    );

    if (health.cooldownUntil) {
      const waitSeconds = Math.round(
        (health.cooldownUntil.getTime() - Date.now()) / 1000
      );
      console.warn(
        `[KeyManager] Key ${maskedKey} cooling down for ${waitSeconds}s`
      );
    }
  }

  /**
   * Print detailed health report
   */
  printHealthReport(): void {
    console.log('\n========== Google API Key Health Report ==========');
    const stats = this.getStats();
    
    console.log(`Total Keys: ${stats.total}`);
    console.log(`  Healthy: ${stats.healthy}`);
    console.log(`  Rate Limited: ${stats.rateLimited}`);
    console.log(`  Quota Exceeded: ${stats.quotaExceeded}`);
    console.log(`  Blocked: ${stats.blocked}`);
    console.log(`  Error: ${stats.error}`);
    console.log(`Total Successes: ${stats.totalSuccesses}`);
    console.log(`Total Errors: ${stats.totalErrors}`);
    
    console.log('\nPer-Key Details:');
    this.keys.forEach((key, index) => {
      const health = this.keyHealthMap.get(key)!;
      const maskedKey = this.maskKey(key);
      console.log(
        `  [${index + 1}] ${maskedKey} - ${health.status.toUpperCase()} | ` +
        `Success: ${health.successCount} | Errors: ${health.errorCount} (${health.consecutiveErrors} consecutive)`
      );
      if (health.lastError) {
        console.log(`      Last Error: ${health.lastError.slice(0, 80)}`);
      }
      if (health.cooldownUntil) {
        const remaining = Math.max(0, health.cooldownUntil.getTime() - Date.now());
        console.log(`      Cooldown: ${Math.round(remaining / 1000)}s remaining`);
      }
    });
    console.log('==================================================\n');
  }
}
