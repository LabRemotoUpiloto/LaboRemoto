import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import HeroSection from "../components/sections/home/HeroSection";
import Features from "../components/sections/home/Features";
import HowItWorks from "../components/sections/home/HowItWorks";
import BentoGrid from "../components/sections/home/BentoGrid";
import CtaSection from "../components/sections/home/CtaSection";

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
