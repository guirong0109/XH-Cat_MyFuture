// The landing page's opening: a 3D ATM prints the ATM story (the page's question section) on a receipt; the receipt
// tears off, flips upright and flies to the middle of the screen, and waits there until the user moves on.
// Timing, paper curl and receipt text: timeline.js.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { INTRO_LENGTH, curlPoint, ease, introAt, receiptLines } from './timeline.js'

const PAPER_W = 0.62
const CURL_R = 0.16
const PX = 1000 // receipt canvas pixels per scene unit
const SLOT = { y: 1.5, z: 0.62 }
const LOOK = new THREE.Vector3(0, 1.62, 0.4)
const CAMERA_OFFSET = new THREE.Vector3(2.5, 0.85, 7.1)
const MONO = '"Geist Mono", ui-monospace, Consolas, monospace'
const SERIF = '"Instrument Serif", "Noto Serif SC", "Songti SC", Georgia, serif'

const cssColor = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
const clamp01 = (k) => Math.min(1, Math.max(0, k))

// The page fonts are drawn into canvases, so wait for them (but never long: offline, system fonts are fine).
async function fontsReady() {
  const wanted = [`500 24px ${MONO}`, `600 24px ${MONO}`, `400 64px ${SERIF}`]
  const loads = Promise.all(wanted.map((font) => document.fonts?.load(font))).catch(() => {})
  await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 1500))])
}

// Words for wrapping; Chinese has no spaces, so it wraps by character.
const tokens = (text) => (/\s/.test(text) ? text.split(/(?<=\s)/) : [...text])

function wrap(g, text, width) {
  const lines = [[]]
  for (const token of tokens(text)) {
    const line = lines.at(-1)
    if (line.length && g.measureText([...line, token].join('').trimEnd()).width > width) lines.push([token.trimStart()])
    else line.push(token)
  }
  return lines
}

function grain(g, w, h, amount) {
  const image = g.getImageData(0, 0, w, h)
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount
    image.data[i] += n
    image.data[i + 1] += n
    image.data[i + 2] += n
  }
  g.putImageData(image, 0, 0)
}

// The receipt is as long as its text (which differs by language): drawn once to measure, then at that length.
function receiptTexture(t, ink, pink) {
  const end = drawReceipt(t, ink, pink, 1600).end
  const { canvas } = drawReceipt(t, ink, pink, Math.ceil(end + 230))
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return { texture, length: canvas.height / PX }
}

function drawReceipt(t, ink, pink, H) {
  const canvas = document.createElement('canvas')
  const W = (canvas.width = PAPER_W * PX)
  canvas.height = H
  const g = canvas.getContext('2d')
  const pad = 44
  const inner = W - 2 * pad
  g.fillStyle = '#fbf8f0'
  g.fillRect(0, 0, W, H)
  grain(g, W, H, 12)
  let y = 74
  const rule = () => {
    g.save()
    g.setLineDash([6, 8])
    g.strokeStyle = 'rgba(30,26,20,.42)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(pad, y - 10)
    g.lineTo(W - pad, y - 10)
    g.stroke()
    g.restore()
    y += 28
  }
  for (const line of receiptLines(t)) {
    g.fillStyle = ink
    g.textAlign = 'left'
    if (line.kind === 'brand') {
      g.font = `600 34px ${MONO}`
      g.textAlign = 'center'
      g.fillText(line.text, W / 2, y)
      y += 46
    } else if (line.kind === 'text') {
      g.font = `500 22px ${MONO}`
      for (const words of wrap(g, line.text, inner)) {
        g.fillText(words.join(''), pad, y)
        y += 34
      }
    } else if (line.kind === 'rule') {
      rule()
    } else if (line.kind === 'label') {
      y += 8
      g.font = `500 17px ${MONO}`
      g.fillStyle = pink
      g.fillText(`— ${line.text}`, pad, y)
      y += 62
    } else if (line.kind === 'quote') {
      g.font = `400 58px ${SERIF}`
      g.fillStyle = pink
      g.fillText('“', pad - 24, y)
      g.fillStyle = ink
      for (const words of wrap(g, line.text, inner)) {
        g.fillText(words.join('').trimEnd(), pad, y)
        y += 60
      }
      y += 14
    } else if (line.kind === 'body') {
      g.font = `400 20px ${MONO}`
      g.fillStyle = 'rgba(30,26,20,.86)'
      for (const words of wrap(g, line.text, inner)) {
        g.fillText(words.join('').trimEnd(), pad, y)
        y += 31
      }
      y += 12
    } else if (line.kind === 'note') {
      y += 6
      g.font = `400 15px ${MONO}`
      g.fillStyle = 'rgba(30,26,20,.5)'
      for (const words of wrap(g, line.text, inner)) {
        g.fillText(words.join(''), pad, y)
        y += 22
      }
    }
  }
  const end = y
  // barcode, today's date, and the perforation the receipt tears along
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  g.fillStyle = ink
  for (let x = pad; x < W - pad - 6; ) {
    const bar = 2 + Math.floor(random() * 5)
    if (random() > 0.35) g.fillRect(x, H - 190, bar, 84)
    x += bar + 2 + Math.floor(random() * 4)
  }
  g.font = `500 16px ${MONO}`
  g.textAlign = 'center'
  g.fillText(`FUTUREREADY-MY · ${new Date().toISOString().slice(0, 10)}`, W / 2, H - 76)
  g.setLineDash([10, 8])
  g.strokeStyle = 'rgba(30,26,20,.35)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(0, H - 18)
  g.lineTo(W, H - 18)
  g.stroke()
  return { canvas, end }
}

function signTexture(ink, cream, pink) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 200
  const g = canvas.getContext('2d')
  g.fillStyle = ink
  g.fillRect(0, 0, 1024, 200)
  g.font = `400 112px ${SERIF}`
  g.fillStyle = cream
  g.textBaseline = 'middle'
  const word = 'FutureReady'
  const width = g.measureText(word).width
  const x = 512 - (width + 110) / 2
  g.fillText(word, x, 104)
  g.fillStyle = pink
  g.beginPath()
  g.roundRect(x + width + 18, 66, 92, 64, 10)
  g.fill()
  g.font = `600 40px ${MONO}`
  g.fillStyle = cream
  g.textAlign = 'center'
  g.fillText('MY', x + width + 64, 100)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// The ATM screen: a short status line and a progress bar, redrawn while printing.
function createScreen(cream, lime) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 320
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  let last = ''
  const draw = (text, progress) => {
    const key = `${text}|${progress.toFixed(2)}`
    if (key === last) return
    last = key
    const sky = g.createLinearGradient(0, 0, 0, 320)
    sky.addColorStop(0, '#3a4cff')
    sky.addColorStop(1, '#1820a0')
    g.fillStyle = sky
    g.fillRect(0, 0, 512, 320)
    g.fillStyle = 'rgba(255,255,255,.05)'
    for (let y = 0; y < 320; y += 4) g.fillRect(0, y, 512, 1)
    g.fillStyle = cream
    g.textAlign = 'center'
    g.font = `500 20px ${MONO}`
    g.fillText('FUTUREREADY MY', 256, 64)
    g.font = `400 50px ${SERIF}`
    g.fillText(text, 256, 172, 460)
    g.fillStyle = 'rgba(245,240,230,.25)'
    g.beginPath()
    g.roundRect(106, 222, 300, 12, 6)
    g.fill()
    g.fillStyle = lime
    g.beginPath()
    g.roundRect(106, 222, Math.max(12, 300 * progress), 12, 6)
    g.fill()
    texture.needsUpdate = true
  }
  return { texture, draw }
}

function buildAtm(colors, sign, screen) {
  const atm = new THREE.Group()
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra })
  const add = (parent, geometry, mat, [x, y, z]) => {
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const body = material(colors.cabinet, { roughness: 0.62 })
  const ink = material(colors.ink, { roughness: 0.4 })
  const slot = material('#0c0b09', { roughness: 0.9 })
  add(atm, new RoundedBoxGeometry(2, 3.2, 1.1, 4, 0.09), body, [0, 1.6, 0])
  add(atm, new RoundedBoxGeometry(2.08, 0.46, 1.18, 4, 0.07), ink, [0, 3.2, 0.02])
  add(atm, new THREE.PlaneGeometry(1.86, 0.36), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }), [0, 3.2, 0.615])
  add(atm, new RoundedBoxGeometry(1.5, 1.02, 0.14, 4, 0.05), ink, [0, 2.45, 0.56])
  add(atm, new THREE.PlaneGeometry(1.3, 0.82), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }), [0, 2.45, 0.635])
  // card slot beside the screen, with its light
  add(atm, new THREE.BoxGeometry(0.05, 0.36, 0.08), slot, [0.875, 2.4, 0.57])
  const led = add(atm, new THREE.BoxGeometry(0.05, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: colors.lime, toneMapped: false }), [0.875, 2.66, 0.575])
  // keypad on a sloped shelf, with the three accents on the function keys
  const shelf = new THREE.Group()
  shelf.position.set(0, 1.72, 0.74)
  shelf.rotation.x = 0.34
  atm.add(shelf)
  add(shelf, new RoundedBoxGeometry(1.6, 0.1, 0.5, 3, 0.04), ink, [0, 0, 0])
  const key = new RoundedBoxGeometry(0.15, 0.05, 0.085, 2, 0.02)
  const keyMat = material(colors.key, { roughness: 0.35 })
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 3; col += 1) add(shelf, key, keyMat, [-0.5 + col * 0.19, 0.07, -0.17 + row * 0.11])
  const wide = new RoundedBoxGeometry(0.28, 0.05, 0.085, 2, 0.02)
  ;[colors.pink, colors.lime, colors.blue].forEach((color, row) => add(shelf, wide, material(color, { roughness: 0.35 }), [0.3, 0.07, -0.17 + row * 0.11]))
  // receipt slot (the paper leaves from here), cash slot, kick plate
  add(atm, new RoundedBoxGeometry(0.86, 0.16, 0.08, 2, 0.03), ink, [0, SLOT.y, 0.56])
  add(atm, new THREE.BoxGeometry(0.66, 0.035, 0.1), slot, [0, SLOT.y, 0.58])
  add(atm, new THREE.BoxGeometry(1.1, 0.09, 0.06), slot, [0, 1.06, 0.56])
  add(atm, new THREE.BoxGeometry(2.02, 0.2, 1.12), ink, [0, 0.1, 0])
  return { atm, led }
}

// playIntro({ t, host, onHold, onReveal, onDone }) → { skip }. The caller made `host` (a full-screen layer with the
// skip and continue buttons) and calls skip() when the user skips or continues. onHold: the receipt is waiting.
export async function playIntro({ t, host, onHold, onReveal, onDone }) {
  await fontsReady()
  const colors = {
    cream: cssColor('--lp-cream', '#f5f0e6'),
    ink: cssColor('--lp-ink', '#15130f'),
    pink: cssColor('--lp-pink', '#f0186d'),
    blue: cssColor('--lp-blue', '#2b3cff'),
    lime: cssColor('--lp-lime', '#c6f135'),
  }
  const dark = new THREE.Color(colors.cream).getHSL({}).l < 0.5
  Object.assign(colors, { cabinet: dark ? '#2c2822' : '#e7dece', key: dark ? '#4a443a' : '#fbf8f0' })
  const paperInk = '#1e1a14'

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  host.prepend(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
  scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x2a2620 : 0xd9ccb4, dark ? 1.1 : 1.7))
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 2.2 : 2.8)
  sun.position.set(-4, 9, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 6, bottom: -3 })
  sun.shadow.bias = -0.0004
  scene.add(sun)
  const glow = new THREE.PointLight(colors.blue, 3, 4)
  glow.position.set(0, 2.45, 1.4)
  scene.add(glow)
  const rim = new THREE.PointLight(colors.pink, 6, 9)
  rim.position.set(3.5, 3, -1.5)
  scene.add(rim)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: dark ? 0.35 : 0.16 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const screen = createScreen('#f5f0e6', colors.lime)
  const sign = signTexture(colors.ink, colors.cream, colors.pink)
  const { atm, led } = buildAtm(colors, sign, screen.texture)
  scene.add(atm)

  // The receipt: a strip whose points are placed every frame (printing, curling, flying); as long as its text.
  const { texture: receipt, length: PAPER_L } = receiptTexture(t, paperInk, colors.pink)
  const paperGeometry = new THREE.PlaneGeometry(PAPER_W, PAPER_L, 1, 140)
  const uv = paperGeometry.attributes.uv
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, 1 - uv.getX(i)) // reads upright once flipped to face the viewer
  const position = paperGeometry.attributes.position
  const flat = Array.from({ length: position.count }, (_, i) => ({ x: position.getX(i), y: position.getY(i) }))
  // The receipt glows a little more as it faces the viewer, so it reads evenly lit in the middle of the screen.
  const paperMaterial = new THREE.MeshStandardMaterial({ map: receipt, emissive: 0xffffff, emissiveMap: receipt, emissiveIntensity: 0.12, roughness: 0.92, side: THREE.DoubleSide })
  const paper = new THREE.Mesh(paperGeometry, paperMaterial)
  paper.castShadow = true
  paper.frustumCulled = false
  scene.add(paper)

  const hanging = (i, emerged, drop) => {
    const { x, y } = flat[i]
    const along = PAPER_L / 2 - y // 0 at the top of the receipt, which leaves the slot first
    const p = curlPoint(emerged - along, CURL_R)
    return new THREE.Vector3(x, SLOT.y + p.y - drop, SLOT.z + p.z)
  }
  const placeHanging = (emerged, drop) => {
    for (let i = 0; i < position.count; i += 1) {
      const v = hanging(i, emerged, drop)
      position.setXYZ(i, v.x, v.y, v.z)
    }
  }

  // camera: dolly in, drift, follow the pointer a little; further back on narrow screens
  const pointer = { x: 0, y: 0 }
  const onPointer = (event) => {
    pointer.x = event.clientX / window.innerWidth - 0.5
    pointer.y = event.clientY / window.innerHeight - 0.5
  }
  // wide screens: the ATM stands a little right of centre
  let distance = 1
  const look = LOOK.clone()
  const resize = () => {
    const w = host.clientWidth
    const h = host.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    distance = camera.aspect < 0.8 ? Math.min(1.9, 0.8 / camera.aspect) : 1
    look.x = camera.aspect > 1.15 ? -0.6 : 0
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointer)

  let fly = null // frozen camera axes and start/end points of each paper point
  const startFly = () => {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    const toward = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion)
    const depth = 3
    const visibleH = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    // the receipt fills most of the height, a little above the middle to leave room for "Continue"
    const scale = Math.min((0.76 * visibleH) / PAPER_L, (0.84 * visibleH * camera.aspect) / PAPER_W)
    const center = camera.position.clone().addScaledVector(toward, -depth).addScaledVector(up, 0.035 * visibleH)
    fly = flat.map(({ x, y }, i) => ({
      from: hanging(i, PAPER_L, 0.06),
      to: center.clone().addScaledVector(right, -x * scale).addScaledVector(up, y * scale),
      lag: (PAPER_L / 2 - y) / PAPER_L,
      flip: (y / PAPER_L) * scale,
    }))
    fly.toward = toward
    fly.up = up
    // the machine fades away and leaves the receipt alone
    atm.traverse((object) => {
      if (!object.material) return
      object.material.transparent = true
      object.material.needsUpdate = true
    })
    ground.material.userData.opacity = ground.material.opacity
  }
  const fadeAtm = (opacity) => {
    atm.traverse((object) => {
      if (object.material) object.material.opacity = opacity
    })
    ground.material.opacity = ground.material.userData.opacity * opacity
    glow.intensity = 3 * opacity
  }

  const start = performance.now()
  let finished = false
  let revealed = false
  let holding = false
  const reveal = () => {
    if (revealed) return
    revealed = true
    host.classList.add('out')
    onReveal?.()
    setTimeout(finish, 700)
  }
  function finish() {
    if (finished) return
    finished = true
    renderer.setAnimationLoop(null)
    window.removeEventListener('resize', resize)
    window.removeEventListener('pointermove', onPointer)
    scene.traverse((object) => {
      object.geometry?.dispose()
      for (const mat of [object.material].flat()) {
        mat?.map?.dispose()
        mat?.dispose()
      }
    })
    renderer.dispose()
    onDone?.()
  }
  const frame = () => {
    const time = (performance.now() - start) / 1000
    const { phase, k } = introAt(time)
    // camera
    if (phase !== 'fly' && phase !== 'hold') {
      const arrive = phase === 'arrive' ? ease(k) : 1
      const offset = CAMERA_OFFSET.clone().multiplyScalar(distance * (1.45 - 0.45 * arrive))
      offset.x += Math.sin(time * 0.35) * 0.25 + pointer.x * 0.8
      offset.y += 0.6 * (1 - arrive) - pointer.y * 0.5
      camera.position.copy(look).add(offset)
      camera.lookAt(look)
    }
    // paper
    if (phase === 'arrive') placeHanging(0, 0)
    else if (phase === 'print') placeHanging(PAPER_L * (k - Math.sin(k * Math.PI * 2 * 16) / (Math.PI * 2 * 16) * 0.7), 0)
    else if (phase === 'tear') placeHanging(PAPER_L, 0.06 * ease(k) + Math.sin(k * Math.PI * 3) * 0.01 * (1 - k))
    else {
      if (!fly) startFly()
      const k2 = phase === 'fly' ? k : 1
      fadeAtm(1 - ease(clamp01(k2 * 1.6)))
      paperMaterial.emissiveIntensity = 0.12 + 0.33 * ease(k2)
      for (let i = 0; i < position.count; i += 1) {
        const { from, to, lag, flip } = fly[i]
        const e = ease(clamp01(k2 * 1.25 - lag * 0.25))
        const v = from.clone().lerp(to, e)
        v.y += Math.sin(Math.PI * e) * 0.35
        v.addScaledVector(fly.toward, Math.sin(Math.PI * e) * (flip * 0.9 + 0.9)) // flip over, and clear the machine
        position.setXYZ(i, v.x, v.y, v.z)
      }
    }
    position.needsUpdate = true
    paperGeometry.computeVertexNormals()
    // waiting in the middle: the receipt floats gently until the user moves on
    if (phase === 'hold') {
      if (!holding) {
        holding = true
        onHold?.()
      }
      paper.position.copy(fly.up).multiplyScalar(Math.sin((time - INTRO_LENGTH) * 1.4) * 0.012)
    }
    // screen and light
    const printing = phase === 'arrive' || phase === 'print'
    screen.draw(printing ? t('introScreen') : t('introScreen2'), phase === 'print' ? k : printing ? 0 : 1)
    led.visible = !printing || Math.floor(time * 4) % 2 === 0
    renderer.render(scene, camera)
  }
  renderer.setAnimationLoop(frame)
  return { skip: reveal }
}
