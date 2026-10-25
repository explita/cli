#!/usr/bin/env node

import { handleDeployCommand } from "./deploy/commands/deploy.js";
import { displayError } from "./lib/utils.js";

handleDeployCommand(process.argv.slice(2)).catch(displayError);
