/// <reference types="node" />
// Server entry point (ADR 0003): read the settings, start listening.

import { readConfig } from "./config";
import { startServer } from "./http";

const config = readConfig(process.env);
const running = await startServer(config);
console.log(JSON.stringify({ event: "listening", port: running.port }));
