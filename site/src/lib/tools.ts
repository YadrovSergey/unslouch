import type { Dict } from "../i18n/en";

export type ToolKey = keyof Dict["tools"]["list"];

/** Order on the tools index and in "other tools". */
export const TOOL_ORDER: ToolKey[] = [
  "eyeTimer",
  "generator",
  "deskHeight",
  "checklist",
  "sitting",
  "eyeCheck",
  "focus",
  "breathing",
];
