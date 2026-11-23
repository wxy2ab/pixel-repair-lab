import * as THREE from 'three'
import { createStationModels } from './models'
import { Kit } from './workshop'

export type LessonActivity = 'coding' | 'data' | 'vision' | 'ai'
const graphite = '#243944', enamel = '#94bcb9', mint = '#88eed3', coral = '#ed9a66'
const zero: [number, number, number] = [0, 0, 0]

// Dimensions put each instrument and Sprout's hands on the same physical bench.
function equipment(activity: LessonActivity, base: Kit, moving: Kit) {
  base.casing([0,-.062,0], [2.72,.17,1.32], graphite,.07)
  base.casing([0,.004,0], [2.67,.095,1.27], '#557978',.04)
  for (const x of [-1.12,1.12]) base.box([x,.055,.46],[.15,.016,.05],'#adc4b6')
  for (const x of [-.01,1.09]) base.box([x,.20,-.01],[.14,.30,.58], '#375861')
  base.casing([.54,.38,0], [1.38,.13,.84], enamel,.055)
  base.box([.53,.32,.414], [1.10,.065,.026], graphite)
  base.box([.34,.324,.432], [.41,.021,.012], mint, zero, 'glow')

  if (activity === 'coding') {
    base.cylinder([.57,.49,-.19], .19,.27,.10,graphite)
    base.box([.57,.63,-.21],[.10,.28,.11],graphite)
    base.casing([.56,.89,-.23],[1.08,.61,.13],enamel,.053)
    base.casing([.56,.9,-.15],[.95,.50,.033],graphite,.016)
    base.box([.56,.90,-.126],[.84,.40,.015],'#174b4a',zero,'glow')
    for (const [x,y,w,c] of [[.43,1.017,.38,mint],[.56,.947,.41,'#7fc4dd'],[.51,.875,.31,'#e6be81']] as const)
      base.box([x,y,-.11],[w,.021,.012],c,zero,'glow')
    moving.box([.34,.794,-.103],[.12,.025,.014],mint,zero,'glow')
    base.casing([.51,.472,.164],[.95,.048,.265],'#41616b',.017)
    for (let i=0;i<5;i++) for (let j=0;j<2;j++)
      base.box([.18+i*.16,.505,.103+j*.095],[.104,.026,.055],'#cdd9c9')
  } else if (activity === 'data') {
    // Three transparent-rimmed sample bins, a travelling sorter gate and a diverting arm.
    base.casing([.55,.49,-.04],[1.22,.092,.48],graphite,.035)
    for (let i=0;i<3;i++) {
      const x = .15+i*.37
      const h = [.31,.55,.40][i]
      base.cylinder([x,.54,-.11],.153,.16,.08,'#b4c8bc')
      base.cylinder([x,.58+h/2,-.11],.107,.125,h,['#e0a055','#6bc5b3','#819bcc'][i])
      base.cylinder([x,.60+h,-.11],.15,.15,.055,enamel)
    }
    base.rod([-.026,.58,.22],[1.12,.58,.22],.03,graphite)
    moving.casing([.18,.624,.22],[.21,.155,.12],coral,.032)
    moving.box([.18,.711,.22],[.11,.027,.067],'#ffe4ad',zero,'glow')
  } else if (activity === 'vision') {
    // A barrel lens on a pan head facing a four-colour calibration sample.
    base.cylinder([.76,.50,-.13],.24,.31,.11,graphite)
    base.cylinder([.76,.60,-.13],.105,.14,.16,enamel)
    moving.casing([0,0,0],[.61,.40,.39],'#e3ccb0',.064)
    moving.cylinder([0,-.014,.23],.195,.20,.13,graphite,[Math.PI/2,0,0])
    moving.cylinder([0,-.014,.31],.139,.16,.06,'#5dbbb7',[Math.PI/2,0,0])
    moving.cylinder([0,-.014,.348],.089,.112,.025,'#254457',[Math.PI/2,0,0])
    moving.box([.19,.10,.20],[.059,.030,.014],mint,zero,'glow')
    base.casing([.08,.58,.05],[.36,.32,.07],graphite,.022)
    for (let i=0;i<4;i++) base.box([.008+(i%2)*.145,.515+Math.floor(i/2)*.135,.10],[.125,.111,.022],
      ['#f6c579','#91ade4','#79d3a8','#f19079'][i],zero,'glow')
  } else {
    // A desk radio and a small hovering telepresence companion.
    base.cylinder([.59,.49,-.06],.39,.41,.105,graphite)
    base.ring([.59,.554,-.06],.27,.017,'#aeaffe','glow')
    moving.casing([0,0,0],[.60,.48,.38],'#c6bddf',.099)
    moving.casing([0,-.005,.176],[.46,.26,.085],graphite,.04)
    for (const side of [-1,1]) {
      moving.box([side*.111,.015,.224],[.061,.077,.017],'#dbb0fe',zero,'glow')
      moving.cylinder([side*.327,0,0],.095,.095,.102,enamel,[0,0,Math.PI/2])
    }
    moving.rod([.10,.20,0],[.17,.34,0],.021,graphite)
    moving.cylinder([.17,.345,0],.040,.047,.061,coral)
    base.casing([.08,.51,.24],[.35,.14,.19],'#7698a4',.025)
    base.rod([.025,.57,.22],[-.04,.83,.20],.014,ivory)
  }
}
const ivory = '#dae5d7'

export function createLessonRenderer(canvas: HTMLCanvasElement, activity: LessonActivity, initiallyComplete: boolean,
  events: { ready: () => void; failed: () => void }) {
  const gl = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'})
  gl.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  gl.setClearColor(0, 0)
  gl.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xe6f7fa,0x617a91,1.69))
  const light = new THREE.DirectionalLight(0xffe3b5,2.4)
  light.position.set(-3,5,4)
  const rim = new THREE.DirectionalLight(0x8cc6dd,1.15)
  rim.position.set(3,3,-3)
  scene.add(light,rim)
  const materials = {
    metal: new THREE.MeshStandardMaterial({vertexColors:true,roughness:.64,metalness:.15}),
    glow: new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}),
  }
  const geometries: THREE.BufferGeometry[] = []
  const base = new Kit(), mechanism = new Kit()
  equipment(activity,base,mechanism)
  const moving = mechanism.finish(materials,geometries)
  scene.add(base.finish(materials,geometries), moving)
  const models = createStationModels()
  const hero = models.robot()
  hero.scale.setScalar(1.14)
  hero.position.set(-.65,.053,.046)
  hero.rotation.y = .52
  scene.add(hero)
  const lens = new THREE.CylinderGeometry(.052,.052,.025,12)
  const lamp = new THREE.MeshBasicMaterial({toneMapped:false})
  const status = new THREE.Mesh(lens,lamp)
  status.rotation.x = Math.PI/2
  status.position.set(1.02,.344,.426)
  scene.add(status)
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,.1,30)
  camera.position.set(1.40,1.52,3.65)
  camera.lookAt(0,.56,0)
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  let completed = initiallyComplete, disposed = false, first = true
  let animationStart: number | undefined
  let alternativePose = false
  let frame = 0

  function draw(now: number) {
    frame = 0
    if (disposed) return
    const progress = animationStart === undefined || media.matches ? 1 : Math.min(1,(now-animationStart)/920)
    const stroke = media.matches && alternativePose ? 1 : Math.sin(Math.PI*progress)
    models.pose(hero, completed ? 'wave' : 'work', completed ? .60 + stroke*.38 : .28 + stroke*.6)
    if (activity === 'coding') moving.position.x = stroke*.39
    if (activity === 'data') moving.position.x = stroke*.75
    if (activity === 'vision') { moving.position.set(.76,.86,-.13); moving.rotation.y = -.29 + stroke*.79 }
    if (activity === 'ai') { moving.position.set(.59,.89+stroke*.10,-.06); moving.rotation.y = -.19 - stroke*.28 }
    lamp.color.set(completed ? '#87ffaf' : stroke > .25 ? '#fff2b5' : '#e3a461')
    try { gl.render(scene,camera) } catch { fail(); return }
    if (first) { first = false; events.ready() }
    if (progress < 1) redraw()
    else animationStart = undefined
  }
  function redraw() { if (!frame && !disposed) frame = requestAnimationFrame(draw) }
  function resize() {
    const w = Math.max(1,canvas.clientWidth), h = Math.max(1,canvas.clientHeight)
    gl.setSize(w,h,false)
    const ratio = w/h, half = Math.max(.81,1.50/ratio)
    camera.left = -half*ratio; camera.right = half*ratio
    camera.bottom = -half; camera.top = half
    camera.updateProjectionMatrix()
    redraw()
  }
  function operate() {
    alternativePose = media.matches && !alternativePose
    animationStart = media.matches ? undefined : performance.now()
    redraw()
  }
  function fail(event?: Event) {
    event?.preventDefault()
    if (!disposed) { dispose(); events.failed() }
  }
  const observer = new ResizeObserver(resize)
  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    observer.disconnect()
    canvas.removeEventListener('webglcontextlost',fail)
    for (const geometry of geometries) geometry.dispose()
    for (const material of Object.values(materials)) material.dispose()
    models.dispose()
    lens.dispose(); lamp.dispose(); scene.clear()
    gl.dispose()
    if (!gl.getContext().isContextLost()) gl.forceContextLoss()
  }
  try {
    canvas.addEventListener('webglcontextlost',fail)
    observer.observe(canvas)
    resize()
  } catch (error) { dispose(); throw error }
  return {
    operate,
    dispose,
    setCompleted(next: boolean) {
      if (next === completed) return
      completed = next
      alternativePose = false
      animationStart = media.matches ? undefined : performance.now()
      redraw()
    },
  }
}
