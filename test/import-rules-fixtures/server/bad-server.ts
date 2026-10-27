// Violations: the server reaching past core's index into core, and into a feature.
import { taskRule } from "../src/core/task";
import { listView } from "../src/features/tasks-list/list";

export const badServer = [taskRule, listView];
