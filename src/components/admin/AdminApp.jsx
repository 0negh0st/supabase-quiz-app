import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';

const AdminApp = () => {
  const [session, setSession] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setAdminData(null);
      } else if (session) {
        await loadAdminData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkSession = async () => {
    try {
      // Verificar sesión de auth
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        await loadAdminData(session.user.id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      setLoading(false);
    }
  };

  const loadAdminData = async (authUserId) => {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        // No es admin o está inactivo
        await supabase.auth.signOut();
        setSession(null);
        setAdminData(null);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setAdminData(data);
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (adminUserData) => {
    setAdminData(adminUserData);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAdminData(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return session && adminData ? (
    <AdminDashboard 
      onLogout={handleLogout} 
      adminData={adminData}
    />
  ) : (
    <AdminLogin onLoginSuccess={handleLoginSuccess} />
  );
};

export default AdminApp;