import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react's own auto-cleanup only registers itself when it can see a global
// `afterEach` (vitest's `globals: true`, which this project doesn't set - see vitest.config.ts).
// Without this, a component rendered in one test stays mounted into the next test within the
// same file: two tests both querying by role/placeholder/text can then collide on stale DOM from
// an earlier test, causing failures (or worse, false positives) that vanish when the test is run
// in isolation - see RuleConditionGroupsEditor.test.tsx's second test for a caught example.
afterEach(() => {
  cleanup();
});
