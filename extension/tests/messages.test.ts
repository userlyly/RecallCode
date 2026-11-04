import { it, expect } from "vitest";
import { allowedSender } from "../src/domain/messages";
it("rejects forged extension identities, foreign origins, invalid paths and URLs", () => {
  expect(
    allowedSender(
      { id: "ours", url: "https://leetcode.cn/problems/two-sum/" },
      "ours",
    ),
  ).toBe(true);
  expect(
    allowedSender(
      { id: "ours", url: "https://leetcode.com/problems/two-sum/" },
      "ours",
    ),
  ).toBe(true);
  for (const sender of [
    { id: "other", url: "https://leetcode.cn/problems/two-sum/" },
    { id: "ours", url: "https://leetcode.cn.evil.test/problems/two-sum/" },
    { id: "ours", url: "https://leetcode.cn/problem-list/a/" },
    { id: "ours", url: "not-a-url" },
    {},
  ])
    expect(allowedSender(sender, "ours")).toBe(false);
});
