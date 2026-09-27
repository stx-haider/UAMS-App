import React, { useState } from 'react';
import { Eye, EyeOff, User, Lock, ArrowRight, Info, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authenticateAccount, registerAccount } from '../data/database';

// Background image import
import bgImage from '../assets/login_side_image.png';
import logoImage from '../assets/logo.png';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      await authenticateAccount(data.get('crId'), data.get('password'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setMessage(error.message || 'Could not log in.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const result = await registerAccount({
        crId: data.get('crId'),
        name: data.get('name'),
        department: data.get('department'),
        program: data.get('program'),
        semester: data.get('semester'),
        section: data.get('section'),
        academicSession: data.get('academicSession'),
        password: data.get('password'),
      });
      if (result.exists) {
        setMessage('Account already exists — Login');
        setIsLoginView(true);
        return;
      }
      await authenticateAccount(data.get('crId'), data.get('password'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setMessage(error.message || 'Could not create this account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrapper">
      
      {/* Left Panel - Image Background */}
      <div 
        className="left-panel" 
        style={{ 
          background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.7) 100%), url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="top-brand">
          <img className="login-brand-logo" src={logoImage} alt="University Attendance System logo" />
          <div>
            <h1>University<br />Attendance System</h1>
            <p>Simple • Secure • Reliable</p>
          </div>
        </div>

        <div className="bottom-brand">
          <BookOpen size={40} color="white" />
          <h2>Better Attendance<br />Brighter Future</h2>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="right-panel">
        <div className="login-box">
          
          <div className="login-logo">
            <img className="login-logo-image" src={logoImage} alt="University Attendance System logo" />
          </div>

          <div className="login-header">
            <h2>University Attendance System</h2>
            <p>{isLoginView ? 'Login to access your account' : 'Register your CR account'}</p>
          </div>

          {isLoginView ? (
            /* ================= LOGIN FORM ================= */
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <User size={20} className="input-icon-left" />
                <input 
                  type="text" 
                  placeholder="Username / CR ID" 
                  className="form-control"
                  name="crId"
                  required
                />
              </div>

              <div className="form-group">
                <Lock size={20} className="input-icon-left" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Password" 
                  className="form-control"
                  name="password"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Please wait…' : 'Login'} <ArrowRight size={18} />
              </button>

              <div className="divider">Only CRs can access this system.</div>

              <div className="info-box">
                <Info size={24} className="info-icon" />
                <p>Use your CR credentials to login. Each CR has access to their own department and section data only.</p>
              </div>

              {message && <p role="alert" style={{ textAlign: 'center', marginTop: '1rem', color: '#b42332', fontSize: '0.85rem' }}>{message}</p>}

              <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
                Don't have an account? 
                <button type="button" onClick={() => setIsLoginView(false)} style={{ color: '#3B82F6', fontWeight: 600, background: 'none', border: 'none', marginLeft: '5px', cursor: 'pointer' }}>
                  Create your account
                </button>
              </div>
            </form>
          ) : (
            /* ================= CREATE ACCOUNT FORM ================= */
            <form onSubmit={handleCreateAccount}>
              <div className="form-group">
                <User size={20} className="input-icon-left" />
                <input type="text" name="name" placeholder="Full name" className="form-control" autoComplete="name" required />
              </div>

              <div className="form-group">
                <User size={20} className="input-icon-left" />
                <input type="text" name="crId" placeholder="CR ID / Username" className="form-control" autoComplete="username" required />
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.2rem' }}>
                <input type="text" name="department" placeholder="Department" className="form-control" style={{ paddingLeft: '1rem' }} required />
                <input type="text" name="semester" placeholder="Semester" className="form-control" style={{ paddingLeft: '1rem' }} required />
                <input type="text" name="section" placeholder="Section" className="form-control" style={{ paddingLeft: '1rem' }} required />
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.2rem' }}>
                <input type="text" name="program" placeholder="Program" className="form-control" style={{ paddingLeft: '1rem' }} required />
                <input type="text" name="academicSession" placeholder="Academic session" className="form-control" style={{ paddingLeft: '1rem' }} required />
              </div>

              <div className="form-group">
                <Lock size={20} className="input-icon-left" />
                <input type={showPassword ? "text" : "password"} name="password" placeholder="Create Password" className="form-control" autoComplete="new-password" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="password-toggle">
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Please wait…' : 'Create Account'} <ArrowRight size={18} />
              </button>

              {message && <p role="alert" style={{ textAlign: 'center', marginTop: '1rem', color: '#b42332', fontSize: '0.85rem' }}>{message}</p>}

              <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
                Already have an account? 
                <button type="button" onClick={() => setIsLoginView(true)} style={{ color: '#3B82F6', fontWeight: 600, background: 'none', border: 'none', marginLeft: '5px', cursor: 'pointer' }}>
                  Login here
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}