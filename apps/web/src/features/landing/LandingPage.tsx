import { LandingNav } from "./sections/LandingNav";
import { Hero } from "./sections/Hero";
import { StakesBand } from "./sections/StakesBand";
import { AuditTrailScene } from "./three/AuditTrailScene";
import { SealScene } from "./three/SealScene";
import { VerificationFlow } from "./sections/VerificationFlow";
import { CapabilityBento } from "./sections/CapabilityBento";
import { UnderTheHood } from "./sections/UnderTheHood";
import { CloseCta, LandingFooter } from "./sections/CloseCta";

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />
      <main>
        <Hero />
        <StakesBand />
        <div id="audit-trail">
          <AuditTrailScene />
        </div>
        <VerificationFlow />
        <SealScene />
        <CapabilityBento />
        <UnderTheHood />
        <CloseCta />
      </main>
      <LandingFooter />
    </div>
  );
}
