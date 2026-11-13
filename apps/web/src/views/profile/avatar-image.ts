import { avatarRules } from "@/models/profile/avatar.model";

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Turns a chosen photo into the stored picture: the middle square, shrunk
 * to avatarRules.pixels, as WebP (JPEG on browsers that cannot write WebP).
 * Phone photos are turned upright first.
 */
export async function prepareAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = avatarRules.pixels;
    canvas.height = avatarRules.pixels;
    const context = canvas.getContext("2d");

    if (!context || side === 0) {
      throw new Error("This picture cannot be read.");
    }

    const draw = (background: string | null) => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    };

    draw(null);
    const webp = await toBlob(canvas, "image/webp", 0.86);

    if (webp && webp.type === "image/webp") {
      return webp;
    }

    // JPEG has no transparency: put see-through pictures on white.
    draw("#ffffff");
    const jpeg = await toBlob(canvas, "image/jpeg", 0.88);

    if (!jpeg) {
      throw new Error("This picture cannot be read.");
    }

    return jpeg;
  } finally {
    bitmap.close();
  }
}
