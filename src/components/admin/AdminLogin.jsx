import React, { useState } from 'react';
import { supabase } from '../../utils/supabase';
import Button from '../ui/Button';
import Input from '../ui/Input';

const AdminLogin = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Autenticar con Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // 2. Verificar que el usuario esté en admin_users y esté activo
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .eq('is_active', true)
        .single();

      if (adminError || !adminData) {
        // Usuario no es admin o está inactivo
        await supabase.auth.signOut();
        throw new Error('No tienes permisos para acceder al panel de administración');
      }

      // 3. Actualizar último login
      await supabase
        .from('admin_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', adminData.id);

      console.log('✅ Admin autenticado:', {
        email: adminData.email,
        role: adminData.role,
        name: adminData.full_name
      });

      onLoginSuccess(adminData);
    } catch (error) {
      console.error('❌ Error login:', error);
      setError(error.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Admin Panel</h1>
          <p className="text-gray-600">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            label="Email"
            placeholder="admin@quiz.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            type="password"
            label="Contraseña"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            loading={loading}
            className="w-full"
          >
            Iniciar sesión
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Si olvidaste tu contraseña, contacta al Super Admin
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;