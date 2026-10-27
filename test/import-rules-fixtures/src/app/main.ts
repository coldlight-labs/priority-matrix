// Allowed: app imports adapters and features.
import { memoryStore } from "../adapters/storage/memory";
import { capture } from "../features/capture/capture";

export const app = memoryStore + capture;
