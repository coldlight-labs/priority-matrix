// Violation: core imports an adapter.
import { memoryStore } from "../adapters/storage/memory";

export const badCore = memoryStore;
