import React, { useState } from 'react';
import './Setup.css';
import PackageSelection from './PackageSelection';
import InstallProgress from './InstallProgress';

export default function SetupUI({ onComplete, systemInfo }) {
  const [screen, setScreen] = useState(1);
  const [selectedPackages, setSelectedPackages] = useState([]);
  const [isReady, setIsReady] = useState(false);

  React.useEffect(() => {
    // Ensure we start at screen 1 and stay there until the component is fully stable
    setScreen(1);
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handlePackagesSelected = (packages) => {
    setSelectedPackages(packages);
  };

  const goToInstall = () => {
    if (!isReady) return;
    setScreen(2);
  };

  return (
    <div className="setup-container">
      <div className="setup-header">
        <div className="setup-header-left">
          <h1>
            {screen === 1 ? 'Component Selection' : 'Installation'}
          </h1>
          <p className="setup-header-subtitle">
            {screen === 1 
              ? 'Select components to download and configure local services' 
              : 'Downloading and configuring local AI companions'}
          </p>
        </div>
        <div className="step-progress-indicator">
          <div className={`step-dot ${screen >= 1 ? 'active' : ''} ${screen > 1 ? 'completed' : ''}`}>
            {screen > 1 ? '✓' : '1'}
          </div>
          <div className="step-line-connector">
            <div className="step-line-fill" style={{ width: screen >= 2 ? '100%' : '0%' }}></div>
          </div>
          <div className={`step-dot ${screen >= 2 ? 'active' : ''}`}>
            2
          </div>
        </div>
      </div>

      <div className="setup-content-area">
        {screen === 1 && (
          <PackageSelection 
            onPackagesSelected={handlePackagesSelected} 
            onNext={goToInstall} 
            systemInfo={systemInfo}
          />
        )}
        {screen === 2 && (
          <InstallProgress 
            packages={selectedPackages} 
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  );
}
