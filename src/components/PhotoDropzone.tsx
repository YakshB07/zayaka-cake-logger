import { useCallback, useRef, useState } from 'react'
import { api } from '../api'

interface Props {
  urls: string[]
  onChange: (urls: string[]) => void
}

export function PhotoDropzone({ urls, onChange }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) return
      setUploading(true)
      try {
        const { urls: newUrls } = await api.uploadPhotos(images)
        onChange([...urls, ...newUrls])
      } finally {
        setUploading(false)
      }
    },
    [urls, onChange]
  )

  return (
    <div>
      <div
        className={`dropzone ${dragOver ? 'dropzone-over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Upload design photos"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void addFiles(Array.from(e.dataTransfer.files))
        }}
      >
        <span className="dropzone-icon" aria-hidden="true">
          +
        </span>
        <span>{uploading ? 'Uploading…' : 'Drop design photos here, or tap to choose'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>
      {urls.length > 0 && (
        <div className="thumbs">
          {urls.map((u) => (
            <div key={u} className="thumb">
              <img src={u} alt="Cake design reference" />
              <button
                type="button"
                className="thumb-x"
                aria-label="Remove photo"
                onClick={() => onChange(urls.filter((x) => x !== u))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
