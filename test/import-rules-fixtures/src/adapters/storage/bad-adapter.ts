// Violation: an adapter imports a feature.
import { listView } from "../../features/tasks-list/list";

export const badAdapter = listView;
