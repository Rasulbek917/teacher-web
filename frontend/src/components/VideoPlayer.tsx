import React from 'react';
import { fileUrl } from '../lib/api';

/**
 * Sayt ichida video darslar — yuklab olish imkoniyati yo'q,
 * ochilgan videolarni topiladigan kontekst menyu bosilmaydi.
 */
export function VideoPlayer({ src, poster }: { src: string; poster?: string | null }) {
  return (
    <video
      src={fileUrl(src)}
      poster={poster ? fileUrl(poster) : undefined}
      controls
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      preload="metadata"
      className="w-full rounded-xl bg-black"
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/** YouTube havolasidan embed url olish */
export function youtubeEmbed(url: string): string {
  const u = new URL(url);
  const id =
    u.searchParams.get('v') ||
    (u.pathname.startsWith('/shorts/') ? u.pathname.slice(8) : null) ||
    (u.hostname === 'youtu.be' ? u.pathname.slice(1) : null);
  return id ? `https://www.youtube.com/embed/${id}?rel=0` : url;
}