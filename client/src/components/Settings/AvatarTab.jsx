import { Image, Plus, Download, Upload, RefreshCw, User, Camera, Trash2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import * as api from '../../utils/api.js';

export default function AvatarTab({
  avatars, loadAvatars, currentVRMName, handleSelectAvatar, handleDeleteAvatar,
  showUploadForm, setShowUploadForm, uploadForm, setUploadForm, isUploading, handleUploadAvatar,
  showGallery, setShowGallery, galleryAvatars, downloadingGalleryId, handleDownloadGalleryAvatar,
  loadGalleryAvatars, fileInputRef, pfpInputRef,
  textureInputRef, showGalleryUpload, setShowGalleryUpload, galleryUploadForm, setGalleryUploadForm,
  isGalleryUploading, handleUploadGalleryModel,
  galleryModelInputRef, galleryTextureInputRef, galleryPfpInputRef,
}) {
  const { t } = useLanguage();

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Image size={18} className="icon" />
        {t('settings.avatar.title')}
        <div className="settings-title-actions">
          <button className="btn btn-secondary btn-small"
            onClick={() => { setShowGallery(false); setShowGalleryUpload(false); setShowUploadForm(!showUploadForm); }}>
            {showUploadForm ? 'Cancel' : <><Plus size={14} /> Add New</>}
          </button>
          <button className="btn btn-secondary btn-small"
            onClick={() => { setShowUploadForm(false); setShowGalleryUpload(false); setShowGallery(!showGallery); }}>
            {showGallery ? 'Cancel' : <><Download size={14} /> Gallery</>}
          </button>
          <button className="btn btn-secondary btn-small"
            onClick={() => { setShowUploadForm(false); setShowGallery(false); setShowGalleryUpload(!showGalleryUpload); }}>
            {showGalleryUpload ? 'Cancel' : <><Upload size={14} /> Upload</>}
          </button>
        </div>
      </div>

      {showUploadForm && (
        <div className="settings-upload-form">
          <div className="settings-upload-body">
            <div className="settings-pfp-upload" onClick={() => pfpInputRef.current?.click()}>
              {uploadForm.pfpPreview ? (
                <img src={uploadForm.pfpPreview} alt="Preview" />
              ) : (
                <>
                  <Camera size={20} style={{ color: 'var(--color-text-muted)', marginBottom: 4 }} />
                  <span className="settings-pfp-upload-hint">Icon</span>
                </>
              )}
              <input ref={pfpInputRef} type="file" accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadForm({ ...uploadForm, pfpFile: file, pfpPreview: URL.createObjectURL(file) });
                }} style={{ display: 'none' }} />
            </div>
            <div className="settings-upload-fields">
              <div className="form-group">
                <label>{t('settings.avatar.companionName')}</label>
                <input type="text" value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                  placeholder="e.g. Aria" />
              </div>
              <div className="form-group">
                <label>{t('settings.avatar.vrmModelFile')}</label>
                <button className="btn btn-secondary btn-full"
                  onClick={() => fileInputRef.current?.click()}>
                  {uploadForm.vrmFile ? uploadForm.vrmFile.name : 'Select .vrm / .glb File'}
                </button>
                <input ref={fileInputRef} type="file" accept=".vrm,.glb"
                  onChange={(e) => setUploadForm({ ...uploadForm, vrmFile: e.target.files?.[0] })}
                  style={{ display: 'none' }} />
              </div>
              <div className="form-group">
                <label>Textures (optional)</label>
                <button className="btn btn-secondary btn-full"
                  onClick={() => textureInputRef.current?.click()}>
                  {uploadForm.textureFiles?.length > 0
                    ? `${uploadForm.textureFiles.length} texture(s) selected`
                    : 'Select Texture Files'}
                </button>
                <input ref={textureInputRef} type="file" accept="image/*" multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setUploadForm({ ...uploadForm, textureFiles: files });
                  }} style={{ display: 'none' }} />
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-full"
            onClick={handleUploadAvatar}
            disabled={isUploading || !uploadForm.vrmFile || !uploadForm.name}>
            {isUploading ? 'Uploading...' : t('settings.avatar.saveToLibrary')}
          </button>
        </div>
      )}

      {showGalleryUpload && (
        <div className="settings-upload-form">
          <div className="settings-upload-body">
            <div className="settings-pfp-upload" onClick={() => galleryPfpInputRef.current?.click()}>
              {galleryUploadForm.pfpPreview ? (
                <img src={galleryUploadForm.pfpPreview} alt="Preview" />
              ) : (
                <>
                  <Camera size={20} style={{ color: 'var(--color-text-muted)', marginBottom: 4 }} />
                  <span className="settings-pfp-upload-hint">Icon</span>
                </>
              )}
              <input ref={galleryPfpInputRef} type="file" accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setGalleryUploadForm({ ...galleryUploadForm, pfpFile: file, pfpPreview: URL.createObjectURL(file) });
                }} style={{ display: 'none' }} />
            </div>
            <div className="settings-upload-fields">
              <div className="form-group">
                <label>Model Name</label>
                <input type="text" value={galleryUploadForm.name}
                  onChange={(e) => setGalleryUploadForm({ ...galleryUploadForm, name: e.target.value })}
                  placeholder="e.g. My Character" />
              </div>
              <div className="form-group">
                <label>Model File (.vrm / .glb)</label>
                <button className="btn btn-secondary btn-full"
                  onClick={() => galleryModelInputRef.current?.click()}>
                  {galleryUploadForm.modelFile ? galleryUploadForm.modelFile.name : 'Select Model File'}
                </button>
                <input ref={galleryModelInputRef} type="file" accept=".vrm,.glb"
                  onChange={(e) => setGalleryUploadForm({ ...galleryUploadForm, modelFile: e.target.files?.[0] })}
                  style={{ display: 'none' }} />
              </div>
              <div className="form-group">
                <label>Textures (optional)</label>
                <button className="btn btn-secondary btn-full"
                  onClick={() => galleryTextureInputRef.current?.click()}>
                  {galleryUploadForm.textureFiles?.length > 0
                    ? `${galleryUploadForm.textureFiles.length} texture(s) selected`
                    : 'Select Texture Files'}
                </button>
                <input ref={galleryTextureInputRef} type="file" accept="image/*" multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setGalleryUploadForm({ ...galleryUploadForm, textureFiles: files });
                  }} style={{ display: 'none' }} />
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-full"
            onClick={handleUploadGalleryModel}
            disabled={isGalleryUploading || !galleryUploadForm.modelFile || !galleryUploadForm.name}>
            {isGalleryUploading ? 'Uploading...' : 'Upload to Gallery'}
          </button>
        </div>
      )}

      {showGallery ? (
        <div className="settings-avatar-grid">
          <div className="gallery-header">
            <button className="btn btn-secondary btn-small" onClick={loadGalleryAvatars}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {galleryAvatars.length === 0 ? (
            <div className="settings-empty">
              <Download size={32} className="settings-empty-icon" />
              <p>No gallery models available.<br/>Upload models or add files to server/data/gallery/ and refresh.</p>
            </div>
          ) : (
            galleryAvatars.map((model) => {
              const alreadyOwned = avatars.some(a => a.name === model.name);
              return (
                <div key={model.id} className="settings-avatar-card">
                  <div className="settings-avatar-pfp">
                    {model.pfp_path ? (
                      <img src={api.getUploadUrl(model.pfp_path)} alt={model.name} />
                    ) : (
                      <Download size={24} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                  <span className="settings-avatar-name">{model.name}</span>
                  {alreadyOwned ? (
                    <span className="owned-badge">Owned ✓</span>
                  ) : (
                    <button className="btn btn-secondary btn-small btn-full"
                      onClick={() => handleDownloadGalleryAvatar(model)}
                      disabled={downloadingGalleryId === model.id}>
                      {downloadingGalleryId === model.id ? 'Downloading...' : 'Download'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="settings-avatar-grid">
          {avatars.length === 0 ? (
            <div className="settings-empty">
              <Image size={32} className="settings-empty-icon" />
              <p>{t('settings.avatar.emptyLibrary')}</p>
            </div>
          ) : (
            avatars.map((avatar) => (
              <div key={avatar.id}
                className={`settings-avatar-card ${currentVRMName === avatar.name ? 'active' : ''}`}
                onClick={() => handleSelectAvatar(avatar)}>
                <div className="settings-avatar-pfp">
                  {avatar.pfp_path ? (
                    <img src={api.getUploadUrl(avatar.pfp_path)} alt={avatar.name} />
                  ) : (
                    <User size={30} style={{ opacity: 0.3 }} />
                  )}
                </div>
                <span className="settings-avatar-name">{avatar.name}</span>
                <button className="settings-avatar-delete"
                  onClick={(e) => handleDeleteAvatar(avatar.id, e)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="hint" style={{ marginTop: 16 }}>
        {showGallery
          ? 'Browse and download models from the gallery. Downloaded models appear in your library.'
          : showUploadForm
            ? 'Upload your own VRM/GLB model files to build a personal library. Include textures if your model uses external texture files.'
            : showGalleryUpload
              ? 'Upload a VRM/GLB model with its texture files to the shared gallery.'
              : t('settings.avatar.hint')}
      </div>
    </div>
  );
}
