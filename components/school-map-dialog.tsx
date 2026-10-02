'use client';

import { useEffect, useRef } from 'react';
import { ExternalLinkIcon, MapPinIcon } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export type SchoolMapDialogProps = { name: string; lga: string; latitude: string; longitude: string };

const ZOOM = 15;

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
      <Button type="button" variant="ghost" size="sm" className="-ml-2 h-auto gap-1.5 rounded-full px-2 py-1 text-xs font-normal tabular-nums text-foreground" aria-label={`Show ${name} on a map`}>
        <MapPinIcon data-icon="inline-start" className="text-primary" />{latitude}, {longitude}
      </Button>
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
