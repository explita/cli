#!/usr/bin/env node

import { runExplitaCli } from "./main.js";
import { displayError } from "./lib/utils.js";

runExplitaCli().catch(displayError);
