export function allowedSender(
  sender: { id?: string; url?: string },
  extensionId: string,
) {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const u = new URL(sender.url);
    return (
      u.origin === "https://leetcode.cn" &&
      /^\/problems\/[a-z0-9-]+\//.test(u.pathname)
    );
  } catch {
    return false;
  }
}
