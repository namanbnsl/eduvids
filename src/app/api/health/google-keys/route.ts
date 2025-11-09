import { NextResponse } from "next/server";
import { getKeyPoolInfo, getKeyStats, printHealthReport } from "@/lib/google-provider";

/**
 * API endpoint to check Google API key health status
 * GET /api/health/google-keys
 */
export async function GET() {
  try {
    const poolInfo = getKeyPoolInfo();
    const stats = getKeyStats();
    
    // Also print detailed report to console for debugging
    if (process.env.DEBUG_API_KEYS === "true") {
      printHealthReport();
    }
    
    return NextResponse.json({
      status: "ok",
      poolInfo,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching Google key health:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
