import { ComposePanel } from './components/ComposePanel';
import { ExamplesSection } from './components/ExamplesSection';
import { ExportPanel } from './components/ExportPanel';
import { FidelityPanel } from './components/FidelityPanel';
import { Footer } from './components/Footer';
import { FormatPanel } from './components/FormatPanel';
import { GenerateButton } from './components/GenerateButton';
import { HelpDrawer } from './components/HelpDrawer';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { Notices } from './components/Notices';
import { OutputPanel } from './components/OutputPanel';
import { PromptInspector } from './components/PromptInspector';
import { ReferencePanel } from './components/ReferencePanel';
import { StyleAnalysisPanel } from './components/StyleAnalysisPanel';
import { TopNav } from './components/TopNav';
import { useCapabilities, useFontWarmup } from './state/hooks';
import { useLivePreview } from './state/useLivePreview';

export default function App() {
  useCapabilities();
  useFontWarmup();
  useLivePreview();

  return (
    <div className="ga-shell">
      <a className="ga-skip-link" href="#studio">
        Skip to the studio
      </a>

      <TopNav />

      <main>
        <Hero />

        <div className="ga-studio" id="studio">
          <div className="ga-studio__grid">
            <div className="ga-column">
              <ReferencePanel />
              <StyleAnalysisPanel />
            </div>

            <div className="ga-column">
              <ComposePanel />
              <FormatPanel />
            </div>

            <div className="ga-column ga-column--output">
              <OutputPanel />
              <ExportPanel />
              <FidelityPanel />
              <PromptInspector />
            </div>
          </div>
        </div>

        <ExamplesSection />
        <HowItWorks />
      </main>

      <Footer />

      <div className="ga-sticky-bar">
        <GenerateButton compact />
      </div>

      <HelpDrawer />
      <Notices />
    </div>
  );
}
