import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Customer } from './types'

// Fix default icon paths broken by Vite bundling
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface Props {
  customers: Customer[]
  onMapClick?: (lat: number, lng: number) => void
  placingFor?: string | null
}

function makeNumberedIcon(num: number) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#1a56db;color:white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)">${num}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  })
}

function makeUnsetIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="background:#9ca3af;color:white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)">?</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  })
}

function makeCurrentLocationIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:20px;height:20px">
      <div style="position:absolute;inset:0;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.4)"></div>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

async function fetchRoadRoute(waypoints: [number, number][]): Promise<[number, number][] | null> {
  if (waypoints.length < 2) return null
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) return null
    const coords2 = data.routes[0].geometry.coordinates as [number, number][]
    return coords2.map(([lng, lat]) => [lat, lng])
  } catch {
    return null
  }
}

export default function MapView({ customers, onMapClick, placingFor }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const routeLayerRef = useRef<L.Polyline | null>(null)
  const locationMarkerRef = useRef<L.Marker | null>(null)
  const locationCircleRef = useRef<L.Circle | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [routeInfo, setRouteInfo] = useState<{ count: number; names: string[] }>({ count: 0, names: [] })

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current).setView([35.6812, 139.7671], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    mapRef.current = map
    markerLayerRef.current = L.layerGroup().addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick?.(e.latlng.lat, e.latlng.lng)
    })

    // Geolocation watch
    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords
          setLocationError(null)

          if (!locationMarkerRef.current) {
            locationMarkerRef.current = L.marker([latitude, longitude], {
              icon: makeCurrentLocationIcon(),
              zIndexOffset: 1000,
            }).addTo(map).bindPopup('現在地')
          } else {
            locationMarkerRef.current.setLatLng([latitude, longitude])
          }

          if (!locationCircleRef.current) {
            locationCircleRef.current = L.circle([latitude, longitude], {
              radius: accuracy,
              color: '#3b82f6',
              fillColor: '#93c5fd',
              fillOpacity: 0.2,
              weight: 1,
            }).addTo(map)
          } else {
            locationCircleRef.current.setLatLng([latitude, longitude])
            locationCircleRef.current.setRadius(accuracy)
          }
        },
        (err) => {
          if (err.code === 1) setLocationError('位置情報の使用が拒否されました')
          else setLocationError('現在地を取得できません')
        },
        { enableHighAccuracy: true, maximumAge: 10000 }
      )
      watchIdRef.current = id
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update map click cursor when placing
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const container = map.getContainer()
    container.style.cursor = placingFor ? 'crosshair' : ''
  }, [placingFor])

  // Redraw markers + route when customers change
  useEffect(() => {
    const map = mapRef.current
    const layer = markerLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }

    const geocoded = customers.filter(c => c.geocoded && c.lat !== null && c.lng !== null)
    if (geocoded.length === 0) {
      setRouteInfo({ count: 0, names: [] })
      return
    }

    const positions: [number, number][] = []
    geocoded.forEach(c => {
      const icon = c.sequenceNumber !== null ? makeNumberedIcon(c.sequenceNumber) : makeUnsetIcon()
      const seqLabel = c.sequenceNumber !== null ? `[${c.sequenceNumber}] ` : ''
      const productsLine = c.products
        ? `<br><span style="font-size:0.8rem;color:#555">商品: ${c.products}</span>` : ''
      L.marker([c.lat!, c.lng!], { icon })
        .bindPopup(`<b>${seqLabel}${c.name}</b><br><span style="font-size:0.82rem;color:#555">${c.address}</span>${productsLine}`)
        .addTo(layer)
      positions.push([c.lat!, c.lng!])
    })

    if (positions.length === 1) map.setView(positions[0], 14)
    else if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [50, 50] })

    // Road-based route for ordered customers
    const ordered = geocoded
      .filter(c => c.sequenceNumber !== null)
      .sort((a, b) => a.sequenceNumber! - b.sequenceNumber!)

    setRouteInfo({ count: ordered.length, names: ordered.map(c => `[${c.sequenceNumber}] ${c.name}`) })

    if (ordered.length >= 2) {
      const waypoints: [number, number][] = ordered.map(c => [c.lat!, c.lng!])
      fetchRoadRoute(waypoints).then(routeCoords => {
        if (!mapRef.current || !routeCoords) {
          // Fallback: straight lines
          routeLayerRef.current = L.polyline(waypoints, {
            color: '#1a56db', weight: 4, opacity: 0.8, dashArray: '8,4',
          }).addTo(mapRef.current!)
          return
        }
        routeLayerRef.current = L.polyline(routeCoords, {
          color: '#1a56db', weight: 5, opacity: 0.85,
        }).addTo(mapRef.current!)
      })
    }
  }, [customers])

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ flex: 1 }} />

      {/* Route info panel */}
      <div style={{
        position: 'absolute', bottom: '20px', right: '20px',
        background: 'white', borderRadius: '10px', padding: '12px 16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)', fontSize: '0.8rem',
        zIndex: 1000, maxHeight: '280px', overflowY: 'auto', minWidth: '170px',
      }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '6px', fontSize: '0.82rem' }}>
          配達ルート情報
        </div>
        {routeInfo.count === 0 ? (
          <p style={{ color: '#9ca3af' }}>順序番号が設定された地点がありません</p>
        ) : (
          <>
            <p style={{ color: '#6b7280', marginBottom: '4px' }}>配達先: <b>{routeInfo.count}件</b></p>
            {routeInfo.names.map((n, i) => (
              <div key={i} style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '2px' }}>
                {i + 1 < routeInfo.count ? '↓' : '■'} {n}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Location error */}
      {locationError && (
        <div style={{
          position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
          background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
          borderRadius: '8px', padding: '6px 14px', fontSize: '0.78rem',
          zIndex: 2000, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {locationError}
        </div>
      )}

      {/* Placement banner */}
      {placingFor && (
        <div style={{
          position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
          background: '#1a56db', color: 'white', padding: '8px 20px',
          borderRadius: '20px', zIndex: 2000, fontSize: '0.85rem',
          boxShadow: '0 2px 10px rgba(0,0,0,0.25)', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          地図上をクリックして位置を設定してください
        </div>
      )}
    </div>
  )
}
