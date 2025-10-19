import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';

const AdminDashboard = ({ onLogout }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar sesiones inicialmente
  useEffect(() => {
    loadSessions();
    subscribeToSessions();
  }, []);

  // Cargar todas las sesiones
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

  // Suscribirse a cambios en tiempo real
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

  // Marcar respuesta como CORRECTA
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

  // Marcar respuesta como INCORRECTA
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

  // Finalizar (enviar a thank you)
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

  // Reiniciar usuario
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
          <p>Cargando sesiones...</p>
        </div>
      </div>
    );
  }

  const waitingSessions = sessions.filter(s => s.waiting_for_admin);
  const activeSessions = sessions.filter(s => s.status === 'active');

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
            <p className="text-gray-600">Monitoreo en tiempo real</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">{activeSessions.length}</div>
              <div className="text-sm text-gray-600">Activos</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-600">{waitingSessions.length}</div>
              <div className="text-sm text-gray-600">Esperando</div>
            </div>
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de sesiones */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">User #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Edad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Paso</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">R1</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">R2</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">R3</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Rating</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    No hay sesiones activas
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr 
                    key={session.id} 
                    className={`border-b ${session.waiting_for_admin ? 'bg-yellow-50' : 'bg-white'} hover:bg-gray-50`}
                  >
                    <td className="px-4 py-3 text-sm">
                      #{session.user_number}
                      {session.waiting_for_admin && (
                        <span className="ml-2 inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{session.user_name || '-'}</td>
                    <td className="px-4 py-3 text-sm">{session.user_age || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      {session.current_step}/6 - {getStepLabel(session.current_step)}
                      {session.waiting_for_admin && (
                        <div className="text-xs text-yellow-600 font-semibold mt-1">⏳ ESPERANDO</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{session.answer_1 || '-'}</td>
                    <td className="px-4 py-3 text-sm">{session.answer_2 || '-'}</td>
                    <td className="px-4 py-3 text-sm">{session.answer_3 || '-'}</td>
                    <td className="px-4 py-3 text-sm">{session.rating ? `${session.rating}⭐` : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {/* Botones para preguntas */}
                        {session.waiting_for_admin && session.current_step >= 2 && session.current_step <= 4 && (
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
                        {session.waiting_for_admin && session.current_step === 5 && (
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
