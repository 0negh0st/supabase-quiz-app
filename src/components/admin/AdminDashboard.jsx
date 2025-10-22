import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import ModeratorManagement from './ModeratorManagement';

const AdminDashboard = ({ onLogout, adminData }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [darkMode, setDarkMode] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  const isSuperAdmin = adminData?.role === 'super_admin';

  useEffect(() => {
    loadSessions();
    subscribeToSessions();
  }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest('.dropdown-container')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .neq('status', 'obsolete')
        .order('last_activity', { ascending: false});

      if (error) throw error;

      setSessions(data || []);
      console.log('📊 Sesiones cargadas:', data?.length);
    } catch (error) {
      console.error('❌ Error cargando sesiones:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToSessions = () => {
    const channel = supabase
      .channel('admin_sessions')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        (payload) => {
          console.log('🔔 Cambio detectado:', payload);
          
          if (payload.eventType === 'INSERT') {
            setSessions(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setSessions(prev => prev.map(s => 
              s.id === payload.new.id ? payload.new : s
            ));
          } else if (payload.eventType === 'DELETE') {
            setSessions(prev => prev.filter(s => s.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleCorrect = async (session) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          current_step: session.current_step + 1,
          waiting_for_admin: false,
          last_activity: new Date().toISOString()
        })
        .eq('id', session.id);

      if (error) throw error;
      console.log('✅ Respuesta marcada como correcta');
      setOpenDropdown(null);
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const handleIncorrect = async (session, customMessage = null) => {
    try {
      const updates = {
        waiting_for_admin: false,
        last_activity: new Date().toISOString()
      };

      if (customMessage) {
        updates.temp_admin_message = customMessage;
      }

      const { error } = await supabase
        .from('sessions')
        .update(updates)
        .eq('id', session.id);

      if (error) throw error;
      console.log('❌ Respuesta marcada como incorrecta');
      setOpenDropdown(null);
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const handleFinalize = async (session) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          current_step: 6,
          waiting_for_admin: false,
          last_activity: new Date().toISOString()
        })
        .eq('id', session.id);

      if (error) throw error;
      console.log('🏁 Usuario enviado a thank you');
      setOpenDropdown(null);
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const handleRestart = async (session) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          current_step: 1,
          waiting_for_admin: false,
          answer_1: null,
          answer_2: null,
          answer_3: null,
          rating: null,
          last_activity: new Date().toISOString()
        })
        .eq('id', session.id);

      if (error) throw error;
      console.log('🔄 Usuario reiniciado');
      setOpenDropdown(null);
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const handleBlock = async (session) => {
    if (!isSuperAdmin) {
      alert('⛔ Solo Super Admins pueden bloquear IPs');
      return;
    }

    if (!confirm(`¿Bloquear IP ${session.ip_address}?`)) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          is_blocked: true,
          status: 'blocked',
          last_activity: new Date().toISOString()
        })
        .eq('ip_address', session.ip_address);

      if (error) throw error;
      console.log('🚫 IP bloqueada');
      setOpenDropdown(null);
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const handleClearAll = async () => {
    if (!isSuperAdmin) {
      alert('⛔ Solo Super Admins pueden limpiar sesiones');
      return;
    }

    if (!confirm('¿Eliminar TODAS las sesiones inactivas? Esta acción no se puede deshacer.')) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('status', 'inactive');

      if (error) throw error;
      console.log('🗑️ Sesiones inactivas eliminadas');
      loadSessions();
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const getStepLabel = (step) => {
    const labels = {
      1: 'Bienvenida',
      2: 'Pregunta 1',
      3: 'Pregunta 2',
      4: 'Pregunta 3',
      5: 'Calificación',
      6: 'Completado'
    };
    return labels[step] || 'Desconocido';
  };

  const getTimeSince = (timestamp) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins === 1) return '1 min';
    if (diffMins < 60) return `${diffMins} mins`;
    
    const diffHours = Math.floor(diffMins / 60);
    return diffHours === 1 ? '1 hora' : `${diffHours} horas`;
  };

  const getDeviceIcon = (deviceInfo) => {
    if (!deviceInfo) return '🖥️';
    const info = deviceInfo.toLowerCase();
    if (info.includes('mobile') || info.includes('android') || info.includes('iphone')) {
      return '📱';
    }
    return '🖥️';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p>Cargando sesiones...</p>
        </div>
      </div>
    );
  }

  const activeSessions = sessions.filter(s => s.status === 'active');
  const inactiveSessions = sessions.filter(s => s.status === 'inactive');
  const displaySessions = activeTab === 'active' ? activeSessions : inactiveSessions;

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-100'} transition-colors duration-300`}>
      <div className="p-6">
        {/* HEADER */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 mb-6`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Admin Panel
              </h1>
              <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-2 mt-1`}>
                <span className="font-medium">{adminData.full_name}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                  {isSuperAdmin ? '👑 Super Admin' : '🛡️ Moderador'}
                </span>
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Stats */}
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{activeSessions.length}</div>
                <div className="text-sm text-gray-500">Sesiones activas</div>
              </div>

              {/* Dark Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-3 rounded-lg transition ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
                title={darkMode ? 'Modo claro' : 'Modo oscuro'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>

              {/* Mod Management (Solo Super Admin) */}
              {isSuperAdmin && (
                <button
                  onClick={() => setShowModPanel(!showModPanel)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
                >
                  <span>👥</span>
                  <span>Gestionar Mods</span>
                </button>
              )}

              {/* Clear All (Solo Super Admin) */}
              {isSuperAdmin && (
                <button
                  onClick={handleClearAll}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                  title="Eliminar sesiones inactivas"
                >
                  🗑️ Limpiar Todo
                </button>
              )}

              {/* Logout */}
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* PANEL DE MODERADORES */}
        {showModPanel && isSuperAdmin && (
          <ModeratorManagement 
            darkMode={darkMode} 
            onClose={() => setShowModPanel(false)}
            superAdminId={adminData.id}
          />
        )}

        {/* TABS */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow mb-6`}>
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 px-6 py-4 font-medium transition ${
                activeTab === 'active'
                  ? darkMode
                    ? 'border-b-2 border-blue-500 text-blue-400'
                    : 'border-b-2 border-blue-600 text-blue-600'
                  : darkMode
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🟢 Activas ({activeSessions.length})
            </button>
            <button
              onClick={() => setActiveTab('inactive')}
              className={`flex-1 px-6 py-4 font-medium transition ${
                activeTab === 'inactive'
                  ? darkMode
                    ? 'border-b-2 border-blue-500 text-blue-400'
                    : 'border-b-2 border-blue-600 text-blue-600'
                  : darkMode
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🔴 Inactivas ({inactiveSessions.length})
            </button>
          </div>
        </div>

        {/* TABLA DE SESIONES */}
        <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>User #</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Nombre</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Edad</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Paso</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>R1</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>R2</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>R3</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Rating</th>
                  <th className={`px-4 py-3 text-center text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Gestionar</th>
                </tr>
              </thead>
              <tbody>
                {displaySessions.length === 0 ? (
                  <tr>
                    <td colSpan="9" className={`px-4 py-8 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      No hay sesiones {activeTab === 'active' ? 'activas' : 'inactivas'}
                    </td>
                  </tr>
                ) : (
                  displaySessions.map((session) => (
                    <tr 
                      key={session.id}
                      className={`border-b ${
                        darkMode ? 'border-gray-700' : 'border-gray-200'
                      } ${
                        session.waiting_for_admin 
                          ? 'bg-yellow-50 dark:bg-yellow-900/20' 
                          : darkMode ? 'bg-gray-800' : 'bg-white'
                      } hover:${darkMode ? 'bg-gray-700' : 'bg-gray-50'} transition`}
                    >
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        #{session.user_number || session.id.slice(0, 8)}
                        {session.waiting_for_admin && (
                          <span className="ml-2 inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {session.user_name || '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {session.user_age || '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {session.current_step}/6 - {getStepLabel(session.current_step)}
                      </td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {session.answer_1 || '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {session.answer_2 || '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {session.answer_3 || '-'}
                      </td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                        {session.rating ? `${session.rating}⭐` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center relative dropdown-container">
                        <button
                          onClick={() => setOpenDropdown(openDropdown === session.id ? null : session.id)}
                          className={`p-2 rounded hover:${darkMode ? 'bg-gray-700' : 'bg-gray-100'} transition`}
                        >
                          <span className="text-lg">⋮</span>
                        </button>

                        {/* DROPDOWN MENU */}
                        {openDropdown === session.id && (
                          <div className={`absolute right-0 mt-2 w-80 ${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-lg shadow-xl border ${darkMode ? 'border-gray-600' : 'border-gray-200'} z-50`}>
                            {/* INFO */}
                            <div className={`p-4 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span>{getDeviceIcon(session.device_info)}</span>
                                  <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                                    {session.device_info || 'Desconocido'}
                                  </span>
                                </div>
                                <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                                  <strong>IP:</strong> {session.ip_address || 'N/A'}
                                </div>
                                <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                                  <strong>Ingreso:</strong> {new Date(session.created_at).toLocaleString()}
                                </div>
                                <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                                  <strong>Última actividad:</strong> {getTimeSince(session.last_activity)}
                                </div>
                                <div className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                                  <strong>Estado:</strong> {session.status === 'active' ? '🟢 Activo' : '🔴 Inactivo'}
                                </div>
                              </div>
                            </div>

                            {/* RESPUESTA SI ESPERA */}
                            {session.waiting_for_admin && (
                              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b dark:border-gray-600">
                                <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                                  Respuesta del usuario:
                                </p>
                                <p className="text-sm text-yellow-900 dark:text-yellow-200">
                                  {session[`answer_${session.current_step - 1}`] || 'Sin respuesta'}
                                </p>
                              </div>
                            )}

                            {/* ACCIONES */}
                            <div className="p-3 space-y-2">
                              {/* Botones para preguntas */}
                              {session.waiting_for_admin && session.current_step >= 2 && session.current_step <= 4 && (
                                <>
                                  <button
                                    onClick={() => handleCorrect(session)}
                                    className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                                  >
                                    ✅ Marcar Correcta
                                  </button>
                                  <button
                                    onClick={() => handleIncorrect(session)}
                                    className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition"
                                  >
                                    ❌ Marcar Incorrecta
                                  </button>
                                  <button
                                    onClick={() => {
                                      const msg = prompt('Mensaje personalizado para el usuario:');
                                      if (msg) handleIncorrect(session, msg);
                                    }}
                                    className="w-full px-3 py-2 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition"
                                  >
                                    💬 Enviar Mensaje
                                  </button>
                                </>
                              )}

                              {/* Botones para calificación */}
                              {session.waiting_for_admin && session.current_step === 5 && (
                                <>
                                  <button
                                    onClick={() => handleFinalize(session)}
                                    className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                                  >
                                    🏁 Finalizar
                                  </button>
                                  <button
                                    onClick={() => handleRestart(session)}
                                    className="w-full px-3 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition"
                                  >
                                    🔄 Reiniciar
                                  </button>
                                </>
                              )}

                              {/* Reiniciar siempre disponible */}
                              {!session.waiting_for_admin && (
                                <button
                                  onClick={() => handleRestart(session)}
                                  className="w-full px-3 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition"
                                >
                                  🔄 Reiniciar Usuario
                                </button>
                              )}

                              {/* Bloquear IP (Solo Super Admin) */}
                              {isSuperAdmin && !session.is_blocked && (
                                <button
                                  onClick={() => handleBlock(session)}
                                  className="w-full px-3 py-2 bg-red-700 text-white text-sm rounded hover:bg-red-800 transition"
                                >
                                  🚫 Bloquear IP
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;