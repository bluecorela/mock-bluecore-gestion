/**
* Backfill sprint_cerrado (boolean) para /equipos/sgb-evolucion/sprints/*
*
* Reglas:
* - expectedMembers = personal del equipo (excluye Arquitecto, excluye vacaciones=true)
* - evaluatedMembers = cantidad de docs en /sprints/{sprint}/Integrantes
* - Si evaluatedMembers === expectedMembers -> sprint completado
* - Marcar sprint_cerrado=true para todos los sprints antes del último sprint "en proceso"
* - Marcar sprint_cerrado=false para el último sprint "en proceso" (si existe)
*
* Cómo correr:
*  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/backfill-sprint-cerrado.js
*
* Opcional:
*  DRY_RUN=true ... (no escribe, solo imprime)
*/
 
const admin = require("firebase-admin");
 
const TEAM_ID = "sgb-evolucion";
const DRY_RUN = (process.env.DRY_RUN || "").toLowerCase() === "true";
 
function parseSprintNumber(id) {
  // "sprint-12" -> 12
  const m = String(id).match(/^sprint-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}
 
async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
 
  const db = admin.firestore();
 
  // 1) Obtener referencia del equipo
  const teamRef = db.doc(`equipos/${TEAM_ID}`);
 
  // 2) Calcular integrantes esperados (desde personal)
  // Ajusta roles si aplica en tu data (ej. incluir QA).
  const personalSnap = await db
    .collection("personal")
    .where("equipo", "==", teamRef)
    .get();
 
  const expectedMembers = personalSnap.docs
    .map((d) => d.data())
    .filter((p) => {
      const rol = String(p.rol || "").toLowerCase().trim();
      const vacaciones = p.vacaciones === true;
 
      // Excluir arquitecto
      if (rol === "arquitecto") return false;
 
      // Excluir vacaciones
      if (vacaciones) return false;
 
      // Si quieres ser más estricto:
      // return ["ingeniero de software", "ingeniero de qa"].includes(rol);
 
      return true; // incluye todo no-arquitecto y no-vacaciones
    }).length;
 
  console.log(`Equipo: ${TEAM_ID}`);
  console.log(`Integrantes esperados (personal): ${expectedMembers}`);
 
  // 3) Listar sprints
  const sprintsSnap = await db.collection(`equipos/${TEAM_ID}/sprints`).get();
 
  const sprints = sprintsSnap.docs
    .map((doc) => {
      const n = parseSprintNumber(doc.id);
      return {
        id: doc.id,
        num: n,
        ref: doc.ref,
      };
    })
    .filter((s) => s.num !== null)
    .sort((a, b) => a.num - b.num); // asc
 
  if (!sprints.length) {
    console.log("No hay sprints para este equipo.");
    return;
  }
 
  console.log(`Sprints encontrados: ${sprints.map((s) => s.id).join(", ")}`);
 
  // 4) Para cada sprint: contar evaluados
  const sprintStatus = [];
  for (const s of sprints) {
    const integrantesSnap = await s.ref.collection("Integrantes").get();
    const evaluatedMembers = integrantesSnap.size;
 
    const isComplete = evaluatedMembers === expectedMembers;
 
    sprintStatus.push({
      ...s,
      evaluatedMembers,
      isComplete,
    });
 
    console.log(
      `[${s.id}] evaluados=${evaluatedMembers}, esperados=${expectedMembers}, completo=${isComplete}`
    );
  }
 
  // 5) Determinar el último sprint en proceso (el más alto num donde NO está completo)
  // Si todos están completos -> no hay "en proceso"
  const lastInProgress = [...sprintStatus]
    .reverse()
    .find((x) => x.isComplete === false);
 
  let cutoffNum;
  if (lastInProgress) {
    cutoffNum = lastInProgress.num;
    console.log(`Último sprint EN PROCESO detectado: ${lastInProgress.id}`);
  } else {
    cutoffNum = null;
    console.log("Todos los sprints están completos.");
  }
 
  // 6) Preparar updates: anteriores => true; el en proceso => false; posteriores => false (por seguridad)
  const updates = sprintStatus.map((s) => {
    let sprint_cerrado;
    if (cutoffNum === null) {
      sprint_cerrado = true; // todos completos
    } else if (s.num < cutoffNum) {
      sprint_cerrado = true;
    } else if (s.num === cutoffNum) {
      sprint_cerrado = false;
    } else {
      sprint_cerrado = false; // si existiera un sprint más alto creado, lo dejamos abierto
    }
 
    return { ref: s.ref, id: s.id, sprint_cerrado };
  });
 
  console.log("Cambios a aplicar:");
  updates.forEach((u) => console.log(` - ${u.id}: sprint_cerrado=${u.sprint_cerrado}`));
 
  if (DRY_RUN) {
    console.log("DRY_RUN=true -> No se escribirá nada.");
    return;
  }
 
  // 7) Escribir en batch (por si son muchos, paginamos batches de 450 aprox)
  const chunkSize = 450;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const batch = db.batch();
 
    chunk.forEach((u) => {
      batch.set(
        u.ref,
        { sprint_cerrado: u.sprint_cerrado },
        { merge: true }
      );
    });
 
    await batch.commit();
    console.log(`Batch aplicado: ${i}..${i + chunk.length - 1}`);
  }
 
  console.log("✅ Backfill completado.");
}
 
main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});