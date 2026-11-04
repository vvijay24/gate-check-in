import { useEffect, useRef, useState } from 'react'
import * as ui from '../ui'
import { Icon } from '../icons'

// Photos are stored as data URLs in localStorage, so keep them small.
const MAX_SIZE = 1024
const JPEG_QUALITY = 0.7

function shrink(source, width, height) {
  const scale = Math.min(1, MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(shrink(img, img.naturalWidth, img.naturalHeight))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}

const btn = ui.btnSmall

export default function OdometerPhoto({ value, onChange, required, error: requiredError }) {
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [error, setError] = useState('')

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  useEffect(() => stopCamera, [])

  const startCamera = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      // No live camera API (e.g. non-HTTPS); the file picker still offers the camera on phones.
      fileRef.current?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch {
      setError('Camera unavailable or permission denied. Use "Upload Photo" instead.')
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    onChange(shrink(video, video.videoWidth, video.videoHeight))
    stopCamera()
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      onChange(await fileToDataUrl(file))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={ui.label}>
        Odometer Photo
        {required && <span className={ui.required}>*</span>}
      </span>

      <div
        className={
          'flex min-h-48 items-center justify-center overflow-hidden rounded-2xl border-[1.5px] border-dashed bg-field ' +
          (requiredError ? 'border-danger' : 'border-line')
        }
      >
        {cameraOn ? (
          <video ref={videoRef} autoPlay playsInline muted className="max-h-80 w-full bg-black object-contain" />
        ) : value ? (
          <img src={value} alt="Truck odometer" className="max-h-80 w-full object-contain" />
        ) : (
          <div className="p-6 text-center text-muted">
            <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-panel text-signal shadow-card">
              <Icon name="photo" size={28} />
            </span>
            No photo yet. Take or upload a clear picture of the odometer reading.
          </div>
        )}
      </div>

      {(error || requiredError) && <p className={ui.errorText}>{error || requiredError}</p>}

      <div className="no-print flex flex-wrap gap-2">
        {cameraOn ? (
          <>
            <button type="button" onClick={capture} className={ui.btnSmallPrimary}>
              Capture
            </button>
            <button type="button" onClick={stopCamera} className={btn}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button id="field-odometerPhoto" type="button" onClick={startCamera} className={btn}>
              <Icon name="photo" />
              {value ? 'Retake Photo' : 'Take Photo'}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
              Upload Photo
            </button>
            {value && (
              <button type="button" onClick={() => onChange('')} className="min-h-11 cursor-pointer px-2 text-[15px] text-danger underline">
                Remove
              </button>
            )}
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
      </div>
    </div>
  )
}
