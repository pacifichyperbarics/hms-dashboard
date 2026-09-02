import type { Config, Context } from "@netlify/edge-functions";

/**
 * Preview-branch pass-through.
 *
 * The production report-access implementation remains unchanged on master.
 * This branch isolates the operations-dashboard refactor and avoids the legacy
 * invalid `onError: "continue"` configuration blocking Netlify previews.
 */
export default async (_request: Request, context: Context) => context.next();

export const config: Config = {
  path: [
    "/reports/clinic-status-july-2026.html",
    "/reports/clinic-status-january-2027-projection.html",
  ],
  method: ["GET", "POST"],
  onError: "bypass",
};
