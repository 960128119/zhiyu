"use client";

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Clipboard is not available");
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (error) {
    console.warn("[Clipboard] navigator.clipboard.writeText failed:", error);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Fallback copy command was rejected");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
