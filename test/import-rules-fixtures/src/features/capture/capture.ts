// Violations: a feature imports another feature and an adapter.
import { listView } from "../tasks-list/list";
import { memoryStore } from "../../adapters/storage/memory";

export const capture = listView + memoryStore;
