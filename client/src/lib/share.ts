import html2canvas from "html2canvas";

const FOOTER_HEIGHT = 48;
const FOOTER_PADDING = 16;

function drawFooter(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const original = canvas;
  const footerCanvas = document.createElement("canvas");
  footerCanvas.width = original.width;
  footerCanvas.height = original.height + FOOTER_HEIGHT;

  const ctx = footerCanvas.getContext("2d");
  if (!ctx) return original;

  ctx.drawImage(original, 0, 0);

  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, original.height, footerCanvas.width, FOOTER_HEIGHT);

  const appName = "Golf Betting";
  const appUrl = window.location.origin;

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";
  const footerY = original.height + FOOTER_HEIGHT / 2;
  ctx.fillText(appName, FOOTER_PADDING, footerY);

  const nameWidth = ctx.measureText(appName).width;

  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(` \u2022 ${appUrl}`, FOOTER_PADDING + nameWidth, footerY);

  return footerCanvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to create image blob"));
      }
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function shareElement(
  element: HTMLElement,
  title: string,
  text?: string,
  fileName = "golf-betting-share.png"
): Promise<void> {
  const captured = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (_doc, clonedEl) => {
      clonedEl.querySelectorAll("[data-share-exclude]").forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
    },
  });

  const finalCanvas = drawFooter(captured);
  const blob = await canvasToBlob(finalCanvas);

  if (navigator.share && typeof navigator.canShare === "function") {
    const file = new File([blob], fileName, { type: "image/png" });
    const shareData: ShareData = { title, files: [file] };
    if (text) shareData.text = text;

    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return;
    }
  }

  downloadBlob(blob, fileName);
}
