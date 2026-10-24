'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function DriverPage() {
  const [step, setStep] = useState<'login' | 'register' | 'dashboard'>('login');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  const [accessCode, setAccessCode] = useState('');
  const [loginError, setLoginError] = useState('');

  const [busId, setBusId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [routeInfo, setRouteInfo] = useState('วัดเกาะ - บางปลา - มหาชัย');
  const [operatingHours, setOperatingHours] = useState('05:00 น. - 20:00 น.');
  const [tripType, setTripType] = useState<'outbound' | 'inbound'>('outbound');

  const [isOnline, setIsOnline] = useState(false);
  const [statusText, setStatusText] = useState('ออฟไลน์ (พร้อมเริ่มงาน)');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const checkSavedSession = async () => {
      const savedCode = localStorage.getItem('driver_access_code');
      if (savedCode) {
        setAccessCode(savedCode);
        const { data } = await supabase
          .from('driver_profiles')
          .select('*')
          .eq('access_code', savedCode)
          .single();

        if (data) {
          setBusId(data.bus_id);
          setDriverName(data.driver_name || '');
          setLicensePlate(data.license_plate || '');
          setRouteInfo(data.route_info || 'วัดเกาะ - บางปลา - มหาชัย');
          setOperatingHours(data.operating_hours || '05:00 น. - 20:00 น.');
          setStep('dashboard');
        } else if (savedCode === 'ADMIN-BUS-01') {
          setBusId('BUS-01');
          setStep('register');
        }
      }
      setIsLoading(false);
    };

    checkSavedSession();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!accessCode.trim()) {
      setLoginError('กรุณากรอกรหัสเข้าใช้งาน');
      return;
    }

    const cleanCode = accessCode.trim();

    const { data, error } = await supabase
      .from('driver_profiles')
      .select('*')
      .eq('access_code', cleanCode)
      .single();

    if (error || !data) {
      if (cleanCode === 'ADMIN-BUS-01') {
        localStorage.setItem('driver_access_code', cleanCode);
        setBusId('BUS-01');
        setStep('register');
      } else {
        setLoginError('รหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ถูกสร้างโดย Admin');
      }
    } else {
      localStorage.setItem('driver_access_code', cleanCode);
      setBusId(data.bus_id);
      setDriverName(data.driver_name || '');
      setLicensePlate(data.license_plate || '');
      setRouteInfo(data.route_info || 'วัดเกาะ - บางปลา - มหาชัย');
      setOperatingHours(data.operating_hours || '05:00 น. - 20:00 น.');
      setStep('dashboard');
    }
  };

  const handleRegisterVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busId || !licensePlate) {
      alert('กรุณากรอกข้อมูลเลขประจำรถและทะเบียนรถให้ครบถ้วน');
      return;
    }

    const { error } = await supabase.from('driver_profiles').upsert({
      access_code: accessCode,
      bus_id: busId,
      driver_name: driverName,
      license_plate: licensePlate,
      route_info: routeInfo,
      operating_hours: operatingHours,
    });

    if (error) {
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลรถ: ' + error.message);
      return;
    }

    localStorage.setItem('driver_access_code', accessCode);
    setStep('dashboard');
  };

  const handleLogout = async () => {
    if (isOnline) {
      alert('กรุณาปิดสวิตช์ GPS ก่อนออกจากระบบ');
      return;
    }
    localStorage.removeItem('driver_access_code');
    setAccessCode('');
    setStep('login');
  };

  const toggleGpsService = async () => {
    if (!isOnline) {
      if (!navigator.geolocation) {
        alert('เบราว์เซอร์ของคุณไม่รองรับการใช้งาน GPS');
        return;
      }

      setIsOnline(true);
      setStatusText('กำลังเชื่อมต่อสัญญาณ GPS...');

      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCurrentCoords({ lat, lng });
          setStatusText('ออนไลน์ - กำลังแชร์ตำแหน่งสด 🟢');

          await supabase.from('bus_locations').upsert({
            bus_id: busId,
            latitude: lat,
            longitude: lng,
            is_online: true,
            trip_type: tripType,
            destination: tripType === 'outbound' ? 'มหาชัย' : 'วัดเกาะ',
            driver_name: driverName,
            license_plate: licensePlate,
            operating_hours: operatingHours,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'bus_id' });
        },
        (error) => {
          console.error('GPS Error:', error);
          setStatusText(`เกิดข้อผิดพลาด GPS: ${error.message}`);
          setIsOnline(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      setIsOnline(false);
      setStatusText('ออฟไลน์ (หยุดแชร์พิกัดเรียบร้อย) 🔴');
      setCurrentCoords(null);

      // ใช้ .update() เพื่อเคลียร์พิกัดและตั้งสลับเป็นออฟไลน์โดยตรง
      await supabase
        .from('bus_locations')
        .update({
          latitude: null,
          longitude: null,
          is_online: false,
          updated_at: new Date().toISOString(),
        })
        .eq('bus_id', busId);
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#5f6368' }}>
        กำลังโหลดข้อมูล...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '440px', margin: '24px auto', padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#ffffff', borderRadius: '20px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
      
      {step === 'login' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto', fontSize: '24px' }}>
              🔐
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#202124', margin: 0 }}>
              เข้าสู่ระบบคนขับรถ
            </h1>
            <p style={{ fontSize: '13px', color: '#5f6368', marginTop: '4px' }}>
              กรอกรหัสเข้าใช้งานที่ได้รับจาก Admin
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#3c4043', marginBottom: '6px' }}>
                รหัสเข้าใช้งาน (Access Code):
              </label>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #dadce0', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }}
                placeholder="กรอกรหัสผ่านเพื่อเข้าใช้งาน"
                required
              />
            </div>

            {loginError && (
              <div style={{ color: '#d93025', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              style={{ width: '100%', padding: '14px', borderRadius: '10px', backgroundColor: '#1a73e8', color: '#ffffff', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(26,115,232,0.3)' }}
            >
              เข้าสู่ระบบ
            </button>
          </form>
          <div style={{ marginTop: '20px', fontSize: '11px', color: '#80868b', textAlign: 'center' }}>
            *ทดสอบระบบ ใช้รหัส: <code style={{ background: '#f1f3f4', padding: '2px 6px', borderRadius: '4px' }}>ADMIN-BUS-01</code>
          </div>
        </div>
      )}

      {step === 'register' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#202124', margin: 0 }}>
              📝 ตั้งค่าข้อมูลรถครั้งแรก
            </h1>
            <p style={{ fontSize: '12px', color: '#5f6368', marginTop: '4px' }}>
              กรอกรายละเอียดข้อมูลรถประจำทางก่อนเริ่มใช้งาน
            </p>
          </div>

          <form onSubmit={handleRegisterVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#3c4043', marginBottom: '4px' }}>เลขประจำรถ (Bus ID):</label>
              <input type="text" value={busId} onChange={(e) => setBusId(e.target.value.toUpperCase())} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dadce0', boxSizing: 'border-box' }} required />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#3c4043', marginBottom: '4px' }}>ชื่อ - นามสกุล คนขับ:</label>
              <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="เช่น สมชาย ใจดี" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dadce0', boxSizing: 'border-box' }} required />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#3c4043', marginBottom: '4px' }}>ทะเบียนรถ:</label>
              <input type="text" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} placeholder="เช่น กข 1234 สมุทรสาคร" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dadce0', boxSizing: 'border-box' }} required />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#3c4043', marginBottom: '4px' }}>สายที่วิ่ง:</label>
              <input type="text" value={routeInfo} onChange={(e) => setRouteInfo(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dadce0', boxSizing: 'border-box' }} required />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#3c4043', marginBottom: '4px' }}>ช่วงเวลาบริการ:</label>
              <input type="text" value={operatingHours} onChange={(e) => setOperatingHours(e.target.value)} placeholder="เช่น 05:00 น. - 20:00 น." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #dadce0', boxSizing: 'border-box' }} required />
            </div>

            <button type="submit" style={{ width: '100%', padding: '12px', borderRadius: '10px', backgroundColor: '#137333', color: '#ffffff', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', marginTop: '8px' }}>
              บันทึกข้อมูลและเข้าสู่หน้าควบคุม
            </button>
          </form>
        </div>
      )}

      {step === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ backgroundColor: '#f8f9fa', borderRadius: '14px', padding: '16px', border: '1px solid #e8eaed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🚌</span>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#202124', margin: 0 }}>
                  {busId}
                </h1>
              </div>
              <button
                onClick={handleLogout}
                style={{ background: 'transparent', border: '1px solid #dadce0', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#d93025', fontWeight: 'bold' }}
              >
                ออกจากระบบ
              </button>
            </div>
            
            <div style={{ fontSize: '12px', color: '#5f6368', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>👤 <b>คนขับ:</b> {driverName || 'ไม่ระบุ'} ({licensePlate})</div>
              <div>🛣️ <b>สายที่วิ่ง:</b> {routeInfo}</div>
              <div>⏰ <b>เวลาบริการ:</b> {operatingHours}</div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#3c4043', marginBottom: '8px', textAlign: 'center' }}>
              ปลายทางขาวิ่งปัจจุบัน
            </label>
            <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f1f3f4', padding: '4px', borderRadius: '12px' }}>
              <button
                onClick={() => setTripType('outbound')}
                disabled={isOnline}
                style={{
                  flex: 1, padding: '10px 6px', borderRadius: '10px',
                  border: 'none',
                  backgroundColor: tripType === 'outbound' ? '#ffffff' : 'transparent',
                  color: tripType === 'outbound' ? '#137333' : '#5f6368',
                  fontWeight: 'bold', cursor: isOnline ? 'not-allowed' : 'pointer', fontSize: '12px',
                  boxShadow: tripType === 'outbound' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                👉 ไป มหาชัย
              </button>
              <button
                onClick={() => setTripType('inbound')}
                disabled={isOnline}
                style={{
                  flex: 1, padding: '10px 6px', borderRadius: '10px',
                  border: 'none',
                  backgroundColor: tripType === 'inbound' ? '#ffffff' : 'transparent',
                  color: tripType === 'inbound' ? '#e37400' : '#5f6368',
                  fontWeight: 'bold', cursor: isOnline ? 'not-allowed' : 'pointer', fontSize: '12px',
                  boxShadow: tripType === 'inbound' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                👈 ไป วัดเกาะ
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: isOnline ? '#137333' : '#5f6368', marginBottom: '16px' }}>
              {statusText}
            </p>

            <div
              onClick={toggleGpsService}
              style={{
                width: '180px',
                height: '76px',
                borderRadius: '50px',
                backgroundColor: isOnline ? '#34a853' : '#e8eaed',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                boxShadow: isOnline ? '0 6px 20px rgba(52, 168, 83, 0.4)' : 'inset 0 2px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                  transform: isOnline ? 'translateX(104px)' : 'translateX(0px)',
                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px'
                }}
              >
                {isOnline ? '📡' : '⏸️'}
              </div>

              <span style={{
                position: 'absolute',
                left: isOnline ? '24px' : '82px',
                color: isOnline ? '#ffffff' : '#5f6368',
                fontWeight: 'bold',
                fontSize: '14px',
                userSelect: 'none',
                transition: 'all 0.3s'
              }}>
                {isOnline ? 'ON' : 'OFF'}
              </span>
            </div>

            {currentCoords && (
              <div style={{ fontSize: '11px', color: '#80868b', marginTop: '16px', backgroundColor: '#e6f4ea', padding: '6px 12px', borderRadius: '16px' }}>
                📍 พิกัดปัจจุบัน: {currentCoords.lat.toFixed(5)}, {currentCoords.lng.toFixed(5)}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}