"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

type Props = { kind: "body" | "head"; walking: boolean; mouth: RefObject<number>; speaking: RefObject<boolean> }

export function FoxViewport({ kind, walking, mouth, speaking }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const walk = useRef(walking)
  const [error, setError] = useState("")
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { walk.current = walking }, [walking])

  useEffect(() => {
    const element = host.current
    if (!element) return
    let disposed = false
    let frame = 0
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }) }
    catch { setError("3D is unavailable on this device."); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    element.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xfff5ed, 0x776177, 2.8))
    const key = new THREE.DirectionalLight(0xffe9d4, 4)
    key.position.set(3, 4, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xaaddff, 2)
    rim.position.set(-3, 2, -2)
    scene.add(rim)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
    camera.position.set(0, kind === "head" ? 0.01 : 0.85, kind === "head" ? 1.25 : 3.2)
    camera.lookAt(0, kind === "head" ? 0 : 0.85, 0)
    let root: THREE.Group | undefined
    let mixer: THREE.AnimationMixer | undefined
    let action: THREE.AnimationAction | undefined
    const mouths: THREE.Mesh[] = []
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const resize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const release = (object: THREE.Object3D) => object.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      node.geometry.dispose()
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
        material.dispose()
      }
    })
    new GLTFLoader().load(`/models/aeon-fox-${kind === "body" ? "full-body" : "head"}.glb`, gltf => {
      if (disposed) { release(gltf.scene); return }
      root = gltf.scene
      root.updateMatrixWorld(true)
      root.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.update() })
      const box = new THREE.Box3()
      const vertex = new THREE.Vector3()
      root.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return
        const weights = node.geometry.getAttribute("skinWeight")
        const positions = node.geometry.getAttribute("position")
        for (let i = 0; i < positions.count; i++) {
          // Meshy's zero-weight helper vertices are not visible character geometry.
          if (weights && weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) < 0.001) continue
          node.getVertexPosition(i, vertex)
          box.expandByPoint(vertex.applyMatrix4(node.matrixWorld))
        }
      })
      const center = box.getCenter(new THREE.Vector3())
      const height = box.getSize(new THREE.Vector3()).y
      const scale = (kind === "body" ? 1.7 : 0.6) / height
      root.scale.setScalar(scale)
      root.position.set(-center.x * scale, -(kind === "body" ? box.min.y : center.y) * scale, -center.z * scale)
      scene.add(root)
      root.traverse(node => {
        if (node instanceof THREE.Mesh && node.morphTargetDictionary?.jawOpen !== undefined) mouths.push(node)
      })
      if (kind === "body" && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(root)
        const clip = gltf.animations.find(clip => /walk/i.test(clip.name)) ?? gltf.animations[0]
        action = mixer.clipAction(clip)
        action.play()
      }
      setLoaded(true)
    }, undefined, () => { if (!disposed) setError("Couldn't load Aeon. Reload to try again.") })

    let previous = performance.now()
    let distance = 0
    let mouthValue = 0
    const render = (time: number) => {
      const delta = Math.min((time - previous) / 1000, 0.05)
      previous = time
      const moving = walk.current && !reducedMotion.matches && !speaking.current
      if (mixer && action) {
        action.paused = !moving
        mixer.update(delta)
      }
      if (kind === "body") {
        if (moving) distance += delta * 45
        const range = Math.max(0, window.innerWidth - 180)
        const phase = range ? (distance % (range * 2)) : 0
        const right = phase < range
        element.style.transform = `translateX(${right ? phase : range * 2 - phase}px)`
        if (root) root.rotation.y = moving ? (right ? 0.85 : -0.85) : 0
      } else if (root) {
        root.rotation.y = reducedMotion.matches ? 0 : Math.sin(time * 0.0006) * 0.08
        root.rotation.x = speaking.current ? Math.sin(time * 0.002) * 0.02 : 0
      }
      mouthValue = THREE.MathUtils.damp(mouthValue, mouth.current, 20, delta)
      for (const mesh of mouths) mesh.morphTargetInfluences![mesh.morphTargetDictionary!.jawOpen] = mouthValue
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    resize()
    frame = requestAnimationFrame(render)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      mixer?.stopAllAction()
      if (root) { mixer?.uncacheRoot(root); release(root) }
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [kind, mouth, speaking])

  return (
    <div ref={host} aria-label={kind === "head" ? "Animated Aeon fox head" : "Walking Aeon fox"} role="img" data-model-loaded={loaded} className={kind === "body" ? "pointer-events-none fixed bottom-0 left-0 z-30 h-[220px] w-[170px]" : "relative h-[240px] w-full"}>
      {error && <p className="absolute inset-x-2 top-1/2 rounded-xl bg-background/90 p-2 text-center text-xs text-muted-foreground">{error}</p>}
      {!error && !loaded && kind === "head" && <p className="absolute inset-x-0 top-1/2 text-center text-xs text-muted-foreground">Loading Aeon…</p>}
    </div>
  )
}
