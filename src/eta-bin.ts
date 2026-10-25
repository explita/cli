#!/usr/bin/env node

import { runTunnelCli } from "./tunnel/core/cli.js";
import { displayError } from "./lib/utils.js";

runTunnelCli(process.argv.slice(2)).catch(displayError);
