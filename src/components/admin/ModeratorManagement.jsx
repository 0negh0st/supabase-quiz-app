import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';

const ModeratorManagement = ({ darkMode, onClose, superAdminId }) => {
  const [moderators, setModerators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form data
  const [newModEmail, setNewModEmail] = useState('');
  const [newModName, setNewModName] = useState('');
  const [newModPassword, setNewModPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    loadModerators();
  }, []);

  const loadModerators = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setModerators(data || []);
    } catch (error) {
      console.error('Error loading moderators:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddModerator = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newModEmail,
        password: newModPassword,
        email_confirm: true
      });

      if (authError) throw authError;

      // 2. Crear registro en admin_users
      const { data: adminUserData, error: adminError } = await supabase
        .from('admin_users')
        .insert({
          email: newModEmail,
          full_name: newModName,
          role: 'moderator',
          auth_user_id: authData.user.id,
          created_by: superAdminId,
          is_active: true
        })
        .select()
        .single();

      if (adminError) throw adminError;

      console.log('✅ Moderador creado exitosamente');
      
      // Reset form
      setNewModEmail('');
      setNewModName('');
      setNewModPassword('');
      setShowAddForm(false);
      
      // Reload list
      loadModerators();
    } catch (error) {
      console.error('❌ Error creando moderador:', error);
      setFormError(error.message || 'Error al crear moderador');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (mod) => {
    if (mod.role === 'super_admin') {
      alert('No puedes desactivar a un Super Admin');
      return;
    }

    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ is_active: !mod.is_active })
        .eq('id', mod.id);

      if (error) throw error;
      
      console.log(`✅ Moderador ${mod.is_active ? 'desactivado' : 'activado'}`);
      loadModerators();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleDelete = async (mod) => {
    if (mod.role === 'super_admin') {
      alert('No puedes eliminar a un Super Admin');
      return;
    }

    if (!confirm(`¿Eliminar a ${mod.full_name}? Esta acción no se puede deshacer.`)) return;

    try {
      // 1. Eliminar de admin_users (esto también eliminará de auth.users por CASCADE)
      const { error: deleteError } = await supabase
        .from('admin_users')
        .delete()
        .eq('id', mod.id);

      if (deleteError) throw deleteError;

      // 2. Eliminar usuario de Auth
      if (mod.auth_user_id) {
        const { error: authError } = await supabase.auth.admin.deleteUser(mod.auth_user_id);
        if (authError) console.error('Error eliminando usuario de auth:', authError);
      }

      console.log('✅ Moderador eliminado');
      loadModerators();
    } catch (error) {
      console.error('❌ Error eliminando moderador:', error);
      alert('Error al eliminar moderador');
    }
  };

  if (loading) {
    return (
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 mb-6`}>
        <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Cargando...</p>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 mb-6`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
          👥 Gestión de Administradores
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            {showAddForm ? '❌ Cancelar' : '➕ Agregar Moderador'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* FORMULARIO AGREGAR MODERADOR */}
      {showAddForm && (
        <form onSubmit={handleAddModerator} className={`mb-6 p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            Nuevo Moderador
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Nombre Completo
              </label>
              <input
                type="text"
                value={newModName}
                onChange={(e) => setNewModName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Juan Pérez"
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Email
              </label>
              <input
                type="email"
                value={newModEmail}
                onChange={(e) => setNewModEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="moderador@ejemplo.com"
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Contraseña
              </label>
              <input
                type="password"
                value={newModPassword}
                onChange={(e) => setNewModPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
              />
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={formLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {formLoading ? 'Creando...' : '✅ Crear Moderador'}
            </button>
          </div>
        </form>
      )}

      {/* LISTA DE ADMINISTRADORES */}
      <div className="space-y-3">
        {moderators.map((mod) => (
          <div
            key={mod.id}
            className={`p-4 rounded-lg border ${
              darkMode 
                ? 'bg-gray-700 border-gray-600' 
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                    {mod.full_name}
                  </h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    mod.role === 'super_admin'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {mod.role === 'super_admin' ? '👑 Super Admin' : '🛡️ Moderador'}
                  </span>
                  {!mod.is_active && (
                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                      ⛔ Inactivo
                    </span>
                  )}
                </div>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {mod.email}
                </p>
                <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                  Creado: {new Date(mod.created_at).toLocaleDateString()}
                </p>
                {mod.last_login && (
                  <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Último acceso: {new Date(mod.last_login).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* ACCIONES (solo para moderadores, no super admins) */}
              {mod.role !== 'super_admin' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleActive(mod)}
                    className={`px-3 py-2 rounded transition text-sm ${
                      mod.is_active
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {mod.is_active ? '⏸️ Desactivar' : '▶️ Activar'}
                  </button>
                  <button
                    onClick={() => handleDelete(mod)}
                    className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition text-sm"
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {moderators.length === 0 && (
        <p className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          No hay administradores registrados
        </p>
      )}
    </div>
  );
};

export default ModeratorManagement;