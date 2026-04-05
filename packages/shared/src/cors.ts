/**
 * Shared CORS headers and OPTIONS handler for API routes.
 * Used by stats endpoints accessed cross-origin from the dashboard.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;
