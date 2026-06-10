import { useState, memo } from 'react';
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

const ImageResults = memo(function ImageResults({ images, searchQuery, onClear }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  if (!images || images.length === 0) return null;

  const openLightbox = (index) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const prevImage = () => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  const nextImage = () => setLightboxIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));

  return (
    <div className="image-results">
      <div className="image-results-header">
        <span className="image-results-label">
          {searchQuery ? `Results for "${searchQuery}"` : 'Images'}
        </span>
        <button className="image-results-close" onClick={onClear} title="Dismiss images" aria-label="Dismiss images">
          <X size={14} />
        </button>
      </div>
      <div className="image-results-grid">
        {images.map((img, i) => (
          <button
            key={i}
            className="image-results-thumb"
            onClick={() => openLightbox(i)}
            title={img.title || ''}
          >
            <img
              src={img.thumbnail || img.url}
              alt={img.title || `Image ${i + 1}`}
              loading="lazy"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div className="image-lightbox-overlay" onClick={closeLightbox}>
          <div className="image-lightbox" onClick={(e) => e.stopPropagation()}>
            <button className="image-lightbox-close" onClick={closeLightbox} aria-label="Close">
              <X size={20} />
            </button>
            <button className="image-lightbox-nav prev" onClick={prevImage} aria-label="Previous">
              <ChevronLeft size={24} />
            </button>
            <div className="image-lightbox-content">
              <img
                src={images[lightboxIndex].url}
                alt={images[lightboxIndex].title || ''}
              />
              <div className="image-lightbox-info">
                <span>{images[lightboxIndex].title || ''}</span>
                <a
                  href={images[lightboxIndex].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="image-lightbox-open"
                >
                  <ExternalLink size={14} /> Open
                </a>
              </div>
            </div>
            <button className="image-lightbox-nav next" onClick={nextImage} aria-label="Next">
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default ImageResults;
