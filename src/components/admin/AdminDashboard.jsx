import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import ModeratorManagement from './ModeratorManagement';

const AdminDashboard = ({ onLogout, adminData }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [darkMode, setDarkMode] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);

  const isSuperAdmin = adminData?.role === 'super_admin';

  useEffect(() => {
    loadSessions();
    subscribeToSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .neq('status', 'obsolete')
        .order('last_activity', { ascending: false });

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
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const handleGoToStep = async (session, step) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          current_step: step,
          waiting_for_admin: false,
          last_activity: new Date().toISOString()
        })
        .eq('id', session.id);

      if (error) throw error;
      console.log(`📍 Usuario movido al paso ${step}`);
      setShowModal(false);
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
      setShowModal(false);
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

  const getTimeSinceActivity = (lastActivity) => {
    const now = new Date();
    const last = new Date(lastActivity);
    const diffMs = now - last;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins === 1) return '1 min';
    if (diffMins < 60) return `${diffMins} mins`;
    
    const diffHours = Math.floor(diffMins / 60);
    return diffHours === 1 ? '1 hora' : `${diffHours} horas`;
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

        {/* PANEL DE MODERADORES (Solo Super Admin) */}
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

        {/* LISTA DE SESIONES */}
        <div className="space-y-4">
          {displaySessions.length === 0 ? (
            <div className={`${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-600'} rounded-lg shadow p-8 text-center`}>
              <div className="text-4xl mb-4">📭</div>
              <p className="text-lg">No hay sesiones {activeTab === 'active' ? 'activas' : 'inactivas'}</p>
            </div>
          ) : (
            displaySessions.map((session) => (
              <div
                key={session.id}
                className={`${
                  darkMode ? 'bg-gray-800' : 'bg-white'
                } rounded-lg shadow p-6 hover:shadow-lg transition`}
              >
                <div className="flex items-start justify-between">
                  {/* INFO */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                        {session.user_name || 'Usuario'} ({session.user_age || '?'} años)
                      </h3>
                      {session.is_blocked && (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                          🚫 Bloqueado
                        </span>
                      )}
                      {session.waiting_for_admin && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium animate-pulse">
                          ⏳ Esperando
                        </span>
                      )}
                    </div>
                    
                    <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} space-y-1`}>
                      <p>📍 <strong>Paso:</strong> {getStepLabel(session.current_step)}</p>
                      <p>🕐 <strong>Actividad:</strong> {getTimeSinceActivity(session.last_activity)}</p>
                      <p>🌍 <strong>IP:</strong> {session.ip_address || 'Desconocido'}</p>
                    </div>

                    {/* Mostrar respuesta si está esperando */}
                    {session.waiting_for_admin && (
                      <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                        <p className="font-medium text-blue-900 mb-2">
                          Respuesta del usuario:
                        </p>
                        <p className="text-blue-800">
                          {session[`answer_${session.current_step - 1}`] || 'Sin respuesta'}
                        </p>
                      </div>
                    )}

                    {/* Rating si está en paso 5 */}
                    {session.current_step === 5 && session.rating && (
                      <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                        <p className="font-medium text-yellow-900 mb-2">
                          Calificación:
                        </p>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <span key={i} className="text-2xl">
                              {i < session.rating ? '⭐' : '☆'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ACCIONES */}
                  <div className="flex flex-col gap-2 ml-4">
                    {/* Ver detalles */}
                    <button
                      onClick={() => {
                        setSelectedSession(session);
                        setShowModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition whitespace-nowrap"
                    >
                      👁️ Ver Detalles
                    </button>

                    {/* Acciones según estado */}
                    {session.waiting_for_admin && (
                      <>
                        <button
                          onClick={() => handleCorrect(session)}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                        >
                          ✅ Correcto
                        </button>
                        <button
                          onClick={() => handleIncorrect(session)}
                          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                        >
                          ❌ Incorrecto
                        </button>
                      </>
                    )}

                    {/* Rating esperando */}
                    {session.current_step === 5 && session.waiting_for_admin && (
                      <button
                        onClick={() => handleFinalize(session)}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
                      >
                        🏁 Finalizar
                      </button>
                    )}

                    {/* Reiniciar */}
                    <button
                      onClick={() => handleRestart(session)}
                      className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition"
                    >
                      🔄 Reiniciar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* MODAL DE DETALLES */}
        {showModal && selectedSession && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
              <div className="flex justify-between items-start mb-4">
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Detalles de Sesión
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className={`space-y-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <div>
                  <p className="font-semibold">Usuario:</p>
                  <p>{selectedSession.user_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-semibold">Edad:</p>
                  <p>{selectedSession.user_age || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-semibold">IP Address:</p>
                  <p>{selectedSession.ip_address || 'Desconocido'}</p>
                </div>
                <div>
                  <p className="font-semibold">Device Info:</p>
                  <p>{selectedSession.device_info || 'Desconocido'}</p>
                </div>
                <div>
                  <p className="font-semibold">Paso actual:</p>
                  <p>{getStepLabel(selectedSession.current_step)}</p>
                </div>
                <div>
                  <p className="font-semibold">Respuestas:</p>
                  <ul className="list-disc list-inside">
                    {selectedSession.answer_1 && <li>Pregunta 1: {selectedSession.answer_1}</li>}
                    {selectedSession.answer_2 && <li>Pregunta 2: {selectedSession.answer_2}</li>}
                    {selectedSession.answer_3 && <li>Pregunta 3: {selectedSession.answer_3}</li>}
                  </ul>
                </div>
                {selectedSession.rating && (
                  <div>
                    <p className="font-semibold">Calificación:</p>
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className="text-2xl">
                          {i < selectedSession.rating ? '⭐' : '☆'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Llevar a paso específico */}
                <div className="pt-4 border-t">
                  <p className="font-semibold mb-2">Llevar a paso:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map(step => (
                      <button
                        key={step}
                        onClick={() => handleGoToStep(selectedSession, step)}
                        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                      >
                        {getStepLabel(step)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bloquear IP (Solo Super Admin) */}
                {isSuperAdmin && !selectedSession.is_blocked && (
                  <button
                    onClick={() => handleBlock(selectedSession)}
                    className="w-full mt-4 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                  >
                    🚫 Bloquear IP
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;