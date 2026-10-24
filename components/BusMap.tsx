'use client';

import React, { useEffect, useState } from 'react';
import {
  APIProvider,
  Map,
  Marker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface BusLocation {
  bus_id: string;
  latitude: number | null;
  longitude: number | null;
  is_online: boolean;
  updated_at: string;
  trip_type: 'outbound' | 'inbound';
  destination: string;
  driver_name?: string;
  license_plate?: string;
  operating_hours?: string;
  distance?: number;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function MapController({ targetCenter, targetZoom }: { targetCenter: { lat: number; lng: number } | null; targetZoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (map && targetCenter) {
      map.panTo(targetCenter);
      map.setZoom(targetZoom);
    }
  }, [map, targetCenter, targetZoom]);

  return null;
}

export default function BusMap() {
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [selectedBus, setSelectedBus] = useState<BusLocation | null>(null);
  const [filterTrip, setFilterTrip] = useState<'all' | 'outbound' | 'inbound'>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  const [userPos] = useState<{ lat: number; lng: number }>({
    lat: 13.591561029311771,
    lng: 100.2729725318618,
  });

  const [mapTarget, setMapTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(15);

  const blueDotSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="22" fill="#4285F4" opacity="0.25">
        <animate attributeName="r" values="16;26;16" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="30" cy="30" r="10" fill="#FFFFFF"/>
      <circle cx="30" cy="30" r="7" fill="#4285F4"/>
    </svg>
  `)}`;

  useEffect(() => {
    const fetchBuses = async () => {
      const { data } = await supabase.from('bus_locations').select('*');
      if (data) {
        const busMap: Record<string, BusLocation> = {};
        data.forEach((b) => {
          let dist = 0;
          if (b.latitude && b.longitude) {
            dist = calculateDistance(userPos.lat, userPos.lng, b.latitude, b.longitude);
          }
          busMap[b.bus_id] = {
            ...b,
            trip_type: b.trip_type || 'outbound',
            destination: b.destination || (b.trip_type === 'inbound' ? 'วัดเกาะ' : 'มหาชัย'),
            distance: dist,
          };
        });
        setBuses(busMap);
      }
    };

    fetchBuses();

    const channel = supabase
      .channel('bus_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bus_locations' },
        (payload) => {
          const updated = payload.new as BusLocation;
          if (updated && updated.bus_id) {
            let dist = 0;
            if (updated.latitude && updated.longitude) {
              dist = calculateDistance(userPos.lat, userPos.lng, updated.latitude, updated.longitude);
            }
            setBuses((prev) => ({
              ...prev,
              [updated.bus_id]: {
                ...updated,
                trip_type: updated.trip_type || 'outbound',
                destination: updated.destination || (updated.trip_type === 'inbound' ? 'วัดเกาะ' : 'มหาชัย'),
                distance: dist,
              },
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userPos]);

  // กรองเฉพาะรถที่ออนไลน์ และมีค่าพิกัดที่ไม่ใช่ null
  const filteredBuses = Object.values(buses)
    .filter((bus) => {
      // เช็คสถานะออนไลน์และพิกัดต้องไม่เป็น null หรือ undefined
      if (bus.is_online !== true) return false;
      if (bus.latitude === null || bus.latitude === undefined) return false;
      if (bus.longitude === null || bus.longitude === undefined) return false;
      
      if (filterTrip === 'all') return true;
      return bus.trip_type === filterTrip;
    })
    .sort((a, b) => (a.distance || 0) - (b.distance || 0));

  const handleSelectBus = (bus: BusLocation) => {
    if (bus.latitude && bus.longitude) {
      setSelectedBus(bus);
      setMapTarget({ lat: bus.latitude, lng: bus.longitude });
      setMapZoom(17);
    }
  };

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', backgroundColor: '#f1f3f4', fontFamily: 'Roboto, Arial, sans-serif' }}>
      
      {/* แผนที่ Google Maps เต็มจอ */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={userPos}
            defaultZoom={15}
            mapId="bus_map_id"
            style={{ width: '100%', height: '100%' }}
          >
            <MapController targetCenter={mapTarget} targetZoom={mapZoom} />

            <Marker
              position={userPos}
              title="ตำแหน่งของคุณ"
              icon={{
                url: blueDotSvg,
                scaledSize: { width: 60, height: 60 } as google.maps.Size,
                anchor: { x: 30, y: 30 } as google.maps.Point,
              }}
            />

            {filteredBuses.map((bus) => (
              bus.latitude && bus.longitude ? (
                <Marker
                  key={bus.bus_id}
                  position={{ lat: bus.latitude, lng: bus.longitude }}
                  onClick={() => handleSelectBus(bus)}
                  icon={{
                    url: bus.trip_type === 'outbound'
                      ? 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png'
                      : 'https://cdn-icons-png.flaticon.com/512/3448/3448285.png',
                    scaledSize: { width: 40, height: 40 } as google.maps.Size,
                  }}
                />
              ) : null
            ))}

            {selectedBus && selectedBus.latitude && selectedBus.longitude && (
              <InfoWindow
                position={{ lat: selectedBus.latitude, lng: selectedBus.longitude }}
                onCloseClick={() => setSelectedBus(null)}
              >
                <div style={{ padding: '6px', fontFamily: 'sans-serif', minWidth: '180px', color: '#202124' }}>
                  <h3 style={{ fontWeight: 'bold', fontSize: '15px', margin: 0, color: '#1a73e8' }}>
                    🚌 รถ: {selectedBus.bus_id}
                  </h3>
                  <p style={{ fontSize: '11px', margin: '4px 0 2px 0', color: '#3c4043' }}>
                    👤 <b>คนขับ:</b> {selectedBus.driver_name || 'ไม่ระบุ'} ({selectedBus.license_plate || 'N/A'})
                  </p>
                  <p style={{ fontSize: '11px', margin: '2px 0', color: '#5f6368' }}>
                    🏁 <b>ปลายทาง:</b> <span style={{ fontWeight: 'bold', color: selectedBus.trip_type === 'outbound' ? '#137333' : '#e37400' }}>
                      {selectedBus.destination} ({selectedBus.trip_type === 'outbound' ? 'ขาออก' : 'ขาเข้า'})
                    </span>
                  </p>
                  <p style={{ fontSize: '11px', margin: '2px 0', color: '#5f6368' }}>
                    ⏰ <b>เวลาบริการ:</b> {selectedBus.operating_hours || 'N/A'}
                  </p>
                  <p style={{ fontSize: '10px', margin: '6px 0 0 0', color: '#1a73e8', fontWeight: 'bold' }}>
                    📍 ห่างจากคุณ: {selectedBus.distance !== undefined ? selectedBus.distance.toFixed(1) : '0.0'} กม.
                  </p>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* Floating Sidebar สไตล์ Google Maps */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        width: isSidebarOpen ? '380px' : '0px',
        height: 'calc(100vh - 32px)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        pointerEvents: isSidebarOpen ? 'auto' : 'none'
      }}>
        <div style={{
          width: '380px',
          height: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2), 0 -1px 6px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          
          <div style={{ padding: '16px', borderBottom: '1px solid #e8eaed', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontWeight: '500', fontSize: '16px', color: '#202124', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🚍 ติดตามรถสองแถว
                </h1>
                <p style={{ fontSize: '12px', color: '#5f6368', margin: '2px 0 0 0' }}>สาย วัดเกาะ - บางปลา - มหาชัย</p>
              </div>
              
              <button
                onClick={() => setIsSidebarOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#5f6368',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f3f4'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title="ซ่อนแถบข้าง"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={() => setFilterTrip('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  backgroundColor: filterTrip === 'all' ? '#1a73e8' : '#f1f3f4',
                  color: filterTrip === 'all' ? '#ffffff' : '#3c4043',
                  border: filterTrip === 'all' ? 'none' : '1px solid #dadce0',
                  transition: 'all 0.2s'
                }}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setFilterTrip('outbound')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  backgroundColor: filterTrip === 'outbound' ? '#137333' : '#f1f3f4',
                  color: filterTrip === 'outbound' ? '#ffffff' : '#3c4043',
                  border: filterTrip === 'outbound' ? 'none' : '1px solid #dadce0',
                  transition: 'all 0.2s'
                }}
              >
                👉 ไปมหาชัย
              </button>
              <button
                onClick={() => setFilterTrip('inbound')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  backgroundColor: filterTrip === 'inbound' ? '#e37400' : '#f1f3f4',
                  color: filterTrip === 'inbound' ? '#ffffff' : '#3c4043',
                  border: filterTrip === 'inbound' ? 'none' : '1px solid #dadce0',
                  transition: 'all 0.2s'
                }}
              >
                👈 ไปวัดเกาะ
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#f8f9fa' }}>
            {filteredBuses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#80868b', fontSize: '13px' }}>
                📭 ไม่พบรถให้บริการในขณะนี้
              </div>
            ) : (
              filteredBuses.map((bus) => (
                <div
                  key={bus.bus_id}
                  onClick={() => handleSelectBus(bus)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: selectedBus?.bus_id === bus.bus_id ? '1.5px solid #1a73e8' : '1px solid #dadce0',
                    backgroundColor: selectedBus?.bus_id === bus.bus_id ? '#e8f0fe' : '#ffffff',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={(e) => {
                    if (selectedBus?.bus_id !== bus.bus_id) e.currentTarget.style.backgroundColor = '#f1f3f4';
                  }}
                  onMouseOut={(e) => {
                    if (selectedBus?.bus_id !== bus.bus_id) e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                        🚌
                      </div>
                      <div>
                        <h3 style={{ fontWeight: '500', fontSize: '14px', margin: 0, color: '#202124' }}>รถ: {bus.bus_id}</h3>
                        <p style={{ fontSize: '11px', color: '#5f6368', margin: '2px 0' }}>คนขับ: {bus.driver_name || 'ไม่ระบุ'}</p>
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '500',
                          marginTop: '2px',
                          backgroundColor: bus.trip_type === 'outbound' ? '#e6f4ea' : '#fef7e0',
                          color: bus.trip_type === 'outbound' ? '#137333' : '#b06000',
                        }}>
                          ปลายทาง: {bus.destination} ({bus.trip_type === 'outbound' ? 'ขาออก' : 'ขาเข้า'})
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', fontWeight: '500', color: '#1a73e8', backgroundColor: '#e8f0fe', padding: '2px 6px', borderRadius: '4px' }}>
                        📍 {bus.distance !== undefined ? bus.distance.toFixed(1) : '0.0'} กม.
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: '#80868b', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f3f4', paddingTop: '6px' }}>
                    <span>อัปเดตล่าสุด</span>
                    <span>{new Date(bus.updated_at).toLocaleTimeString('th-TH')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 30,
            backgroundColor: '#ffffff',
            color: '#202124',
            border: '1px solid #dadce0',
            padding: '10px 16px',
            borderRadius: '8px',
            fontWeight: '500',
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f3f4'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
        >
          <span style={{ fontSize: '16px' }}>☰</span> ค้นหาเส้นทางและรถ
        </button>
      )}

    </div>
  );
}