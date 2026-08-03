const { Firestore } = require("@google-cloud/firestore");

const PROJECT_ID = "bluecore-portal-gestion";
const DRY_RUN = (process.env.DRY_RUN || "").toLowerCase() === "true"; // DRY_RUN=true no escribe

const db = new Firestore({ projectId: PROJECT_ID });

function parseSprintNumber(id) {
  const m = String(id).match(/^sprint-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function sprintIdToNum(sprintId) {
  const n = parseSprintNumber(sprintId);
  return n ?? 0;
}

function isArchitect(role) {
  return String(role || "").toLowerCase().trim() === "arquitecto";
}

/**
 * Cuenta los esperados para UN sprint (sprintNum) con reglas:
 * - No arquitecto
 * - vacaciones !== true
 * - inicioReemplazoSprintId <= sprintNum (si existe)
 */
function expectedForSprint(personnelDocuments, sprintNum) {
  return personnelDocuments.filter((p) => {
    if (isArchitect(p.role)) return false;
    if (p.onVacation === true) return false;

    if (p.replacementStartSprintId) {
      const startsAt = sprintIdToNum(p.replacementStartSprintId);
      if (startsAt > sprintNum) return false;
    }
    return true;
  }).length;
}

async function backfillTeam(teamDoc) {
  const teamId = teamDoc.id;
  const teamRef = teamDoc.ref;

  // 1) Personal del equipo (una sola consulta)
  const personnelSnapshot = await db
    .collection("personal")
    .where("equipo", "==", teamRef)
    .get();

  const personnel = personnelSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 2) Sprints del equipo
  const sprintsSnap = await db.collection(`equipos/${teamId}/sprints`).get();

  const sprints = sprintsSnap.docs
    .map((d) => ({
      id: d.id,
      num: parseSprintNumber(d.id),
      ref: d.ref,
      data: d.data(),
    }))
    .filter((s) => s.num !== null)
    .sort((a, b) => a.num - b.num);

  if (sprints.length === 0) {
    console.log(`ℹ️ ${teamId}: sin sprints`);
    return;
  }

  console.log(`\n🏷️ Team: ${teamId} | sprints=${sprints.length}`);

  // 3) Detectar último sprint EN PROCESO (el más alto num donde evaluados != esperados)
  let lastInProgress = null;

  // Guardamos conteos para logs
  const status = [];

  for (const s of sprints) {
    const membersSnapshot = await s.ref.collection("Integrantes").get();
    const evaluatedMembers = membersSnapshot.size;

    const esperados = expectedForSprint(personnel, s.num);
    const completo = evaluatedMembers === esperados;

    status.push({ ...s, evaluatedMembers, esperados, completo });

    console.log(
      ` - ${s.id}: evaluatedMembers=${evaluatedMembers} esperados=${esperados} completo=${completo}`
    );

    if (!completo) lastInProgress = s; // va quedando el más alto incompleto
  }

  // 4) Preparar writes:
  // - Si hay lastInProgress: anteriores true, ese false, posteriores false
  // - Si no hay: todos true
  const updates = status.map((s) => {
    let cerrado = true;

    if (lastInProgress) {
      if (s.num < lastInProgress.num) cerrado = true;
      else cerrado = false;
    } else {
      cerrado = true;
    }

    return { ref: s.ref, id: s.id, sprint_cerrado: cerrado };
  });

  console.log(
    lastInProgress
      ? ` 👉 Último sprint en proceso: ${lastInProgress.id} (se marcará false)`
      : ` ✅ Todos completos: se marcarán true`
  );

  if (DRY_RUN) {
    console.log("   (DRY_RUN=true) No se escriben cambios.");
    return;
  }

  // 5) Batch commit (por equipo)
  const batch = db.batch();
  updates.forEach((u) => {
    batch.set(u.ref, { sprint_cerrado: u.sprint_cerrado }, { merge: true });
  });
  await batch.commit();

  console.log(`✅ ${teamId}: actualizado sprint_cerrado en ${updates.length} sprints`);
}

async function run() {
  console.log(`Proyecto: ${PROJECT_ID}`);
  console.log(`DRY_RUN: ${DRY_RUN}\n`);

  // Traer todos los equipos
  const teamsSnapshot = await db.collection("equipos").get();
  const teams = teamsSnapshot.docs;

  console.log(`Teams encontrados: ${teams.length}`);

  // Procesar en serie (más seguro para no saturar)
  for (const teamDoc of teams) {
    try {
      await backfillTeam(teamDoc);
    } catch (e) {
      console.error(`❌ Error en team ${teamDoc.id}:`, e?.message || e);
    }
  }

  console.log("\n🏁 Backfill global terminado.");
}

run().catch((err) => {
  console.error("❌ Error global:", err);
  process.exit(1);
});
