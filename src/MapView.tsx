import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-rotate'
import type { Customer } from './types'

declare module 'leaflet' {
  interface Map {
    setBearing(bearing: number): this
    getBearing(): number
  }
  interface MapOptions {
    rotate?: boolean
    bearing?: number
  }
}

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
  placingForName?: string
  onCancelPlacement?: () => void
  isDelivering: boolean
  deliveredIds: Set<string>
  onToggleDelivered: (id: string) => void
}

function makeNumberedIcon(num: number, delivered: boolean) {
  const bg = delivered ? '#ef4444' : '#1a56db'
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35)">${num}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  })
}

function makeUnsetIcon(delivered: boolean) {
  const bg = delivered ? '#ef4444' : '#9ca3af'
  const label = delivered ? '✓' : '?'
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35)">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
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

export default function MapView({
  customers, onMapClick, placingFor, placingForName, onCancelPlacement,
  isDelivering, deliveredIds, onToggleDelivered,
}: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const routeLayerRef = useRef<L.Polyline | null>(null)
  const locationMarkerRef = useRef<L.Marker | null>(null)
  const locationCircleRef = useRef<L.Circle | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const placingForRef = useRef<string | null>(null)
  const isDeliveringRef = useRef(false)
  const onToggleDeliveredRef = useRef(onToggleDelivered)
  const onMapClickRef = useRef(onMapClick)
  // GPS で進行方向を取得中かどうか（true の間はコンパスで上書きしない）
  const gpsHeadingActiveRef = useRef(false)
  const gpsHeadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [mapReady, setMapReady] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  // 実際の進行方向（0=北, 90=東 … GPS/コンパス値そのまま）
  const [travelHeading, setTravelHeading] = useState(0)

  // 地図回転 + state 更新をまとめる安定した関数（ref 経由）
  // leaflet-rotate は CW を正とする → 進行方向を上に向けるには (360 - heading) % 360 を渡す
  const applyBearing = useRef((heading: number) => {
    mapRef.current?.setBearing((360 - heading) % 360)
    setTravelHeading(heading)
  })

  // Sync refs
  useEffect(() => { isDeliveringRef.current = isDelivering }, [isDelivering])
  useEffect(() => { onToggleDeliveredRef.current = onToggleDelivered }, [onToggleDelivered])
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])

  // Init map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, { rotate: true, bearing: 0 })
      .setView([35.6812, 139.7671], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    mapRef.current = map
    markerLayerRef.current = L.layerGroup().addTo(map)
    setMapReady(true)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng)
    })

    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy, heading, speed } = pos.coords
          setLocationError(null)

          // 現在地マーカー更新
          if (!locationMarkerRef.current) {
            locationMarkerRef.current = L.marker([latitude, longitude], {
              icon: makeCurrentLocationIcon(), zIndexOffset: 1000,
            }).addTo(map).bindPopup('現在地')
          } else {
            locationMarkerRef.current.setLatLng([latitude, longitude])
          }
          if (!locationCircleRef.current) {
            locationCircleRef.current = L.circle([latitude, longitude], {
              radius: accuracy, color: '#3b82f6', fillColor: '#93c5fd',
              fillOpacity: 0.2, weight: 1,
            }).addTo(map)
          } else {
            locationCircleRef.current.setLatLng([latitude, longitude])
            locationCircleRef.current.setRadius(accuracy)
          }

          if (isDeliveringRef.current && !placingForRef.current) {
            map.panTo([latitude, longitude], { animate: true, duration: 0.5 })

            // ── 進行方向優先ロジック ──
            // GPS heading: 0=北, 90=東, 180=南, 270=西（移動中のみ有効）
            // speed > 0.5 m/s (≒ 1.8 km/h) かつ heading が有効な値のとき = 走行中
            const moving = speed !== null && speed > 0.5
              && heading !== null && !isNaN(heading)

            if (moving) {
              // 走行中: GPS の進行方向を地図上部に合わせる
              gpsHeadingActiveRef.current = true
              if (gpsHeadingTimerRef.current) clearTimeout(gpsHeadingTimerRef.current)
              // 3 秒間 GPS heading が来なくなったらコンパスに切り替え
              gpsHeadingTimerRef.current = setTimeout(() => {
                gpsHeadingActiveRef.current = false
              }, 3000)
              applyBearing.current(heading!)
            }
          }
        },
        (err) => {
          if (err.code === 1) setLocationError('位置情報の使用が拒否されました')
          else setLocationError('現在地を取得できません')
        },
        { enableHighAccuracy: true, maximumAge: 500, timeout: 5000 }
      )
      watchIdRef.current = id
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (gpsHeadingTimerRef.current) clearTimeout(gpsHeadingTimerRef.current)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 配達開始/終了 でコンパスリスナーを管理
  useEffect(() => {
    if (!isDelivering) {
      // 配達終了 → 北向き（通常表示）に戻す
      gpsHeadingActiveRef.current = false
      applyBearing.current(0)
      return
    }

    // 停車中（GPS heading 未取得）はデバイスコンパスで補完
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (gpsHeadingActiveRef.current) return // 走行中は GPS 優先

      const h =
        (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
        ?? (e.absolute && e.alpha !== null ? (360 - e.alpha) % 360 : null)
      if (h !== null) applyBearing.current(h)
    }

    const start = async () => {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      if (typeof DOE.requestPermission === 'function') {
        try {
          const res = await DOE.requestPermission()
          if (res !== 'granted') return
        } catch { return }
      }
      window.addEventListener('deviceorientation', handleOrientation, true)
    }
    start()

    return () => window.removeEventListener('deviceorientation', handleOrientation, true)
  }, [isDelivering])

  // Sync placingFor ref
  useEffect(() => { placingForRef.current = placingFor ?? null }, [placingFor])

  // Cursor + Escape
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getContainer().style.cursor = placingFor ? 'crosshair' : ''
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && placingFor) onCancelPlacement?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placingFor, onCancelPlacement])

  // Customer markers
  useEffect(() => {
    const map = mapRef.current
    const layer = markerLayerRef.current
    if (!mapReady || !map || !layer) return
    layer.clearLayers()
    const geocoded = customers.filter(c => c.geocoded && c.lat !== null && c.lng !== null)
    if (geocoded.length === 0) return
    const positions: [number, number][] = []
    geocoded.forEach(c => {
      const isDelivered = deliveredIds.has(c.id)
      const icon = c.sequenceNumber !== null
        ? makeNumberedIcon(c.sequenceNumber, isDelivered)
        : makeUnsetIcon(isDelivered)
      const seqLabel = c.sequenceNumber !== null ? `[${c.sequenceNumber}] ` : ''
      const productsLine = c.products
        ? `<br><span style="font-size:0.8rem;color:#555">商品: ${c.products}</span>` : ''
      const deliveredLine = isDelivered
        ? `<br><span style="font-size:0.78rem;color:#dc2626;font-weight:600">✓ 配達済み</span>` : ''
      L.marker([c.lat!, c.lng!], { icon })
        .on('click', () => onToggleDeliveredRef.current(c.id))
        .bindPopup(`<b>${seqLabel}${c.name}</b><br><span style="font-size:0.82rem;color:#555">${c.address}</span>${productsLine}${deliveredLine}`)
        .addTo(layer)
      positions.push([c.lat!, c.lng!])
    })
    if (positions.length === 1) map.setView(positions[0], 14)
    else if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [50, 50] })
  }, [customers, mapReady, deliveredIds])

  // Route
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null }
    const ordered = customers
      .filter(c => c.geocoded && c.lat !== null && c.lng !== null && c.sequenceNumber !== null)
      .sort((a, b) => a.sequenceNumber! - b.sequenceNumber!)
    if (ordered.length < 2) return
    const waypoints: [number, number][] = ordered.map(c => [c.lat!, c.lng!])
    fetchRoadRoute(waypoints).then(routeCoords => {
      if (!mapRef.current) return
      const coords = routeCoords ?? waypoints
      routeLayerRef.current = L.polyline(coords, {
        color: '#1a56db', weight: routeCoords ? 5 : 4,
        opacity: 0.85, dashArray: routeCoords ? undefined : '8,4',
      }).addTo(mapRef.current)
    })
  }, [customers, mapReady])

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ flex: 1 }} />

      {/* 方位インジケーター（配達中のみ・右上に小さく表示）
          地図が bearing 度回転しているので、矢印を -bearing 回転させると常に北を指す */}
      {isDelivering && (
        <div style={{
          position: 'absolute', top: '10px', right: '10px', zIndex: 1000,
          width: '28px', height: '28px',
          background: 'rgba(255,255,255,0.88)',
          borderRadius: '50%',
          boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <svg
            width="14" height="14" viewBox="0 0 14 14"
            style={{ transform: `rotate(${-travelHeading}deg)`, transition: 'transform 0.25s ease' }}
          >
            <polygon points="7,1 10,13 7,10 4,13" fill="#ef4444" />
            <polygon points="7,1 4,13 7,10 10,13" fill="#d1d5db" />
          </svg>
        </div>
      )}

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
          background: '#f97316', color: 'white',
          borderRadius: '12px', zIndex: 2000,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 16px', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            📍 {placingForName ? `「${placingForName}」の` : ''}位置を地図上でクリックして設定
          </span>
          <button
            onClick={onCancelPlacement}
            style={{
              background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.5)',
              color: 'white', borderRadius: '6px', padding: '3px 10px',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
            }}
          >
            キャンセル (Esc)
          </button>
        </div>
      )}
    </div>
  )
}
