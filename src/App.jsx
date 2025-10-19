import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import UserFlow from './components/UserFlow';
import AdminApp from './components/admin/AdminApp';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserFlow />} />
        <Route path="/admin" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
