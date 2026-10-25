import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    target: "node18",
    platform: "node",
    clean: true,
    dts: false,
    noExternal: [/.*/],
  },
  {
    entry: {
      "main-bin": "src/main-bin.ts",
      "eta-bin": "src/eta-bin.ts",
      "eda-bin": "src/eda-bin.ts",
      version: "src/version.ts",
    },
    format: ["esm"],
    target: "node18",
    platform: "node",
    clean: true,
    dts: false,
    noExternal: [/.*/],
  },
]);
