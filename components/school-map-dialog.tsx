'use client';

import { useEffect, useRef } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export type SchoolMapDialogProps = { name: string; lga: string; latitude: string; longitude: string };

const ZOOM = 15;
const THUMB_ZOOM = 12, THUMB_TILE = 128, THUMB_SIZE = 44;
const tileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const degrees = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`;

/** A small static map centred on the point: the 2×2 tiles around it, so the window never runs off the edge. */
function MapThumbnail({ lat, lon }: { lat: number; lon: number }) {
  const n = 2 ** THUMB_ZOOM, rad = lat * Math.PI / 180;
  const fx = (lon + 180) / 360 * n, fy = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5);
  const left = THUMB_SIZE / 2 - (fx - x0) * THUMB_TILE, top = THUMB_SIZE / 2 - (fy - y0) * THUMB_TILE;
  return <span aria-hidden="true" className="relative block size-11 shrink-0 overflow-hidden rounded-md border bg-muted ring-primary/40 transition-shadow group-hover:ring-2">
    {[0, 1].flatMap(dy => [0, 1].map(dx => <span key={`${dx}${dy}`} className="absolute bg-cover" style={{ width: THUMB_TILE, height: THUMB_TILE, left: left + dx * THUMB_TILE, top: top + dy * THUMB_TILE, backgroundImage: `url(${tileUrl(THUMB_ZOOM, x0 + dx, y0 + dy)})` }} />))}
    <span className="absolute top-1/2 left-1/2 size-2.5 -translate-1/2 rounded-full border-2 border-white bg-primary shadow" />
  </span>;
}

/** An interactive OpenStreetMap view (raster tiles, no WebGL) with the school marked. Leaflet loads on first open. */
function SchoolMap({ lat, lon, name }: { lat: number; lon: number; name: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import('leaflet').Map | null = null, cancelled = false, timer = 0;
    void import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { center: [lat, lon], zoom: ZOOM, scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      const primary = getComputedStyle(container.current).getPropertyValue('--primary').trim() || '#0f4c45';
      L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: primary, fillOpacity: 1 }).addTo(map).bindTooltip(name, { direction: 'top', offset: [0, -8] });
      // The dialog zooms in as it opens; measure again once it has settled.
      timer = window.setTimeout(() => map?.invalidateSize(), 250);
    });
    return () => { cancelled = true; window.clearTimeout(timer); map?.remove(); };
  }, [lat, lon, name]);
  return <div ref={container} role="img" aria-label={`Map of ${name}`} className="isolate aspect-[16/10] w-full overflow-hidden rounded-lg border bg-muted" />;
}

/** Coordinates as a button that opens the school's location on a map preview. */
export function SchoolMapDialog({ name, lga, latitude, longitude }: SchoolMapDialogProps) {
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return <span className="text-muted-foreground">—</span>;
  const google = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="group -my-1 flex items-center gap-2.5 rounded-lg py-1 pr-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`Show ${name} on a map`}>
        <MapThumbnail lat={lat} lon={lon} />
        <span className="whitespace-nowrap text-xs leading-5 tabular-nums">
          <span className="block group-hover:underline group-hover:underline-offset-2">{degrees(lat, 'N', 'S')}</span>
          <span className="block text-muted-foreground">{degrees(lon, 'E', 'W')}</span>
        </span>
      </button>
    </DialogTrigger>
    <DialogContent variant="inset-footer" className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="break-words">{name}</DialogTitle>
        <DialogDescription>{lga} · {latitude}, {longitude}</DialogDescription>
      </DialogHeader>
      <div className="px-4 pb-4">
        <SchoolMap lat={lat} lon={lon} name={name} />
      </div>
      <DialogFooter className="sm:justify-between">
        <Button asChild variant="outline"><a href={google} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon data-icon="inline-start" />Open in Google Maps</a></Button>
        <DialogClose asChild><Button type="button">Done</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
