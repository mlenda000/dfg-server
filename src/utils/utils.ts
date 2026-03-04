export function parseContent(content: string): any {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (typeof parsed === "object") {
      return parsed;
    }
  } catch (e) {
    // If JSON.parse fails, return the content as a string
    return content;
  }
}
