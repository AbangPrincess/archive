import { useBlobUrl } from '../lib/store';

type Props = { id?: string; thumb?: boolean; alt?: string; className?: string };

/** Shows a photo stored on the device. Renders nothing until it has loaded. */
export function Photo({ id, thumb, alt = '', className }: Props) {
  const url = useBlobUrl(id, thumb);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} loading="lazy" decoding="async" draggable={false} />;
}
