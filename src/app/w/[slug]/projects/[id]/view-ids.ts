// Shared by the server page (reads ?view=) and the client workspace.
export const VIEW_IDS = ["overview", "table", "board", "calendar", "timeline", "log", "rfis", "submittals", "reviews", "notes"] as const;
export type ViewId = (typeof VIEW_IDS)[number];
