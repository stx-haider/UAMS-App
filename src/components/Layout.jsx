import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarCheck, Camera, ChevronDown, FileText, LayoutDashboard, LogOut, Settings, Users, X, ZoomIn, ChartNoAxesColumn } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import useDatabase from '../hooks/useDatabase';
import { getActiveAccountId, logoutAccount, updateState } from '../data/database';
import logoImage from '../assets/logo.png';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/subjects', label: 'Subjects', icon: BookOpen },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/mid-term', label: 'Mid-Term', icon: ChartNoAxesColumn },
  { to: '/final-aggregate', label: 'Final Aggregate', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];
const titles = {
  '/dashboard': 'Dashboard', '/students': 'Students', '/subjects': 'Subjects',
  '/attendance': 'Attendance', '/mid-term': 'Mid-Term Aggregate',
  '/final-aggregate': 'Final Aggregate', '/settings': 'Settings',
};

function ProfileAvatar({ profileImage, initials, small = false }) {
  return <span className={`avatar${small ? ' small' : ''}`}>{profileImage ? <img src={profileImage} alt="" /> : initials}</span>;
}

function makeCroppedPhoto(imageUrl, area) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Could not prepare the cropped image.')); return; }
      context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 512, 512);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Could not encode the cropped image.')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the cropped image.'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.88);
    };
    image.onerror = () => reject(new Error('Could not load the selected image.'));
    image.src = imageUrl;
  });
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = useDatabase();
  const profile = state?.settings;
  const initials = profile?.crName?.trim()?.[0]?.toUpperCase() || 'C';
  const [profileMenu, setProfileMenu] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [cropImageUrl, setCropImageUrl] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const fileInput = useRef(null);
  const profileMenuRef = useRef(null);
  useEffect(() => {
    if (!cropImageUrl) return undefined;
    return () => URL.revokeObjectURL(cropImageUrl);
  }, [cropImageUrl]);
  useEffect(() => {
    if (!profileMenu) return undefined;
    const closeOnOutside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenu(null);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setProfileMenu(null); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenu]);
  const logout = () => {
    logoutAccount();
    setProfileMenu(null);
    navigate('/login', { replace: true });
  };
  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoError('Choose an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setPhotoError('Please choose an image smaller than 10 MB.'); return; }
    setPhotoError('');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedPixels(null);
    setCropImageUrl(URL.createObjectURL(file));
    setProfileMenu(null);
  };
  const saveCroppedPhoto = async () => {
    if (!cropImageUrl || !croppedPixels) return;
    const accountId = getActiveAccountId();
    setSavingPhoto(true);
    setPhotoError('');
    try {
      const photo = await makeCroppedPhoto(cropImageUrl, croppedPixels);
      await updateState((next) => {
        next.settings.profilePicture = photo;
        return next;
      }, accountId);
      setCropImageUrl('');
    } catch (error) {
      setPhotoError(error.message || 'Could not save this profile picture.');
    } finally {
      setSavingPhoto(false);
    }
  };
  const profileImage = profile?.profilePicture;
  const profileDetails = <div className="profile-details">
    <div className="profile-details-heading"><div><strong>{profile?.crName || 'CR account'}</strong><small>{profile?.crId || 'Username not set'}</small></div><button type="button" className="profile-close" aria-label="Close profile menu" onClick={() => setProfileMenu(null)}>×</button></div>
    <dl className="profile-fields">
      <div><dt>Department</dt><dd>{profile?.department || 'Not set'}</dd></div>
      <div><dt>Program</dt><dd>{profile?.program || 'Not set'}</dd></div>
      <div><dt>Semester</dt><dd>{profile?.semester || 'Not set'}</dd></div>
      <div><dt>Section</dt><dd>{profile?.section || 'Not set'}</dd></div>
      <div><dt>Academic session</dt><dd>{profile?.academicSession || 'Not set'}</dd></div>
    </dl>
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={uploadPhoto} />
    <button type="button" className="profile-action" onClick={() => fileInput.current?.click()}><Camera size={16} /> {profileImage ? 'Change profile picture' : 'Upload profile picture'}</button>
    {photoError && <p className="profile-error" role="alert">{photoError}</p>}
    <button type="button" className="profile-logout" onClick={logout}><LogOut size={16} /> Log out</button>
  </div>;
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button className="brand-lockup" onClick={() => navigate('/dashboard')} aria-label="University Attendance System home">
          <span className="brand-mark"><img src={logoImage} alt="" /></span>
          <span><strong>U A S</strong><small>Attendance system</small></span>
        </button>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}><Icon size={18} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-profile-anchor" ref={profileMenu === 'sidebar' ? profileMenuRef : null}>
          <button type="button" className="sidebar-profile profile-trigger" aria-expanded={profileMenu === 'sidebar'} onClick={() => { setPhotoError(''); setProfileMenu(profileMenu === 'sidebar' ? null : 'sidebar'); }}><ProfileAvatar profileImage={profileImage} initials={initials} small /><span><strong>{profile?.crName || 'CR profile'}</strong><small>{[profile?.department, profile?.section && `Section ${profile.section}`].filter(Boolean).join(' · ') || 'Set up in Settings'}</small></span><ChevronDown size={15} /></button>
          {profileMenu === 'sidebar' && profileDetails}
        </div>
      </aside>
      <main className="app-main">
        <header className="app-header"><div><span className="header-eyebrow">UNIVERSITY ATTENDANCE SYSTEM</span><h1>{titles[location.pathname] || 'Attendance system'}</h1></div><div className="header-profile"><span className="header-date">{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span><div className="header-profile-anchor" ref={profileMenu === 'header' ? profileMenuRef : null}><button type="button" className="header-profile-trigger" aria-expanded={profileMenu === 'header'} onClick={() => { setPhotoError(''); setProfileMenu(profileMenu === 'header' ? null : 'header'); }}><ProfileAvatar profileImage={profileImage} initials={initials} /><span><strong>{profile?.crName || 'CR account'}</strong><small>{profile?.semester ? `Semester ${profile.semester}` : 'Local workspace'}</small></span><ChevronDown size={14} /></button>{profileMenu === 'header' && profileDetails}</div></div></header>
        <div className="app-content"><Outlet /></div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      {cropImageUrl && <div className="photo-crop-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingPhoto) setCropImageUrl(''); }}><section className="photo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title"><header className="photo-crop-header"><div><h2 id="photo-crop-title">Adjust profile picture</h2><p>Drag to reposition and zoom until it looks right.</p></div><button type="button" className="profile-close" aria-label="Cancel crop" disabled={savingPhoto} onClick={() => setCropImageUrl('')}><X size={17} /></button></header><div className="photo-crop-area"><Cropper image={cropImageUrl} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setCroppedPixels(pixels)} /></div><label className="photo-zoom"><ZoomIn size={17} /><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><output>{Math.round(zoom * 100)}%</output></label>{photoError && <p className="profile-error" role="alert">{photoError}</p>}<footer className="photo-crop-actions"><button type="button" className="app-button secondary" disabled={savingPhoto} onClick={() => setCropImageUrl('')}>Cancel</button><button type="button" className="app-button" disabled={savingPhoto || !croppedPixels} onClick={saveCroppedPhoto}>{savingPhoto ? 'Saving…' : 'Done'}</button></footer></section></div>}
    </div>
  );
}