import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import HeroSection from "../components/sections/HeroSection";
import Features from "../components/sections/Features";
import HowItWorks from "../components/sections/HowItWorks";
import BentoGrid from "../components/sections/BentoGrid";
import CtaSection from "../components/sections/CtaSection";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 bg-black">
        <HeroSection />
        <Features />
        <HowItWorks />
        <BentoGrid />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
