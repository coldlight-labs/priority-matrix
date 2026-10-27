// Violation: the server importing a package instead of Node's own modules.
import { describe } from "vitest";

export const badPackage = describe;
