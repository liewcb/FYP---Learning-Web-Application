/** Profile pictures: small square images in the private `avatars` bucket. */

export const avatarTypes = ["image/webp", "image/jpeg", "image/png"] as const;

export type AvatarType = (typeof avatarTypes)[number];

export const avatarRules = {
  /** The picture as stored: the browser shrinks it to this square first. */
  pixels: 256,
  /** Largest stored picture; also the bucket's limit. */
  maxBytes: 1_048_576,
  /** Largest photo a student may pick before it is shrunk. */
  maxSourceBytes: 15 * 1_048_576,
} as const;

export const avatarExtensions: Readonly<Record<AvatarType, string>> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const avatarPathPattern = new RegExp(`^(${uuid})/(${uuid})\\.(webp|jpg|png)$`);

/** A stored picture's path, <owner id>/<random id>.<extension>, or null. */
export function parseAvatarPath(value: unknown): { readonly ownerId: string; readonly path: string } | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = avatarPathPattern.exec(value);

  return match ? { ownerId: match[1], path: value } : null;
}

/**
 * Same-site link that shows a picture (see app/avatars/[owner]/[file]). Each
 * upload has a new name, so the link never changes what it shows and the
 * browser may keep it.
 */
export function avatarHref(path: string | null | undefined): string | null {
  return parseAvatarPath(path) ? `/avatars/${path}` : null;
}

/** The picture's real format, from its first bytes, whatever its name says. */
export function detectAvatarType(bytes: Uint8Array): AvatarType | null {
  const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value);

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "image/png";
  }

  if (startsWith(0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }

  // "RIFF" <size> "WEBP"
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export type AvatarUpdateState =
  | { readonly status: "saved"; readonly avatarUrl: string | null }
  | { readonly status: "failed"; readonly error: string };

export const avatarMessages = {
  signedOut: "Your session has expired. Please log in again.",
  notImage: "Choose a JPG, PNG or WebP picture.",
  tooLarge: "That picture is too large. Choose a smaller one.",
  unavailable: "Your picture could not be saved. Please try again.",
} as const;
