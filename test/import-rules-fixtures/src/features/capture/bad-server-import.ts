// Violation: app code importing server code.
import { goodServer } from "../../../server/good-server";

export const badServerImport = goodServer;
