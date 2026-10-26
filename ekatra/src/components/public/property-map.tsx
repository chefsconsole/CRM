"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, ZoomControl } from "react-leaflet";
import { useEffect, useMemo } from "react";

export interface MapPoint {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  label: string;
  name: string;
}

const TILE = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const ATTR = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "&copy; OpenStreetMap contributors &copy; CARTO";

function icon(label: string, active: boolean) {
  const safe = label.replace(/[<>&"]/g, "");
  return L.divIcon({
    className: "ek-marker",
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
      <div style="white-space:nowrap;padding:6px 11px;border-radius:999px;font:600 12px/1 var(--font-geist),system-ui;letter-spacing:-0.01em;
        background:${active ? "#0a1322" : "#fff"};color:${active ? "#e2cc9c" : "#0a1322"};
        box-shadow:0 6px 18px -6px rgba(10,19,34,.45),0 0 0 1px rgba(10,19,34,${active ? ".9" : ".08"});
        transform:scale(${active ? 1.08 : 1});transition:transform .3s">${safe}</div>
      <div style="width:8px;height:8px;margin-top:-4px;transform:rotate(45deg);background:${active ? "#0a1322" : "#fff"}"></div></div>`,
  });
}

function Fit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b, { padding: [60, 60], maxZoom: 14 });
  }, [points, map]);
  return null;
}

function FlyTo({ point }: { point: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
  }, [point, map]);
  return null;
}

export default function PropertyMap({ points, activeId, onSelect, className }: { points: MapPoint[]; activeId?: string | null; onSelect?: (id: string) => void; className?: string }) {
  const center = useMemo<[number, number]>(() => (points[0] ? [points[0].lat, points[0].lng] : [19.17, 72.86]), [points]);
  const active = points.find((p) => p.id === activeId) ?? null;
  return (
    <MapContainer center={center} zoom={12} zoomControl={false} scrollWheelZoom className={className} style={{ height: "100%", width: "100%" }}>
      <TileLayer url={TILE} attribution={ATTR} />
      <ZoomControl position="bottomright" />
      <Fit points={points} />
      <FlyTo point={active} />
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p.label, p.id === activeId)} eventHandlers={{ click: () => onSelect?.(p.id) }} title={p.name} keyboard />
      ))}
    </MapContainer>
  );
}
