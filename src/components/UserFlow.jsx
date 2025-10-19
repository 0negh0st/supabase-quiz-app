import React, { useState, useEffect } from 'react';
import { supabase, getUserIP, getDeviceInfo } from '../utils/supabase';

// Importaremos los componentes de pasos después
// import Step1Welcome from './user/Step1Welcome';
// import Step2Question from './user/Step2Question';
// import Step3Rating from './user/Step3Rating';
// import Step4ThankYou from './user/Step4ThankYou';
// import LoadingScreen from './user/LoadingScreen';
// import ErrorPopup from './user/ErrorPopup';

/**
 * UserFlow - Componente principal que maneja todo el flujo del usuario
 * 
 * FLUJO:
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

  /**
   * INICIALIZAR SESIÓN AL CARGAR
   * Crea una entrada en Supabase automáticamente
   */
  useEffect(() => {
    initializeSession();
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
  }, [sessionId]);

  /**
   * Inicializar sesión en Supabase
   */
  const initializeSession = async () => {
    try {
      // Detectar IP y device
      const ip = await getUserIP();
      const device = getDeviceInfo();

      // Crear sesión en Supabase
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          ip_address: ip,
          device_info: device,
          status: 'active',
          current_step: 1
        })
        .select()
        .single();

      if (error) throw error;

      setSessionId(data.id);
      console.log('✅ Sesión creada:', data.id);
    } catch (error) {
      console.error('❌ Error al crear sesión:', error);
    }
  };

  /**
   * Manejar actualizaciones de Realtime
   * El admin modificó la sesión
   */
  const handleSessionUpdate = (payload) => {
    const updatedSession = payload.new;
    
    console.log('🔔 Sesión actualizada:', updatedSession);

    // Si waiting_for_admin cambió a false = admin respondió
    if (!updatedSession.waiting_for_admin && isLoading) {
      setIsLoading(false);

      // ¿Admin aprobó la respuesta?
      if (updatedSession.current_step > currentStep) {
        // CORRECTO - Avanzar al siguiente paso
        setCurrentStep(updatedSession.current_step);
        // Limpiar respuesta para siguiente pregunta
        setAnswers({ ...answers, [`answer_${currentStep - 1}`]: '' });
      } else {
        // INCORRECTO - Mostrar error y volver a preguntar
        const message = updatedSession.temp_admin_message || 
          'Tu respuesta es incorrecta. Por favor, intenta de nuevo.';
        
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
    setUserName(name);
    setUserAge(age);

    // Actualizar sesión en Supabase
    await supabase
      .from('sessions')
      .update({
        user_name: name,
        user_age: age,
        current_step: 2,
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);

    // Avanzar al paso 2 (Pregunta 1)
    setCurrentStep(2);
  };

  /**
   * PASOS 2, 3, 4: Enviar respuesta de pregunta
   */
  const handleQuestionSubmit = async (questionNumber, answer) => {
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
      return;
    }

    // Mostrar loading (esperando al admin)
    setIsLoading(true);
  };

  /**
   * Cerrar popup de error y limpiar respuesta
   */
  const handleErrorClose = () => {
    setShowError(false);
    setErrorMessage('');
    // Usuario puede volver a intentar
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

    // Mostrar loading (admin decide: agradecimiento o reiniciar)
    setIsLoading(true);
  };

  /**
   * RENDERIZAR COMPONENTE SEGÚN PASO ACTUAL
   */
  const renderCurrentStep = () => {
    // Por ahora solo mostramos mensajes simples
    // En el siguiente paso crearemos los componentes reales
    
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

export default UserFlow;
