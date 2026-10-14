import type { CareEvent } from "./models";

/** Friendly labels; the stored treatment outcomes keep their existing values. */
export function outcomeText(outcome: CareEvent["outcome"]) {
  return {
    Improved: "Better",
    "No change": "Same",
    Worsened: "Worse",
    "Not yet checked": "Not checked yet",
  }[outcome];
}
