import handler from "./report-access.mts";

export default handler;

export const config = {
  path: [
    "/reports/clinic-status-july-2026.html",
    "/reports/clinic-status-january-2027-projection.html",
  ],
  method: ["GET", "POST"],
  onError: "continue",
};
