import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Merge from './pages/Merge';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/merge-pdfs" replace />} />
        <Route path="/merge-pdfs" element={<Merge />} />
      </Routes>
    </Router>
  );
}