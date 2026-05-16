import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import DownloadPage from "./pages/DownloadPage";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/descargar" element={<DownloadPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
