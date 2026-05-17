import { BrowserRouter, Routes, Route } from "react-router-dom";
import SmoothScroll from "./components/SmoothScroll";
import HomePage from "./pages/HomePage";
import DownloadPage from "./pages/DownloadPage";
import "./index.css";

function App() {
  return (
    <SmoothScroll>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/descargar" element={<DownloadPage />} />
        </Routes>
      </BrowserRouter>
    </SmoothScroll>
  );
}

export default App;
