import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';

/**
 * FLUJO COMPLETO DEL USUARIO
 * 1. Bienvenida (nombre + edad)
 * 2. Pregunta 1 → Loading → (Correcto: avanza | Incorrecto: reintenta)
 * 3. Pregunta 2 → Loading → (Correcto: avanza | Incorrecto: reintenta)
 * 4. Pregunta 3 → Loading → (Correcto: avanza | Incorrecto: reintenta)
 * 5. Calificación (1-5 estrellas)
 * 6. Thank you (fin)
 */
const UserFlow = () => {
  // Estado del flujo
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Datos del usuario
  const [userName, setUserName] = useState('');
  const [userAge, setUserAge] = useState('');
  
  // Respuestas
  const [answers, setAnswers] = useState({
    answer_1: '',
    answer_2: '',
    answer_3: ''
  });
  
  // Control de errores
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Rating
  const [rating, setRating] = useState(0);

  // Ref para el intervalo de actividad
  const activityInterval = useRef(null);

  /**
   * INICIALIZAR O RECUPERAR SESIÓN AL CARGAR
   */
  useEffect(() => {
    initializeOrRecoverSession();

    // Cleanup al desmontar
    return () => {
      if (activityInterval.current) {
        clearInterval(activityInterval.current);
      }
    };
  }, []);

  /**
   * SUSCRIPCIÓN A REALTIME
   * Escucha cambios en la sesión actual
   */
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`session_${sessionId}`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'sessions',
          filter: `id=eq.${sessionId}`
        },
        handleSessionUpdate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, isLoading, currentStep]);

  /**
   * ACTUALIZAR LAST_ACTIVITY CADA 30 SEGUNDOS
   */
  useEffect(() => {
    if (!sessionId) return;

    // Actualizar actividad cada 30 segundos
    activityInterval.current = setInterval(() => {
      updateActivity();
    }, 30000); // 30 segundos

    // Limpiar intervalo al desmontar
    return () => {
      if (activityInterval.current) {
        clearInterval(activityInterval.current);
      }
    };
  }, [sessionId]);

  /**
   * MARCAR SESIÓN COMO INACTIVA AL SALIR
   */
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionId) {
        // Usar sendBeacon para enviar datos al cerrar
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/sessions?id=eq.${sessionId}`,
          JSON.stringify({ is_active: false })
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && sessionId) {
        markAsInactive();
      } else if (!document.hidden && sessionId) {
        markAsActive();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId]);

  /**
   * Inicializar o recuperar sesión existente
   */
  const initializeOrRecoverSession = async () => {
    try {
      // Verificar si hay un token de sesión guardado
      const savedToken = localStorage.getItem('quiz_session_token');
      
      if (savedToken) {
        console.log('🔄 Recuperando sesión existente...');
        
        // Buscar sesión por token
        const { data: existingSession, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('session_token', savedToken)
          .eq('status', 'active')
          .single();

        if (existingSession && !error) {
          console.log('✅ Sesión recuperada:', existingSession.id);
          setSessionId(existingSession.id);
          setCurrentStep(existingSession.current_step);
          setUserName(existingSession.user_name || '');
          setUserAge(existingSession.user_age || '');
          
          // Marcar como activa de nuevo
          await supabase
            .from('sessions')
            .update({ 
              is_active: true,
              last_activity: new Date().toISOString() 
            })
            .eq('id', existingSession.id);
          
          return;
        }
      }

      // Si no hay sesión guardada o no se encontró, crear una nueva
      await createNewSession();
    } catch (error) {
      console.error('❌ Error al inicializar sesión:', error);
      await createNewSession();
    }
  };

  /**
   * Crear nueva sesión
   */
  const createNewSession = async () => {
    try {
      // Generar token único
      const sessionToken = generateSessionToken();
      
      // Detectar IP y device
      const ip = await getUserIP();
      const device = getDeviceInfo();
      const geoLocation = await getGeoLocation(ip);

      // Crear sesión en Supabase
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          session_token: sessionToken,
          ip_address: ip,
          device_info: device,
          geo_location: geoLocation,
          status: 'active',
          is_active: true,
          current_step: 1
        })
        .select()
        .single();

      if (error) throw error;

      // Guardar token en localStorage
      localStorage.setItem('quiz_session_token', sessionToken);
      
      setSessionId(data.id);
      console.log('✅ Nueva sesión creada:', data.id);
    } catch (error) {
      console.error('❌ Error al crear sesión:', error);
    }
  };

  /**
   * Actualizar actividad
   */
  const updateActivity = async () => {
    if (!sessionId) return;

    await supabase
      .from('sessions')
      .update({ 
        last_activity: new Date().toISOString(),
        is_active: true 
      })
      .eq('id', sessionId);
  };

  /**
   * Marcar como inactiva
   */
  const markAsInactive = async () => {
    if (!sessionId) return;

    await supabase
      .from('sessions')
      .update({ is_active: false })
      .eq('id', sessionId);
  };

  /**
   * Marcar como activa
   */
  const markAsActive = async () => {
    if (!sessionId) return;

    await supabase
      .from('sessions')
      .update({ 
        is_active: true,
        last_activity: new Date().toISOString() 
      })
      .eq('id', sessionId);
  };

  /**
   * Manejar actualizaciones de Realtime
   */
  const handleSessionUpdate = (payload) => {
    const updatedSession = payload.new;
    
    console.log('🔔 Sesión actualizada:', updatedSession);
    console.log('📊 waiting_for_admin:', updatedSession.waiting_for_admin);
    console.log('📊 isLoading:', isLoading);
    console.log('📊 current_step DB:', updatedSession.current_step, 'vs local:', currentStep);

    // Si la sesión fue bloqueada, mostrar mensaje y limpiar localStorage
    if (updatedSession.is_blocked) {
      alert('Tu sesión ha sido bloqueada por el administrador.');
      localStorage.removeItem('quiz_session_token');
      window.location.reload();
      return;
    }

    // SINCRONIZAR current_step si están desincronizados
    if (updatedSession.current_step !== currentStep && !isLoading) {
      console.log('🔄 Sincronizando step:', currentStep, '→', updatedSession.current_step);
      setCurrentStep(updatedSession.current_step);
    }

    // Si waiting_for_admin cambió a false = admin respondió
    if (!updatedSession.waiting_for_admin && isLoading) {
      console.log('✅ ENTRANDO AL IF - Admin respondió');
      setIsLoading(false);

      // ¿Admin aprobó la respuesta?
      if (updatedSession.current_step > currentStep) {
        // CORRECTO - Avanzar al siguiente paso
        console.log('✅ Respuesta CORRECTA - Avanzando a paso', updatedSession.current_step);
        setCurrentStep(updatedSession.current_step);
        // Limpiar respuesta para siguiente pregunta
        setAnswers({ ...answers, [`answer_${currentStep - 1}`]: '' });
      } else {
        // INCORRECTO - Mostrar error y volver a preguntar
        const message = updatedSession.temp_admin_message || 
          'Tu respuesta es incorrecta. Por favor, intenta de nuevo.';
        
        console.log('❌ Respuesta INCORRECTA - Mostrando error');
        setErrorMessage(message);
        setShowError(true);

        // Limpiar mensaje temporal del admin
        clearAdminMessage();
      }
    }
  };

  /**
   * Limpiar mensaje temporal del admin después de mostrarlo
   */
  const clearAdminMessage = async () => {
    if (!sessionId) return;

    await supabase
      .from('sessions')
      .update({ temp_admin_message: null })
      .eq('id', sessionId);
  };

  /**
   * PASO 1: Guardar nombre y edad
   */
  const handleWelcomeSubmit = async (name, age) => {
    console.log('📝 Guardando nombre y edad:', name, age);
    
    setUserName(name);
    setUserAge(age);

    // Actualizar sesión en Supabase
    const { error } = await supabase
      .from('sessions')
      .update({
        user_name: name,
        user_age: age,
        current_step: 2,
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      console.error('❌ Error al guardar bienvenida:', error);
      return;
    }

    console.log('✅ Avanzando a pregunta 1');
    // Avanzar al paso 2 (Pregunta 1)
    setCurrentStep(2);
  };

  /**
   * PASOS 2, 3, 4: Enviar respuesta de pregunta
   */
  const handleQuestionSubmit = async (questionNumber, answer) => {
    console.log('📤 Enviando respuesta:', answer);
    
    // PRIMERO mostrar loading
    setIsLoading(true);
    
    // Guardar respuesta localmente
    setAnswers({ ...answers, [`answer_${questionNumber}`]: answer });

    // Actualizar en Supabase
    const { error } = await supabase
      .from('sessions')
      .update({
        [`answer_${questionNumber}`]: answer,
        [`answer_${questionNumber}_attempts`]: answers[`answer_${questionNumber}_attempts`] || 1,
        waiting_for_admin: true,
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      console.error('Error al guardar respuesta:', error);
      setIsLoading(false);
      return;
    }

    console.log('✅ Respuesta guardada, esperando admin...');
  };

  /**
   * Cerrar popup de error y limpiar respuesta
   */
  const handleErrorClose = () => {
    console.log('🔄 Cerrando popup de error, usuario puede reintentar');
    setShowError(false);
    setErrorMessage('');
  };

  /**
   * PASO 5: Enviar calificación
   */
  const handleRatingSubmit = async (stars) => {
    setRating(stars);

    await supabase
      .from('sessions')
      .update({
        rating: stars,
        current_step: 5,
        waiting_for_admin: true,
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);

    setIsLoading(true);
  };

  /**
   * RENDERIZAR COMPONENTE SEGÚN PASO ACTUAL
   */
  const renderCurrentStep = () => {
    if (isLoading) {
      return (
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-lg">Esperando validación del administrador...</p>
        </div>
      );
    }

    if (showError) {
      return (
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md mx-auto">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold mb-4">Respuesta Incorrecta</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <button
              onClick={handleErrorClose}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      );
    }

    switch (currentStep) {
      case 1:
        return (
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-center">Bienvenido</h1>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Tu nombre"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="number"
                placeholder="Tu edad"
                value={userAge}
                onChange={(e) => setUserAge(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              />
              <button
                onClick={() => handleWelcomeSubmit(userName, userAge)}
                disabled={!userName || !userAge}
                className="w-full px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        );

      case 2:
      case 3:
      case 4:
        const questionNumber = currentStep - 1;
        const questions = [
          "¿Cuál es la capital de Francia?",
          "¿Cuántos continentes hay en el mundo?",
          "¿Cuál es conocido como el planeta rojo?"
        ];
        
        return (
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4">Pregunta {questionNumber}</h2>
            <p className="text-lg mb-6">{questions[questionNumber - 1]}</p>
            <input
              type="text"
              placeholder="Tu respuesta"
              value={answers[`answer_${questionNumber}`] || ''}
              onChange={(e) => setAnswers({ 
                ...answers, 
                [`answer_${questionNumber}`]: e.target.value 
              })}
              className="w-full px-4 py-2 border rounded-lg mb-4"
            />
            <button
              onClick={() => handleQuestionSubmit(questionNumber, answers[`answer_${questionNumber}`])}
              disabled={!answers[`answer_${questionNumber}`]}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
            >
              Enviar respuesta
            </button>
          </div>
        );

      case 5:
        return (
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">Califica tu experiencia</h2>
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="text-4xl"
                >
                  {star <= rating ? '⭐' : '☆'}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleRatingSubmit(rating)}
              disabled={rating === 0}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
            >
              Finalizar
            </button>
          </div>
        );

      case 6:
        return (
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md mx-auto text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-3xl font-bold mb-4">¡Gracias!</h2>
            <p className="text-gray-600">
              Tu participación ha sido registrada exitosamente.
            </p>
          </div>
        );

      default:
        return <div>Paso desconocido</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      {renderCurrentStep()}
    </div>
  );
};

// ============================================
// UTILIDADES
// ============================================

/**
 * Generar token único para la sesión
 */
const generateSessionToken = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Obtener IP del usuario
 */
const getUserIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    return 'unknown';
  }
};

/**
 * Obtener información del dispositivo
 */
const getDeviceInfo = () => {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`
  };
};

/**
 * Obtener geolocalización desde IP (gratis con ip-api.com)
 */
const getGeoLocation = async (ip) => {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
        city: data.city,
        lat: data.lat,
        lon: data.lon,
        timezone: data.timezone,
        isp: data.isp
      };
    }
    return null;
  } catch (error) {
    console.error('Error obteniendo geolocalización:', error);
    return null;
  }
};

export default UserFlow;