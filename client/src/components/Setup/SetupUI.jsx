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
      <div className={`setup-slider screen-${screen} ${isReady ? 'is-ready' : 'is-mounting'}`}>
        <PackageSelection 
          onPackagesSelected={handlePackagesSelected} 
          onNext={goToInstall} 
          systemInfo={systemInfo}
        />
        <InstallProgress 
          packages={selectedPackages} 
          isActive={screen === 2}
          onComplete={onComplete}
        />
      </div>
    </div>
  );
}
