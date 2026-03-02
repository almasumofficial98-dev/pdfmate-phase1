import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Merge from './pages/Merge';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Automatically sends users from "/" to "/merge-pdfs" */}
        <Route path="/" element={<Navigate to="/merge-pdfs" replace />} />
        
        {/* Your PDF tool now officially lives on this path */}
        <Route path="/merge-pdfs" element={<Merge />} />
      </Routes>
    </Router>
  );
}