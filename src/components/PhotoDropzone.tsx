import { useCallback, useRef, useState } from 'react'
import { api } from '../api'
import { MAX_UPLOAD_BYTES, describeSize, shrinkImage } from '../images'

interface Props {
  urls: string[]
  onChange: (urls: string[]) => void
}

export function PhotoDropzone({ urls, onChange }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    async (files: File[]) => {
      setError('')
      const picked = files.filter((f) => f.type.startsWith('image/'))
      if (picked.length === 0) {
        if (files.length > 0) setError('Those need to be photos — JPG, PNG or HEIC.')
        return
      }
      setUploading(true)
      try {
        // phone photos are far too big to send as-is, so shrink first
        const prepared = await Promise.all(picked.map(shrinkImage))
        const tooBig = prepared.filter((f) => f.size > MAX_UPLOAD_BYTES)
        const sendable = prepared.filter((f) => f.size <= MAX_UPLOAD_BYTES)

        if (sendable.length > 0) {
          const { urls: newUrls } = await api.uploadPhotos(sendable)
          onChange([...urls, ...newUrls])
        }
        if (tooBig.length > 0) {
          setError(
            `${tooBig.length === 1 ? 'That photo is' : `${tooBig.length} photos are`} still too big to upload (${tooBig
              .map((f) => describeSize(f.size))
              .join(', ')}). Try a screenshot of it instead.`
          )
        }
      } catch (err) {
        // this used to fail silently — the spinner stopped and nothing appeared
        setError(`Couldn't upload that photo — ${err instanceof Error ? err.message : String(err)}`)
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
      {error && <p className="form-error upload-error">{error}</p>}
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
