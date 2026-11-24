import * as THREE from 'three'

// Six rubber slats make one repeat. The light chevrons travel with the belt;
// the dark lip and the two metal edges remain continuous around the chassis.
function slatTexture() {
  const width = 256, height = 32
  const pixels = new Uint8Array(width * height * 4)
  const metal = [100, 133, 139], lip = [40, 58, 66], rubber = [37, 60, 69]
  const slats = [[196, 242, 231], [130, 202, 202], [85, 151, 162],
    [68, 106, 116], [68, 106, 116], [68, 106, 116]]
  for (let y = 0; y < height; y++) {
    const v = (y + .5) / height
    for (let x = 0; x < width; x++) {
      const stripe = 6 * (x + .5) / width - .51 * (1 - Math.abs(2 * v - 1))
      const index = Math.floor(stripe)
      const onSlat = stripe - index < .61
      const rgb = v < .12 || v > .94 ? metal : v < .22 || v > .85 ? lip
        : onSlat ? slats[(index + slats.length) % slats.length] : rubber
      const offset = (y * width + x) * 4
      pixels.set(rgb, offset)
      pixels[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

// A sloped, chamfered rim exposes both the belt and its return edge in the overview.
export function createDeckBelt(columns: number, rows: number) {
  const size = Math.max(columns, rows)
  const width = THREE.MathUtils.clamp(size * .023, .30, .52)
  function ring(outset: number, y: number) {
    const left = -1.03 - outset, right = columns + .03 + outset
    const back = -1.03 - outset, front = rows + .03 + outset
    const cut = .28 + outset * .58
    return [
      [left + cut, y, front], [right - cut, y, front], [right, y, front - cut], [right, y, back + cut],
      [right - cut, y, back], [left + cut, y, back], [left, y, back + cut], [left, y, front - cut],
    ].map(([x, height, z]) => new THREE.Vector3(x, height, z))
  }
  const inner = ring(-.035, -.16)
  const outer = ring(width, -.29)
  const underside = ring(width, -.43)
  const distances = [0]
  for (let i = 0; i < outer.length; i++) {
    distances.push(distances[i] + outer[i].distanceTo(outer[(i + 1) % outer.length]))
  }
  const perimeter = distances[outer.length]
  const repeats = Math.max(1, Math.round(perimeter / THREE.MathUtils.clamp(3 + size * .15, 3.4, 7)))
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  for (let i = 0; i <= outer.length; i++) {
    const corner = i % outer.length
    const u = distances[i] * repeats / perimeter
    for (const [point, v] of [[inner[corner], 1], [outer[corner], .10], [underside[corner], .02]] as const) {
      positions.push(point.x, point.y, point.z)
      uvs.push(u, v)
    }
    if (i < outer.length) {
      const a = i * 3
      indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3,
        a + 1, a + 2, a + 4, a + 2, a + 5, a + 4)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  const texture = slatTexture()
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Perimeter guide belt'
  // Individual side bounds keep zoomed-in interior views eligible for idle rendering suspension.
  const bounds = [0, 2, 4, 6].map(i => new THREE.Box3().setFromPoints([
    inner[i], inner[i + 1], underside[(i + 7) % 8], underside[i], underside[i + 1], underside[(i + 2) % 8],
  ]))
  return {
    mesh, bounds,
    update(seconds: number) { texture.offset.x = -(seconds * .24 % 1) },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose() },
  }
}
