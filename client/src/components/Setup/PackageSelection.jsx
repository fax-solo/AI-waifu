import React from 'react';

const PACKAGES = [
  {
    id: 'python-env-cpu',
    name: 'Local AI Engine (CPU)',
    description: 'Installs the Python environment and ONNX Runtime tailored for CPU execution.',
    size: '180 MB',
    sizeBytes: 180 * 1024 * 1024,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
        <rect x="9" y="9" width="6" height="6"></rect>
        <line x1="9" y1="1" x2="9" y2="4"></line>
        <line x1="15" y1="1" x2="15" y2="4"></line>
        <line x1="9" y1="20" x2="9" y2="23"></line>
        <line x1="15" y1="20" x2="15" y2="23"></line>
        <line x1="20" y1="9" x2="23" y2="9"></line>
        <line x1="20" y1="14" x2="23" y2="14"></line>
        <line x1="1" y1="9" x2="4" y2="9"></line>
        <line x1="1" y1="14" x2="4" y2="14"></line>
      </svg>
    ),
    required: false,
    exclusiveGroup: 'engine'
  },
  {
    id: 'python-env-gpu',
    name: 'Local AI Engine (NVIDIA GPU)',
    description: 'Installs the Python environment and CUDA-enabled ONNX Runtime for fast execution on NVIDIA GPUs.',
    size: '250 MB',
    sizeBytes: 250 * 1024 * 1024,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
        <path d="M6 8h4v8H6z"></path>
        <path d="M14 8h4v8h-4z"></path>
      </svg>
    ),
    required: false,
    exclusiveGroup: 'engine'
  },
  {
    id: 'python-env-amd',
    name: 'Local AI Engine (AMD / Vulkan)',
    description: 'Installs the Python environment with ROCm/DirectML support for hardware acceleration on AMD GPUs.',
    size: '220 MB',
    sizeBytes: 220 * 1024 * 1024,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
        <polyline points="2 17 12 22 22 17"></polyline>
        <polyline points="2 12 12 17 22 12"></polyline>
      </svg>
    ),
    required: false,
    exclusiveGroup: 'engine'
  },
  {
    id: 'tts-model',
    name: 'Kokoro ONNX Engine',
    description: 'The core neural network model for the local Text-to-Speech system.',
    size: '310 MB',
    sizeBytes: 310 * 1024 * 1024,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    required: true,
  },
  {
    id: 'tts-voices',
    name: 'Voice Pack (v1.0)',
    description: 'Binary voice definitions and latent weights for the Kokoro TTS engine.',
    size: '27 MB',
    sizeBytes: 27 * 1024 * 1024,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    ),
    required: true,
  }
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function PackageSelection({ onNext, onPackagesSelected, systemInfo }) {
  const gpuName = systemInfo?.gpuInfo?.hasNvidia ? systemInfo.gpuInfo.name : null;
  const isAmd = systemInfo?.gpuInfo?.name?.toLowerCase().includes('amd') || systemInfo?.gpuInfo?.name?.toLowerCase().includes('radeon');
  
  const initialSelection = gpuName 
    ? ['python-env-gpu', 'tts-model', 'tts-voices'] 
    : isAmd
      ? ['python-env-amd', 'tts-model', 'tts-voices']
      : ['python-env-cpu', 'tts-model', 'tts-voices'];
  
  const [selectedIds, setSelectedIds] = React.useState(new Set(initialSelection));

  // Update dynamic package names
  const updatedPackages = PACKAGES.map(pkg => {
    if (pkg.id === 'python-env-gpu' && gpuName) {
      return { ...pkg, name: `Local AI Engine (${gpuName})` };
    }
    if (pkg.id === 'python-env-amd' && isAmd) {
      return { ...pkg, name: `Local AI Engine (${systemInfo.gpuInfo.name})` };
    }
    return pkg;
  });

  const togglePackage = (pkg) => {
    if (pkg.required) return;
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(pkg.id)) {
        // Don't allow unselecting if it's the last in its exclusive group
        if (pkg.exclusiveGroup) {
          const groupCount = updatedPackages.filter(p => p.exclusiveGroup === pkg.exclusiveGroup && next.has(p.id)).length;
          if (groupCount <= 1) return next; // Must have at least one engine
        }
        next.delete(pkg.id);
      } else {
        // Deselect others in the same exclusive group
        if (pkg.exclusiveGroup) {
          updatedPackages.forEach(p => {
            if (p.exclusiveGroup === pkg.exclusiveGroup && p.id !== pkg.id) {
              next.delete(p.id);
            }
          });
        }
        next.add(pkg.id);
      }
      return next;
    });
  };

  const totalBytes = updatedPackages
    .filter(p => selectedIds.has(p.id))
    .reduce((acc, p) => acc + p.sizeBytes, 0);

  const handleNextClick = () => {
    const selectedPackages = updatedPackages.filter(p => selectedIds.has(p.id));
    onPackagesSelected(selectedPackages);
    onNext();
  };

  const handleSelectAllRequired = () => {
    const requiredIds = updatedPackages.filter(p => p.required).map(p => p.id);
    // Determine the best engine to select based on system info
    let bestEngine = 'python-env-cpu';
    if (gpuName) bestEngine = 'python-env-gpu';
    else if (isAmd) bestEngine = 'python-env-amd';
    
    setSelectedIds(new Set([...requiredIds, bestEngine]));
  };

  return (
    <div className="setup-screen">
      <div className="package-grid">
        {updatedPackages.map(pkg => {
          const isSelected = selectedIds.has(pkg.id);
          return (
            <div 
              key={pkg.id} 
              className={`package-card ${isSelected ? 'selected' : ''}`}
              onClick={() => togglePackage(pkg)}
              style={{ cursor: pkg.required ? 'default' : 'pointer' }}
            >
              <div className="package-card-header">
                <div className="package-icon">{pkg.icon}</div>
                <span className="package-size">{pkg.size}</span>
              </div>
              <h3>{pkg.name} {pkg.required && <span style={{fontSize: '0.75rem', color: 'var(--setup-text-muted)', fontWeight: 'normal'}}>(Required)</span>}</h3>
              <p>{pkg.description}</p>

              <div className="checkbox-indicator">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      <div className="setup-footer">
        <div className="total-size">
          Total Installation Size: <strong>{formatBytes(totalBytes)}</strong>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn-secondary" 
            onClick={handleSelectAllRequired}
            style={{ padding: '0.75rem 1.5rem' }}
          >
            Select All Required
          </button>
          <button 
            className="btn-primary" 
            onClick={handleNextClick}
            disabled={selectedIds.size === 0}
          >
            Next Step
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
