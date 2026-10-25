import {
  DEFAULT_TUNNEL_SERVER_URL,
  LOCAL_TUNNEL_SERVER_URL,
} from "@explita/infra-protocol";

export { DEFAULT_TUNNEL_SERVER_URL, LOCAL_TUNNEL_SERVER_URL };
export { CLI_VERSION } from "../../version.js";

export const TUNNEL_SERVER_URL =
  process.env.TUNNEL_SERVER_URL || DEFAULT_TUNNEL_SERVER_URL;

export const INSPECTOR_PORT = 39755;
