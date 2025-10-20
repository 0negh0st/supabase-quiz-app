import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';

const AdminDashboard = ({ onLogout }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active' o 'inactive'
  const [darkMode, setDarkMode] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    loadSessions();
    const cleanup = setupRealtimeSubscription();
    
    // Verificar sesiones inactivas cada 30 segundos
    const inactivityCheck = setInterval(() => {
      checkInactiveSessions();
    }, 30000);

    return () => {
      cleanup();
      clearInterval(inactivityCheck);
    };
  }, []);

  /**
   * Cargar todas las sesiones (activas e inactivas)
   */
  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSessions(data || []);
      console.log('✅ Sesiones cargadas:', data?.length);
    } catch (error) {
      console.error('❌ Error cargando sesiones:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verificar y marcar sesiones inactivas (1 minuto sin actividad)
   */
  const checkInactiveSessions = async () => {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      
      const { error } = await supabase
        .from('sessions')
        .update({ is_active: false })
        .eq('is_active', true)
        .lt('last_activity', oneMinuteAgo);

      if (error) throw error;
    } catch (error) {
      console.error('❌ Error verificando inactividad:', error);
    }
  };

  /**
   * Configurar suscripción a cambios en tiempo real
   */
  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('sessions_channel')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'sessions'
        },
        (payload) => {
          console.log('📡 Admin - Cambio detectado:', payload.eventType, payload.new || payload.old);
          
          if (payload.eventType === 'INSERT') {
            if (payload.new.status === 'active') {
              setSessions(prev => [payload.new, ...prev]);
              console.log('✅ Nueva sesión agregada al admin');
            }
          } else if (payload.eventType === 'UPDATE') {
            setSessions(prev => 
              prev.map(s => s.id === payload.new.id ? payload.new : s)
            );
            console.log('✅ Sesión actualizada en admin');
          } else if (payload.eventType === 'DELETE') {
            setSessions(prev => prev.filter(s => s.id !== payload.old.id));
            console.log('✅ Sesión eliminada del admin');
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Admin Realtime status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  /**
   * Marcar respuesta como CORRECTA
   */
  const handleCorrect = async (session) => {
    try {
      console.log('✅ Marcando respuesta como CORRECTA para sesión:', session.id);
      
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

  /**
   * Marcar respuesta como INCORRECTA
   */
  const handleIncorrect = async (session, customMessage = null) => {
    try {
      console.log('❌ Marcando respuesta como INCORRECTA para sesión:', session.id);
      
      const updates = {
        waiting_for_admin: false,
        last_activity: new Date().toISOString()
      };

      if (customMessage) {
        updates.temp_admin_message = customMessage;
        console.log('💬 Mensaje personalizado:', customMessage);
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

  /**
   * Finalizar (enviar a thank you)
   */
  const handleFinalize = async (session) => {
    try {
      console.log('🏁 Finalizando sesión:', session.id);
      
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

  /**
   * Reiniciar usuario
   */
  const handleRestart = async (session) => {
    try {
      console.log('🔄 Reiniciando sesión:', session.id);
      
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

  /**
   * Llevar usuario a paso específico
   */
  const handleGoToStep = async (session) => {
    const step = prompt('¿A qué paso quieres llevar al usuario? (1-6)');
    const stepNumber = parseInt(step);
    
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 6) {
      alert('Paso inválido. Debe ser un número entre 1 y 6.');
      return;
    }

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          current_step: stepNumber,
          waiting_for_admin: false,
          last_activity: new Date().toISOString()
        })
        .eq('id', session.id);

      if (error) throw error;
      console.log(`✅ Usuario llevado al paso ${stepNumber}`);
      alert(`Usuario llevado al paso ${stepNumber}`);
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error al cambiar el paso');
    }
  };

  /**
   * Bloquear sesión y IP
   */
  const handleBlock = async (session) => {
    const reason = prompt('Motivo del bloqueo:');
    if (!reason) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          is_blocked: true,
          blocked_reason: reason,
          status: 'blocked',
          last_activity: new Date().toISOString()
        })
        .eq('id', session.id);

      if (error) throw error;
      
      console.log('🚫 Sesión bloqueada');
      alert('Usuario bloqueado exitosamente');
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error al bloquear usuario');
    }
  };

  /**
   * Limpiar todas las sesiones
   */
  const handleClearAllSessions = async () => {
    const confirm = window.confirm(
      '¿Estás seguro de que quieres eliminar TODAS las sesiones? Esta acción no se puede deshacer.'
    );
    
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Eliminar todas

      if (error) throw error;
      
      // Reiniciar el contador de user_number
      await supabase.rpc('reset_user_number_sequence');
      
      setSessions([]);
      console.log('🗑️ Todas las sesiones eliminadas');
      alert('Todas las sesiones han sido eliminadas');
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error al eliminar sesiones');
    }
  };

  /**
   * Mostrar modal de detalles
   */
  const handleShowDetails = (session) => {
    setSelectedSession(session);
    setShowDetailsModal(true);
  };

  /**
   * Calcular duración de la sesión
   */
  const getSessionDuration = (session) => {
    const start = new Date(session.created_at);
    const end = new Date(session.last_activity);
    const diff = Math.floor((end - start) / 1000); // segundos
    
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    
    return `${minutes}m ${seconds}s`;
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

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-100'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
          <p className={darkMode ? 'text-white' : ''}>Cargando sesiones...</p>
        </div>
      </div>
    );
  }

  const activeSessions = sessions.filter(s => s.is_active && !s.is_blocked);
  const inactiveSessions = sessions.filter(s => !s.is_active || s.is_blocked);
  const waitingSessions = activeSessions.filter(s => s.waiting_for_admin);
  const displayedSessions = activeTab === 'active' ? activeSessions : inactiveSessions;

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-100'} p-6 transition-colors`}>
      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 mb-6`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              Admin Panel
            </h1>
            <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
              Monitoreo en tiempo real
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className={`text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                {activeSessions.length}
              </div>
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Activos
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                {waitingSessions.length}
              </div>
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Esperando
              </div>
            </div>
            
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-4 py-2 rounded-lg ${
                darkMode 
                  ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400' 
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            {/* Limpiar todo */}
            <button
              onClick={handleClearAllSessions}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              🗑️ Limpiar todo
            </button>

            <button
              onClick={onLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
            activeTab === 'active'
              ? darkMode
                ? 'bg-blue-600 text-white'
                : 'bg-blue-600 text-white'
              : darkMode
                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          🟢 Sesiones Activas ({activeSessions.length})
        </button>
        <button
          onClick={() => setActiveTab('inactive')}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
            activeTab === 'inactive'
              ? darkMode
                ? 'bg-blue-600 text-white'
                : 'bg-blue-600 text-white'
              : darkMode
                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          ⭕ Sesiones Inactivas ({inactiveSessions.length})
        </button>
      </div>

      {/* Tabla de sesiones */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  User #
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Estado
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Nombre
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Edad
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Paso
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  R1
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  R2
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  R3
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Rating
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedSessions.length === 0 ? (
                <tr>
                  <td colSpan="10" className={`px-4 py-8 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No hay sesiones {activeTab === 'active' ? 'activas' : 'inactivas'}
                  </td>
                </tr>
              ) : (
                displayedSessions.map((session) => (
                  <tr 
                    key={session.id} 
                    className={`border-b ${
                      session.waiting_for_admin 
                        ? darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50'
                        : darkMode ? 'bg-gray-800' : 'bg-white'
                    } ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                  >
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      #{session.user_number}
                      {session.waiting_for_admin && (
                        <span className="ml-2 inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {session.is_blocked ? (
                        <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">🚫 Bloqueado</span>
                      ) : session.is_active ? (
                        <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">🟢 Activo</span>
                      ) : (
                        <span className={`px-2 py-1 ${darkMode ? 'bg-gray-700' : 'bg-gray-400'} text-white text-xs rounded`}>
                          ⭕ Inactivo
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      {session.user_name || '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      {session.user_age || '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      {session.current_step}/6 - {getStepLabel(session.current_step)}
                      {session.waiting_for_admin && (
                        <div className="text-xs text-yellow-600 font-semibold mt-1">⏳ ESPERANDO</div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      {session.answer_1 || '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      {session.answer_2 || '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      {session.answer_3 || '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : ''}`}>
                      {session.rating ? `${session.rating}⭐` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {/* Botón de detalles siempre visible */}
                        <button
                          onClick={() => handleShowDetails(session)}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          ℹ️ Detalles
                        </button>

                        {/* Botones para preguntas (solo sesiones activas) */}
                        {session.is_active && !session.is_blocked && session.waiting_for_admin && session.current_step >= 2 && session.current_step <= 4 && (
                          <>
                            <button
                              onClick={() => handleCorrect(session)}
                              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              ✓ Correcta
                            </button>
                            <button
                              onClick={() => handleIncorrect(session)}
                              className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            >
                              ✗ Incorrecta
                            </button>
                            <button
                              onClick={() => {
                                const msg = prompt('Mensaje personalizado para el usuario:');
                                if (msg) handleIncorrect(session, msg);
                              }}
                              className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                            >
                              💬 Mensaje
                            </button>
                          </>
                        )}

                        {/* Botones para calificación */}
                        {session.is_active && !session.is_blocked && session.waiting_for_admin && session.current_step === 5 && (
                          <>
                            <button
                              onClick={() => handleFinalize(session)}
                              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                            >
                              🏁 Finalizar
                            </button>
                            <button
                              onClick={() => handleRestart(session)}
                              className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                            >
                              🔄 Reiniciar
                            </button>
                          </>
                        )}

                        {/* Botón "Llevar a paso" */}
                        {session.is_active && !session.is_blocked && (
                          <button
                            onClick={() => handleGoToStep(session)}
                            className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                          >
                            🎯 Ir a paso
                          </button>
                        )}

                        {/* Botón bloquear */}
                        {!session.is_blocked && (
                          <button
                            onClick={() => handleBlock(session)}
                            className="px-3 py-1 bg-red-800 text-white text-xs rounded hover:bg-red-900"
                          >
                            🚫 Bloquear
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de detalles */}
      {showDetailsModal && selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Detalles de Sesión #{selectedSession.user_number}
              </h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                className={`text-2xl ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Estado */}
              <div>
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Estado
                </h3>
                <div className="flex gap-2">
                  {selectedSession.is_blocked ? (
                    <span className="px-3 py-1 bg-red-600 text-white rounded">🚫 Bloqueado</span>
                  ) : selectedSession.is_active ? (
                    <span className="px-3 py-1 bg-green-600 text-white rounded">🟢 Activo</span>
                  ) : (
                    <span className="px-3 py-1 bg-gray-400 text-white rounded">⭕ Inactivo</span>
                  )}
                </div>
                {selectedSession.blocked_reason && (
                  <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Motivo: {selectedSession.blocked_reason}
                  </p>
                )}
              </div>

              {/* Información básica */}
              <div>
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Información básica
                </h3>
                <div className={`grid grid-cols-2 gap-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <div>
                    <span className="font-medium">Nombre:</span> {selectedSession.user_name || '-'}
                  </div>
                  <div>
                    <span className="font-medium">Edad:</span> {selectedSession.user_age || '-'}
                  </div>
                  <div>
                    <span className="font-medium">Paso actual:</span> {selectedSession.current_step}/6
                  </div>
                  <div>
                    <span className="font-medium">Rating:</span> {selectedSession.rating ? `${selectedSession.rating}⭐` : '-'}
                  </div>
                </div>
              </div>

              {/* Tiempos */}
              <div>
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Tiempos
                </h3>
                <div className={`grid grid-cols-2 gap-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <div>
                    <span className="font-medium">Inicio:</span> {formatDate(selectedSession.created_at)}
                  </div>
                  <div>
                    <span className="font-medium">Última actividad:</span> {formatDate(selectedSession.last_activity)}
                  </div>
                  <div>
                    <span className="font-medium">Duración:</span> {getSessionDuration(selectedSession)}
                  </div>
                </div>
              </div>

              {/* Conexión */}
              <div>
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Conexión
                </h3>
                <div className={`space-y-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <div>
                    <span className="font-medium">IP:</span> {selectedSession.ip_address || '-'}
                  </div>
                  {selectedSession.geo_location && (
                    <div>
                      <span className="font-medium">Ubicación:</span>{' '}
                      {selectedSession.geo_location.city}, {selectedSession.geo_location.region}, {selectedSession.geo_location.country}
                    </div>
                  )}
                  {selectedSession.device_info && (
                    <>
                      <div>
                        <span className="font-medium">Dispositivo:</span> {selectedSession.device_info.platform}
                      </div>
                      <div>
                        <span className="font-medium">Resolución:</span> {selectedSession.device_info.screenResolution}
                      </div>
                      <div className="text-xs">
                        <span className="font-medium">User Agent:</span>
                        <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs break-all">
                          {selectedSession.device_info.userAgent}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Respuestas */}
              <div>
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Respuestas
                </h3>
                <div className={`space-y-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <div>
                    <span className="font-medium">Pregunta 1:</span> {selectedSession.answer_1 || '-'} 
                    <span className="text-xs ml-2">({selectedSession.answer_1_attempts || 0} intentos)</span>
                  </div>
                  <div>
                    <span className="font-medium">Pregunta 2:</span> {selectedSession.answer_2 || '-'}
                    <span className="text-xs ml-2">({selectedSession.answer_2_attempts || 0} intentos)</span>
                  </div>
                  <div>
                    <span className="font-medium">Pregunta 3:</span> {selectedSession.answer_3 || '-'}
                    <span className="text-xs ml-2">({selectedSession.answer_3_attempts || 0} intentos)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;