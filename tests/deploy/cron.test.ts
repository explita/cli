import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCrons,
  isValidCron,
  parseCron,
  matchesCron,
  getNextCronRun,
  describeCron,
} from "@explita/infra-protocol";

describe("Cron parsing and normalization", () => {
  it("normalizeCrons handles empty, invalid, and populated lists", () => {
    assert.deepEqual(normalizeCrons(null), []);
    assert.deepEqual(normalizeCrons(undefined), []);
    assert.deepEqual(normalizeCrons([]), []);
    assert.deepEqual(normalizeCrons("not-array"), []);

    const input = [
      { schedule: "0 2 * * *", command: "npm run cleanup" },
      {
        id: "sync-job",
        name: "Sync Feeds",
        schedule: "*/30 * * * *",
        command: "npm run sync-feeds",
        timeout: 120,
        paused: true,
      },
      { schedule: "", command: "invalid" }, // missing schedule
      { schedule: "* * * * *" }, // missing command
    ];

    const normalized = normalizeCrons(input);
    assert.equal(normalized.length, 2);

    assert.equal(normalized[0].id, "cron-1");
    assert.equal(normalized[0].name, "cron-1");
    assert.equal(normalized[0].schedule, "0 2 * * *");
    assert.equal(normalized[0].command, "npm run cleanup");
    assert.equal(normalized[0].paused, undefined);

    assert.equal(normalized[1].id, "sync-job");
    assert.equal(normalized[1].name, "Sync Feeds");
    assert.equal(normalized[1].schedule, "*/30 * * * *");
    assert.equal(normalized[1].command, "npm run sync-feeds");
    assert.equal(normalized[1].timeout, 120);
    assert.equal(normalized[1].paused, true);
  });

  it("isValidCron correctly identifies valid and invalid cron expressions", () => {
    assert.equal(isValidCron("* * * * *"), true);
    assert.equal(isValidCron("*/5 * * * *"), true);
    assert.equal(isValidCron("0 2 * * *"), true);
    assert.equal(isValidCron("30 8-18/2 * * 1-5"), true);
    assert.equal(isValidCron("@daily"), true);
    assert.equal(isValidCron("@hourly"), true);
    assert.equal(isValidCron("@weekly"), true);

    // Invalid
    assert.equal(isValidCron("invalid"), false);
    assert.equal(isValidCron("* * * *"), false); // 4 parts
    assert.equal(isValidCron("* * * * * *"), false); // 6 parts
    assert.equal(isValidCron("65 * * * *"), false); // minute > 59
    assert.equal(isValidCron("* 25 * * *"), false); // hour > 23
    assert.equal(isValidCron("* * 32 * *"), false); // day > 31
    assert.equal(isValidCron("* * * 13 *"), false); // month > 12
    assert.equal(isValidCron("* * * * 8"), false); // dow > 7
  });

  it("matchesCron accurately matches dates", () => {
    // 2026-10-10 14:30:00 (Saturday)
    const testDate = new Date(2026, 9, 10, 14, 30, 0); // month is 0-indexed: 9 = October

    assert.equal(matchesCron("30 14 * * *", testDate), true);
    assert.equal(matchesCron("*/15 14 * * *", testDate), true);
    assert.equal(matchesCron("*/10 * * * *", testDate), true);
    assert.equal(matchesCron("* * * * 6", testDate), true); // 6 = Saturday
    assert.equal(matchesCron("* * * * SAT", testDate), true);

    // Mismatches
    assert.equal(matchesCron("0 14 * * *", testDate), false); // minute mismatch
    assert.equal(matchesCron("30 15 * * *", testDate), false); // hour mismatch
    assert.equal(matchesCron("* * * * 1-5", testDate), false); // weekday mismatch (it's Saturday)
  });

  it("getNextCronRun calculates next occurrence forward", () => {
    // 2026-10-10 14:15:00
    const from = new Date(2026, 9, 10, 14, 15, 0);

    // Next occurrence of every 30 minutes
    const next1 = getNextCronRun("*/30 * * * *", from);
    assert.ok(next1);
    assert.equal(next1.getMinutes(), 30);
    assert.equal(next1.getHours(), 14);

    // Next occurrence of 0 2 * * * (daily at 2am)
    const next2 = getNextCronRun("0 2 * * *", from);
    assert.ok(next2);
    assert.equal(next2.getHours(), 2);
    assert.equal(next2.getMinutes(), 0);
    assert.equal(next2.getDate(), 11); // next day
  });

  it("describeCron formats readable string descriptions", () => {
    assert.equal(describeCron("* * * * *"), "Every minute");
    assert.equal(describeCron("*/5 * * * *"), "Every 5 minutes");
    assert.equal(describeCron("*/30 * * * *"), "Every 30 minutes");
    assert.equal(describeCron("0 0 * * *"), "Daily at midnight (00:00)");
    assert.equal(describeCron("0 2 * * *"), "Daily at 02:00");
    assert.equal(describeCron("@hourly"), "Every hour at :00");
  });
});
