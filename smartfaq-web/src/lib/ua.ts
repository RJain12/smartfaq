export function classifyDevice(ua: string): string {
  const u = ua.toLowerCase();
  if (/ipad|tablet|kindle|playbook/.test(u)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/.test(u)) {
    return "mobile";
  }
  if (/bot|crawler|spider|prerender/.test(u)) return "bot";
  return "desktop";
}
