"use client";

import { useState } from "react";

/**
 * A profile picture laid over the initials around it. The initials stay
 * when there is no picture, or when it cannot be loaded.
 */
export function AvatarImage({ url }: { readonly url: string | null | undefined }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return null;
  }

  return (
    // Same-site link that redirects to a signed Storage URL, so next/image cannot optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="avatar-image"
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedUrl(url)}
    />
  );
}

interface AvatarProps {
  /** The avatar's size and colours, e.g. "chat-avatar large". */
  readonly className: string;
  readonly initials: string;
  readonly url?: string | null;
}

/** A person's picture, or their initials. Decorative: the name is always shown beside it. */
export function Avatar({ className, initials, url }: AvatarProps) {
  return (
    <span className={url ? `${className} has-avatar` : className} aria-hidden="true">
      {initials}
      <AvatarImage url={url} />
    </span>
  );
}
