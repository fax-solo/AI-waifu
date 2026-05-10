import React, { useState } from 'react';
import './Setup.css';
import PackageSelection from './PackageSelection';
import InstallProgress from './InstallProgress';

export default function SetupUI({ onComplete, systemInfo }) {
  const [screen, setScreen] = useState(1);
  const [selectedPackages, setSelectedPackages] = useState([]);

  const handlePackagesSelected = (packages) => {
    setSelectedPackages(packages);
  };

  const goToInstall = () => {
    setScreen(2);
  };

  return (
    <div className="setup-container">
      <div className={`setup-slider screen-${screen}`}>
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
