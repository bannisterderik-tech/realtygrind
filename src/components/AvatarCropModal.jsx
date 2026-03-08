import { useState, useEffect, useRef } from 'react'

export default function AvatarCropModal({ src, onConfirm, onCancel, title='Crop Photo', round=true }) {
  const OUTPUT_SIZE = 256
  const CROP_SIZE  = 260
  const canvasRef    = useRef(null)
  const imgRef       = useRef(null)
  const dragRef      = useRef({ active:false, sx:0, sy:0, ox:0, oy:0 })
  const pinchRef     = useRef({ active:false, dist:0, sc:1 })

  const [imgLoaded,  setImgLoaded]  = useState(false)
  const [processing, setProcessing] = useState(false)
  const [offset,     setOffset]     = useState({ x:0, y:0 })
  const [scale,      setScale]      = useState(1)
  const [baseScale,  setBaseScale]  = useState(1)

  // Load image and compute initial scale/position
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const fit = CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight)
      setBaseScale(fit)
      setScale(fit)
      setOffset({ x:(CROP_SIZE - img.naturalWidth*fit)/2, y:(CROP_SIZE - img.naturalHeight*fit)/2 })
      setImgLoaded(true)
    }
    img.src = src
  }, [src])

  // Clamp offset so image can't be dragged away from crop area
  function clampOffset(ox, oy, sc) {
    const img = imgRef.current
    if (!img) return { x:ox, y:oy }
    const iw = img.naturalWidth * sc, ih = img.naturalHeight * sc
    const cx = Math.min(0, Math.max(CROP_SIZE - iw, ox))
    const cy = Math.min(0, Math.max(CROP_SIZE - ih, oy))
    return { x:cx, y:cy }
  }

  // ── Pointer drag ──
  function onPointerDown(e) {
    if (e.pointerType === 'touch' && pinchRef.current.active) return
    e.preventDefault()
    dragRef.current = { active:true, sx:e.clientX, sy:e.clientY, ox:offset.x, oy:offset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e) {
    if (!dragRef.current.active) return
    const nx = dragRef.current.ox + (e.clientX - dragRef.current.sx)
    const ny = dragRef.current.oy + (e.clientY - dragRef.current.sy)
    setOffset(clampOffset(nx, ny, scale))
  }
  function onPointerUp() { dragRef.current.active = false }

  // ── Scroll wheel zoom ──
  function onWheel(e) {
    e.preventDefault()
    const d = e.deltaY > 0 ? -0.04 : 0.04
    setScale(s => {
      const ns = Math.max(baseScale*0.5, Math.min(baseScale*4, s + d))
      setOffset(prev => clampOffset(prev.x, prev.y, ns))
      return ns
    })
  }

  // ── Pinch zoom ──
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault()
      const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY)
      pinchRef.current = { active:true, dist:d, sc:scale }
    }
  }
  function onTouchMove(e) {
    if (!pinchRef.current.active || e.touches.length !== 2) return
    e.preventDefault()
    const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY)
    const ns = Math.max(baseScale*0.5, Math.min(baseScale*4, pinchRef.current.sc * (d/pinchRef.current.dist)))
    setScale(ns)
    setOffset(prev => clampOffset(prev.x, prev.y, ns))
  }
  function onTouchEnd(e) { if (e.touches.length < 2) pinchRef.current.active = false }

  // ── Slider zoom ──
  function onSlider(e) {
    const ns = parseFloat(e.target.value)
    setScale(ns)
    setOffset(prev => clampOffset(prev.x, prev.y, ns))
  }

  // ── Crop & export as base64 data URL ──
  function handleConfirm() {
    const img = imgRef.current; if (!img) return
    setProcessing(true)
    const canvas = canvasRef.current
    canvas.width = OUTPUT_SIZE; canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    const sx = -offset.x / scale, sy = -offset.y / scale
    const sw = CROP_SIZE / scale, sh = CROP_SIZE / scale
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    onConfirm(dataUrl)
    setProcessing(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.75)',
      backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center',
      padding:20, animation:'fadeIn .15s ease' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="card" style={{ padding:28, maxWidth:400, width:'100%',
        display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}
        onClick={e => e.stopPropagation()}>

        <div className="serif" style={{ fontSize:20, color:'var(--text)', fontWeight:600 }}>
          {title}
        </div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>
          Drag to reposition · Scroll or slide to zoom
        </div>

        {/* Crop viewport */}
        <div style={{ width:CROP_SIZE, height:CROP_SIZE, borderRadius:round?'50%':'14px', overflow:'hidden',
          position:'relative', cursor:dragRef.current.active?'grabbing':'grab',
          border:'3px solid var(--b3)', background:'var(--bg2)', touchAction:'none',
          boxShadow:'0 0 0 9999px rgba(0,0,0,.35)' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          {imgLoaded && imgRef.current && (
            <img src={src} alt="" draggable={false} style={{
              position:'absolute', left:offset.x, top:offset.y,
              width:imgRef.current.naturalWidth*scale, height:imgRef.current.naturalHeight*scale,
              pointerEvents:'none', userSelect:'none',
            }}/>
          )}
          {!imgLoaded && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
              justifyContent:'center', color:'var(--muted)', fontSize:12 }}>Loading…</div>
          )}
        </div>

        {/* Zoom slider */}
        <div style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'0 12px' }}>
          <span style={{ fontSize:16, color:'var(--muted)', lineHeight:1 }}>−</span>
          <input type="range" className="crop-zoom" value={scale}
            min={baseScale*0.5} max={baseScale*4} step={0.001}
            onChange={onSlider} style={{ flex:1 }}/>
          <span style={{ fontSize:16, color:'var(--muted)', lineHeight:1 }}>+</span>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10, width:'100%' }}>
          <button className="btn-outline" onClick={onCancel} style={{ flex:1 }}>Cancel</button>
          <button className="btn-gold" onClick={handleConfirm}
            disabled={!imgLoaded||processing} style={{ flex:1 }}>
            {processing ? 'Saving…' : 'Save'}
          </button>
        </div>

        <canvas ref={canvasRef} style={{ display:'none' }}/>
      </div>
    </div>
  )
}
