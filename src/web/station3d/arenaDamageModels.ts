import type { Livery, ModelParts } from './models'

const exposedMetal = '#52616a'
const burntMetal = '#303b42'
const copper = '#d47c46'
const warning = '#ffc363'

/** The left service cover has sprung open. The diagonal seam continues down over the broken eye. */
export function damagedHelmet(parts: ModelParts, colors: Livery) {
  parts.box([.62, .29, .43], [0, .142, 0], colors.enamel, .077)
  parts.box([.59, .065, .422], [0, .266, -.006], burntMetal, .023)
  parts.box([.35, .14, .444], [.124, .266, -.006], colors.crown, .043)
  parts.capsule([-.021, .339, .125], [.078, .339, .075], .013, burntMetal)
  parts.capsule([.078, .339, .075], [.057, .339, .02], .013, burntMetal)
  parts.capsule([.057, .339, .02], [.145, .339, -.046], .010, burntMetal)
  // Hot fins inside the recess and a bent plate with its underside visible from either side.
  for (const x of [-.234, -.172, -.11]) {
    parts.box([.024, .034, .235], [x, .306, -.018], copper, .005)
  }
  parts.box([.194, .034, .34], [-.261, .368, -.017], exposedMetal, .012, [0, .07, -.73])
  parts.box([.20, .028, .345], [-.249, .386, -.017], colors.crown, .012, [0, .07, -.73])
  parts.box([.105, .019, .071], [-.273, .418, -.06], burntMetal, .004, [0, .07, -.73])
  // A shattered corner of the screen exposes a dark socket while the other eye can still blink.
  parts.box([.183, .130, .02], [-.135, .176, .280], burntMetal, .016, [0, 0, .12])
  parts.capsule([-.208, .229, .295], [-.156, .183, .296], .012, warning)
  parts.capsule([-.156, .183, .296], [-.177, .155, .296], .011, warning)
  parts.capsule([-.177, .155, .296], [-.126, .118, .296], .010, copper)
}

export function damagedHull(parts: ModelParts, colors: Livery) {
  parts.box([.39, .255, .288], [0, .375, 0], burntMetal, .047)
  parts.box([.212, .227, .298], [.09, .382, 0], colors.enamel, .037)
  parts.box([.165, .122, .038], [.083, .411, .144], colors.crown, .014)
  // Exposed drive belt and diagonally hanging left chest cover.
  for (const y of [.345, .388, .431]) {
    parts.box([.13, .017, .031], [-.09, y, .155], copper, .006)
  }
  parts.box([.079, .196, .176], [-.189, .344, .056], colors.enamel, .014, [.14, 0, -.38])
}

/** A sideways helmet, a severed wrist and a folded drive unit form a low, cold pile of scrap. */
export function robotWreckParts(parts: ModelParts, colors: Livery, sprout: boolean) {
  parts.box([.36, .112, .32], [.095, .070, -.112], burntMetal, .036, [0, -.36, 0])
  parts.box([.25, .094, .215], [.135, .151, -.106], exposedMetal, .020, [.13, -.36, -.14])
  for (const x of [.077, .149]) {
    parts.box([.041, .030, .125], [x, .208, -.106], copper, .005, [0, -.36, -.14])
  }
  // The visor faces upwards, so the crossed-out eye sockets also read in map overview.
  parts.box([.412, .207, .297], [-.115, .132, .072], colors.enamel, .061, [.19, -.28, .16])
  parts.box([.34, .024, .202], [-.119, .242, .057], burntMetal, .018, [.19, -.28, .16])
  // A torn metal lip follows the lower edge of the face. Leave a gap where the housing split.
  parts.capsule([-.289, .167, .158], [-.186, .179, .190], .015, exposedMetal)
  parts.capsule([-.138, .186, .203], [-.006, .204, .242], .014, colors.crown)
  parts.capsule([-.153, .177, .213], [-.104, .122, .232], .012, burntMetal)
  parts.capsule([-.104, .122, .232], [-.129, .078, .235], .010, burntMetal)
  for (const x of [-.196, -.071]) {
    for (const angle of [-.78, .78]) {
      parts.box([.063, .019, .012], [x, .261 + (x + .119) * .16, .058], '#a2afb0', .002, [.19, angle - .28, .16])
    }
  }
  parts.box([.212, .037, .152], [-.233, .109, -.044], colors.crown, .012, [-.26, .14, -.52])
  if (sprout) {
    parts.capsule([-.244, .102, .154], [-.312, .070, .217], .014, '#58775f')
    parts.box([.15, .024, .066], [-.320, .055, .237], '#85bc76', .020, [0, -.73, .18])
    parts.box([.106, .019, .052], [-.265, .050, .251], '#598968', .014, [0, .71, -.1])
  } else {
    parts.capsule([-.258, .144, .144], [-.315, .080, .205], .016, exposedMetal)
    parts.box([.070, .042, .067], [-.324, .065, .214], colors.accent, .009, [.16, .22, .20])
  }
  parts.capsule([.135, .076, .122], [.248, .046, .196], .029, exposedMetal)
  parts.box([.112, .081, .128], [.288, .049, .212], colors.enamel, .016, [.12, -.48, .09])
  parts.capsule([.297, .047, .237], [.352, .027, .258], .016, burntMetal)
  parts.capsule([.261, .043, .252], [.291, .023, .300], .016, burntMetal)
  parts.box([.112, .072, .135], [-.048, .076, -.251], colors.enamel, .018, [-.24, .45, -.13])
  parts.box([.146, .036, .173], [-.058, .045, -.292], burntMetal, .010, [0, .45, 0])
  parts.box([.120, .039, .079], [-.267, .033, -.186], colors.crown, .011, [0, .47, -.14])
  parts.cylinder(.039, .041, .034, [.245, .021, -.249], copper)
  return parts
}
